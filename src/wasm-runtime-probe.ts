import { CapabilityState, WebCapabilities } from './web-capabilities';
import WORKER_SRC from './wasm-runtime-probe.worker';

/** Outcome of {@link WasmRuntimeProbe.check}. */
export enum WasmRuntimeStatus {
  /** WASM runs at full JIT speed. */
  OK = 'ok',
  /** WASM runs through a slow interpreter (too slow for real-time effects). */
  SLOW = 'slow',
  /** WASM missing or will not compile. */
  DISABLED = 'disabled',
  /** Measurements disagree; do not treat as a confident slow or fast. */
  UNCERTAIN = 'uncertain',
  /** Probe could not run (no Worker, timeout, background tab, bad sample). */
  UNKNOWN = 'unknown',
}

/**
 * Probe result for real-time WASM effects (BNR, VBG). Includes raw metrics so
 * callers can change thresholds without re-running the benchmark.
 */
export interface WasmRuntimeResult {
  status: WasmRuntimeStatus;
  capability: CapabilityState;
  /** Divide median divided by add median (main JIT vs interpreter signal). */
  divRatio: number | null;
  /** Sqrt median divided by add median (second unit, helps some CPUs). */
  sqrtRatio: number | null;
  /** Nanoseconds per add op; scales with clock, used as a slow hint only. */
  addNsPerOp: number | null;
  addMedianMs: number | null;
  divMedianMs: number | null;
  sqrtMedianMs: number | null;
}

// Lab calibration: Intel Mac + Windows, four engines, JIT on/off, throttled runs.
const DIV_FAST_RATIO = 4.0;
const DIV_SLOW_RATIO = 3.0;
// Sqrt/add runs higher than div/add on both JIT and interpreter; needs its own bar.
const SQRT_FAST_RATIO = 8.0;
// Interpreter adds are absolutely slower; never overrides a fast ratio alone.
const INTERP_ADD_NS_FLOOR = 1.2;
// Div is multi-cycle; below this median the timed loop likely did not really run.
const MIN_DIV_MEDIAN_MS = 8;
// ~16M ops x 5 trials; throttled interpreter needed ~3.4s in lab.
const WORKER_TIMEOUT_MS = 8000;

/**
 * Maps probe status to capability. UNCERTAIN stays UNKNOWN so we do not false-block.
 *
 * @param status - The probe {@link WasmRuntimeStatus}.
 * @returns The corresponding {@link CapabilityState}.
 */
const statusToCapability = (status: WasmRuntimeStatus): CapabilityState => {
  switch (status) {
    case WasmRuntimeStatus.OK:
      return CapabilityState.CAPABLE;
    case WasmRuntimeStatus.SLOW:
    case WasmRuntimeStatus.DISABLED:
      return CapabilityState.NOT_CAPABLE;
    default:
      return CapabilityState.UNKNOWN;
  }
};

interface WorkerReply {
  ok: boolean;
  ops?: number;
  addMedianMs?: number;
  divMedianMs?: number;
  sqrtMedianMs?: number;
}

/**
 * Detects whether WASM runs at JIT speed or through a slow interpreter (for example
 * Edge with JIT disabled by policy). Uses a quick disabled check, then a Worker
 * benchmark. Result is cached for the page lifetime.
 */
export class WasmRuntimeProbe {
  private static cachedResult?: Promise<WasmRuntimeResult>;

  /**
   * Runs the probe once per page (cached). Compares WASM op-cost ratios from a Worker;
   * under a slow interpreter both div/add and sqrt/add collapse near ~2 and status is
   * {@link WasmRuntimeStatus.SLOW}.
   *
   * @returns A promise that resolves with the {@link WasmRuntimeResult}.
   */
  static check(): Promise<WasmRuntimeResult> {
    if (!this.cachedResult) {
      this.cachedResult = this.run();
    }
    return this.cachedResult;
  }

  /**
   * Assembles a {@link WasmRuntimeResult} from status and optional worker metrics.
   *
   * @param status - Classified status.
   * @param metrics - Optional raw timings from the worker.
   * @param metrics.divRatio - Divide median divided by add median.
   * @param metrics.sqrtRatio - Sqrt median divided by add median.
   * @param metrics.addNsPerOp - Nanoseconds per add op.
   * @param metrics.addMedianMs - Median add kernel time in ms.
   * @param metrics.divMedianMs - Median div kernel time in ms.
   * @param metrics.sqrtMedianMs - Median sqrt kernel time in ms.
   * @returns Assembled {@link WasmRuntimeResult}.
   */
  private static buildResult(
    status: WasmRuntimeStatus,
    metrics?: {
      divRatio?: number;
      sqrtRatio?: number;
      addNsPerOp?: number;
      addMedianMs?: number;
      divMedianMs?: number;
      sqrtMedianMs?: number;
    }
  ): WasmRuntimeResult {
    return {
      status,
      capability: statusToCapability(status),
      divRatio: metrics?.divRatio ?? null,
      sqrtRatio: metrics?.sqrtRatio ?? null,
      addNsPerOp: metrics?.addNsPerOp ?? null,
      addMedianMs: metrics?.addMedianMs ?? null,
      divMedianMs: metrics?.divMedianMs ?? null,
      sqrtMedianMs: metrics?.sqrtMedianMs ?? null,
    };
  }

