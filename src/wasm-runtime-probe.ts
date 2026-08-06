import { CapabilityState, WebCapabilities } from './web-capabilities';
import WORKER_SRC from './wasm-runtime-probe.worker';

/** Possible results of the WASM runtime probe. */
export enum WasmRuntimeStatus {
  /** Engine runs WASM at full JIT (native) speed. */
  OK = 'ok',
  /** Engine interprets WASM (e.g. Edge with JIT disabled by policy) — too slow for real-time effects. */
  SLOW = 'slow',
  /** WASM is missing or refuses to compile. */
  DISABLED = 'disabled',
  /** Signals conflicted (a throttled-but-healthy JIT, or a slow-divider interpreter) — the probe won't guess. */
  UNCERTAIN = 'uncertain',
  /** The probe could not run or measure (no Worker, background tab, timeout, error). */
  UNKNOWN = 'unknown',
}

/**
 * Result of the WASM runtime probe. Used to decide whether to allow real-time
 * WASM effects (BNR, VBG), which run poorly when the browser runs WASM through a
 * slow interpreter.
 *
 * The probe is a pure SENSOR: it emits a status plus the raw, hardware-independent
 * metrics so callers can re-threshold per feature without re-running it.
 */
export interface WasmRuntimeResult {
  status: WasmRuntimeStatus;
  capability: CapabilityState;
  /** Div/add op-cost ratio — the primary discriminator (JIT high, interpreter ~2). */
  divRatio: number | null;
  /** Sqrt/add op-cost ratio — a second, independent-unit signal (fast-divider rescue). */
  sqrtRatio: number | null;
  /** Absolute cost of the cheap `add` op in ns/op (hardware-DEPENDENT; interpreter tell). */
  addNsPerOp: number | null;
  /** Median time (ms) of the cheap `add` kernel. */
  addMedianMs: number | null;
  /** Median time (ms) of the costly integer `div` kernel. */
  divMedianMs: number | null;
  /** Median time (ms) of the costly FP `sqrt` kernel. */
  sqrtMedianMs: number | null;
}

// --- Calibrated thresholds (Intel Mac + Windows, 4 engines, JIT on/off, throttled) ---
// div/add is the PRIMARY discriminator (JIT 5.4-33 vs interpreter 1.8-2.4).
const DIV_FAST_RATIO = 4.0; // div/add >= this => native code
const DIV_SLOW_RATIO = 3.0; // div/add <= this => interpreter
// sqrt/add is a SECONDARY rescue for a fast-divider CPU (e.g. Apple Silicon). It
// runs ~2x higher than div on BOTH sides (JIT 12-20 vs interp 3.4-4.5), so it
// needs its OWN, higher bar — reusing div's 4.0 here caused a false 'fast'.
const SQRT_FAST_RATIO = 8.0; // sqrt/add >= this => native code (div may have sagged)
// Absolute add cost floor (ns/op). JIT 0.06-0.48 vs interpreter 2.0-2.5. This
// signal is hardware-DEPENDENT (scales with clock), so it only ever ADDS a slow
// vote or flags a contradiction — it never overrides a fast ratio.
const INTERP_ADD_NS_FLOOR = 1.2;
// The integer div kernel is always multi-cycle; if its median is below this the
// loop didn't really run (timer floor / hostile embedder) — treat as unmeasured.
const MIN_DIV_MEDIAN_MS = 8;

// The op-cost probe runs ~16M ops x 5 trials; a heavily throttled interpreter
// measured ~3.4s, so allow generous headroom.
const WORKER_TIMEOUT_MS = 8000;

/**
 * Maps a probe status to a CAPABLE/NOT_CAPABLE verdict.
 *
 * Only a confident SLOW/DISABLED blocks WASM effects. UNCERTAIN maps to UNKNOWN
 * so the feature keeps its own default (enable) rather than false-blocking a
 * real user whose signals merely conflicted.
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
  addMinMs?: number;
  divMinMs?: number;
  sqrtMinMs?: number;
  checkAdd?: number;
  checkDiv?: number;
  checkSqrt?: number;
}

/**
 * Checks whether this browser runs WebAssembly at full (JIT) speed or through a
 * slow interpreter, by comparing the cost of cheap vs expensive WASM ops. This
 * catches the case where WASM is present but too slow for real-time effects
 * (e.g. Edge with JIT turned off). The quick "disabled" check is instant; the
 * timed benchmark runs off the main thread. The result is cached, so it runs at
 * most once per page.
 */