  /**
   * Disabled check, then Worker benchmark with timeout and cleanup.
   *
   * @returns Classified probe result.
   */
  private static async run(): Promise<WasmRuntimeResult> {
    if (WebCapabilities.supportsWasm() === CapabilityState.NOT_CAPABLE) {
      return this.buildResult(WasmRuntimeStatus.DISABLED);
    }

    if (
      WebCapabilities.supportsWorker() === CapabilityState.NOT_CAPABLE ||
      typeof URL === 'undefined' ||
      !URL.createObjectURL
    ) {
      return this.buildResult(WasmRuntimeStatus.UNKNOWN);
    }

    const started = this.startWorker();
    if (!started) {
      return this.buildResult(WasmRuntimeStatus.UNKNOWN);
    }

    const { worker, url } = started;
    try {
      // eslint-disable-next-line jsdoc/require-jsdoc
      const msg = await new Promise<WorkerReply>((resolve) => {
        const timer = setTimeout(() => resolve({ ok: false }), WORKER_TIMEOUT_MS);
        // eslint-disable-next-line jsdoc/require-jsdoc
        worker.onmessage = (e: MessageEvent<WorkerReply>) => {
          clearTimeout(timer);
          resolve(e.data);
        };
        // eslint-disable-next-line jsdoc/require-jsdoc
        worker.onerror = () => {
          clearTimeout(timer);
          resolve({ ok: false });
        };
        worker.postMessage('start');
      });

      return this.classify(msg);
    } finally {
      worker.terminate();
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Classifies worker medians. Fast div or sqrt ratio wins unless absolute add cost
   * contradicts it ({@link WasmRuntimeStatus.UNCERTAIN}).
   *
   * @param msg - Raw worker reply.
   * @returns Classified result with rounded metrics.
   */
  private static classify(msg: WorkerReply): WasmRuntimeResult {
    if (
      !msg.ok ||
      typeof msg.ops !== 'number' ||
      msg.ops <= 0 ||
      typeof msg.addMedianMs !== 'number' ||
      msg.addMedianMs <= 0 ||
      typeof msg.divMedianMs !== 'number' ||
      typeof msg.sqrtMedianMs !== 'number'
    ) {
      return this.buildResult(WasmRuntimeStatus.UNKNOWN);
    }

    const { addMedianMs, divMedianMs, sqrtMedianMs } = msg;
    // eslint-disable-next-line jsdoc/require-jsdoc
    const round3 = (v: number): number => Number(v.toFixed(3));

    const divRatio = divMedianMs / addMedianMs;
    const sqrtRatio = sqrtMedianMs / addMedianMs;
    const addNsPerOp = (addMedianMs * 1e6) / msg.ops;

    const fastSignal = divRatio >= DIV_FAST_RATIO || sqrtRatio >= SQRT_FAST_RATIO;
    const slowSignalRatio = divRatio <= DIV_SLOW_RATIO;
    const interpAbs = addNsPerOp > INTERP_ADD_NS_FLOOR;
    const workRan = divMedianMs >= MIN_DIV_MEDIAN_MS;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

    let status: WasmRuntimeStatus;
    if (hidden || !workRan) {
      status = WasmRuntimeStatus.UNKNOWN;
    } else if (fastSignal && interpAbs) {
      status = WasmRuntimeStatus.UNCERTAIN;
    } else if (fastSignal) {
      status = WasmRuntimeStatus.OK;
    } else if (slowSignalRatio || interpAbs) {
      status = WasmRuntimeStatus.SLOW;
    } else {
      status = WasmRuntimeStatus.UNCERTAIN;
    }

    return this.buildResult(status, {
      divRatio: round3(divRatio),
      sqrtRatio: round3(sqrtRatio),
      addNsPerOp: round3(addNsPerOp),
      addMedianMs: round3(addMedianMs),
      divMedianMs: round3(divMedianMs),
      sqrtMedianMs: round3(sqrtMedianMs),
    });
  }

  /**
   * Creates a Worker from the inlined benchmark source.
   *
   * @returns Worker plus Blob URL, or undefined if creation fails.
   */
  private static startWorker(): { worker: Worker; url: string } | undefined {
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      return { worker: new Worker(url), url };
    } catch {
      if (url) URL.revokeObjectURL(url);
      return undefined;
    }
  }
}