export class WasmRuntimeProbe {
  private static cachedResult?: Promise<WasmRuntimeResult>;

  /**
   * Runs the probe (cached per page) and resolves with the classified result.
   *
   * Times three dependent-chain WASM kernels (add / div / sqrt) off the main
   * thread and compares them as ratios (div/add, sqrt/add). A ratio cancels out
   * raw CPU speed, so it describes the engine, not the machine: under a slow
   * interpreter both ratios collapse to ~2 and the probe reports
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
   * Builds a {@link WasmRuntimeResult} from a status and optional raw metrics.
   *
   * @param status - The classified {@link WasmRuntimeStatus}.
   * @param metrics - Optional raw op-cost metrics to include.
   * @param metrics.divRatio - The div/add op-cost ratio.
   * @param metrics.sqrtRatio - The sqrt/add op-cost ratio.
   * @param metrics.addNsPerOp - The absolute cost of `add` in ns/op.
   * @param metrics.addMedianMs - Median time of the `add` kernel.
   * @param metrics.divMedianMs - Median time of the `div` kernel.
   * @param metrics.sqrtMedianMs - Median time of the `sqrt` kernel.
   * @returns The assembled {@link WasmRuntimeResult}.
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
   * Runs the checks in order: the instant "disabled" check, then the timed Worker benchmark.
   *
   * @returns A promise that resolves with the {@link WasmRuntimeResult}.
   */
  private static async run(): Promise<WasmRuntimeResult> {
    if (WebCapabilities.supportsWasm() === CapabilityState.NOT_CAPABLE) {
      return this.buildResult(WasmRuntimeStatus.DISABLED);
    }

    // Can't run the benchmark without a Web Worker and a Blob URL.
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
   * Turns the worker's raw measurements into a status + metrics.
   *
   * Div/add is the primary discriminator; sqrt/add is an independent-unit rescue
   * for a fast-divider CPU; the absolute add cost is a one-way interpreter tell.
   * When a fast ratio and an interpreter-slow add disagree we return UNCERTAIN
   * rather than guess.
   *
   * @param msg - The {@link WorkerReply} from the benchmark worker.
   * @returns The classified {@link WasmRuntimeResult}.
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
    /**
     * Rounds a metric to 3 decimals for the report.
     *
     * @param v - The value to round.
     * @returns The value rounded to 3 decimal places.
     */
    const round = (v: number): number => Number(v.toFixed(3));

    const divRatio = divMedianMs / addMedianMs;
    const sqrtRatio = sqrtMedianMs / addMedianMs;
    const addNsPerOp = (addMedianMs * 1e6) / msg.ops;

    // Ratios are hardware-INDEPENDENT; addNsPerOp is hardware-dependent.
    const fastSignal = divRatio >= DIV_FAST_RATIO || sqrtRatio >= SQRT_FAST_RATIO;
    const slowSignalRatio = divRatio <= DIV_SLOW_RATIO;
    const interpAbs = addNsPerOp > INTERP_ADD_NS_FLOOR;
    // A background-throttled tab can starve the worker; div is always multi-cycle,
    // so a tiny div median means nothing measurable really executed.
    const workRan = divMedianMs >= MIN_DIV_MEDIAN_MS;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

    let status: WasmRuntimeStatus;
    if (hidden || !workRan) {
      status = WasmRuntimeStatus.UNKNOWN;
    } else if (fastSignal && interpAbs) {
      // Contradiction: a ratio looks native, but `add` is absolutely interpreter-slow.
      // Happens on a throttled JIT machine OR a slow-divider interpreter — don't guess.
      status = WasmRuntimeStatus.UNCERTAIN;
    } else if (fastSignal) {
      status = WasmRuntimeStatus.OK;
    } else if (slowSignalRatio || interpAbs) {
      status = WasmRuntimeStatus.SLOW;
    } else {
      status = WasmRuntimeStatus.UNCERTAIN;
    }

    return this.buildResult(status, {
      divRatio: round(divRatio),
      sqrtRatio: round(sqrtRatio),
      addNsPerOp: round(addNsPerOp),
      addMedianMs: round(addMedianMs),
      divMedianMs: round(divMedianMs),
      sqrtMedianMs: round(sqrtMedianMs),
    });
  }

  /**
   * Starts the benchmark worker from the inline source (via a Blob URL).
   *
   * @returns The worker and its Blob URL, or undefined if creation fails.
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
