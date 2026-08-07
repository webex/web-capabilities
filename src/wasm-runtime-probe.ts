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
  /** Measurements do not clearly classify WASM as fast or slow. See {@link WasmRuntimeResult.uncertainReason}. */
  UNCERTAIN = 'uncertain',
  /** Probe could not complete or validate a measurement. See {@link WasmRuntimeResult.unknownReason}. */
  UNKNOWN = 'unknown',
}

/** Why {@link WasmRuntimeStatus.UNKNOWN} was returned. Set only when status is unknown. */
export enum WasmRuntimeUnknownReason {
  /** No Web Worker or Blob URL support in this environment. */
  WORKER_UNAVAILABLE = 'worker_unavailable',
  /** Worker or Blob URL creation threw. */
  WORKER_START_FAILED = 'worker_start_failed',
  /** Benchmark did not finish before the configured worker timeout. */
  WORKER_TIMEOUT = 'worker_timeout',
  /** Worker onerror or ok false from the benchmark script. */
  WORKER_BENCHMARK_FAILED = 'worker_benchmark_failed',
  /** Worker response is incomplete or contains an invalid timing. */
  INVALID_MEASUREMENT = 'invalid_measurement',
  /** Page was hidden during the benchmark, which can distort its timing. */
  BACKGROUND_TAB = 'background_tab',
  /** Divide benchmark finished too quickly to classify the runtime. */
  TIMING_SAMPLE_TOO_SMALL = 'timing_sample_too_small',
}

/** Why {@link WasmRuntimeStatus.UNCERTAIN} was returned. Set only when status is uncertain. */
export enum WasmRuntimeUncertainReason {
  /** Divide or sqrt ratio indicates fast WASM, but add cost indicates slow WASM. */
  FAST_RATIO_SLOW_ADD = 'fast_ratio_slow_add',
  /** Ratios are neither clearly fast nor clearly slow. */
  RATIOS_BETWEEN_THRESHOLDS = 'ratios_between_thresholds',
}

/** Human-readable explanation included with uncertain measurements. */
const UNCERTAIN_DETAIL_PREFIX = 'Measurements do not clearly classify WASM as fast or slow.';

/**
 * Formats an uncertain result for logs and telemetry.
 *
 * @param metrics - Measurements used to classify the WASM runtime.
 * @param metrics.divRatio - Divide time relative to add time.
 * @param metrics.sqrtRatio - Square root time relative to add time.
 * @param metrics.addNsPerOp - Time for one add operation in nanoseconds.
 * @param metrics.addMedianMs - Typical add benchmark time in milliseconds.
 * @param metrics.divMedianMs - Typical divide benchmark time in milliseconds.
 * @param metrics.sqrtMedianMs - Typical square root benchmark time in milliseconds.
 * @returns A generic explanation followed by the measurement values.
 */
const formatUncertainDetail = (metrics: {
  divRatio: number;
  sqrtRatio: number;
  addNsPerOp: number;
  addMedianMs: number;
  divMedianMs: number;
  sqrtMedianMs: number;
}): string =>
  `${UNCERTAIN_DETAIL_PREFIX} divRatio=${metrics.divRatio}, sqrtRatio=${metrics.sqrtRatio}, addNsPerOp=${metrics.addNsPerOp}, addMedianMs=${metrics.addMedianMs}ms, divMedianMs=${metrics.divMedianMs}ms, sqrtMedianMs=${metrics.sqrtMedianMs}ms`;

/**
 * Result of the WASM runtime probe. Used to decide whether to allow real-time
 * WASM effects (BNR, VBG), which run poorly when the browser runs WASM through a
 * slow interpreter.
 */
export interface WasmRuntimeResult {
  /** Probe classification. */
  status: WasmRuntimeStatus;
  /** Capability derived from the probe classification. */
  capability: CapabilityState;
  /** Reason the probe could not complete or validate a measurement. */
  unknownReason: WasmRuntimeUnknownReason | null;
  /** Reason the measurements did not clearly indicate fast or slow WASM. */
  uncertainReason: WasmRuntimeUncertainReason | null;
  /** Human-readable uncertainty explanation with measurements for logs and telemetry. */
  uncertainDetail: string | null;
  /** Divide time relative to add time. High suggests JIT. Low near 2 suggests an interpreter. */
  divRatio: number | null;
  /**
   * Square root time relative to add time. Uses a different CPU execution unit than
   * divide, providing an independent signal.
   */
  sqrtRatio: number | null;
  /** Time for one add operation in nanoseconds. Used as a slow signal, but not to mark OK. */
  addNsPerOp: number | null;
  /** Typical add benchmark time in milliseconds. */
  addMedianMs: number | null;
  /** Typical divide benchmark time in milliseconds. */
  divMedianMs: number | null;
  /** Typical square root benchmark time in milliseconds. */
  sqrtMedianMs: number | null;
}

// Calibration values used to classify the benchmark measurements.
/** Divide ratio at or above this value indicates fast WASM. */
const DIV_FAST_RATIO = 4.0;
/** Divide ratio at or below this value indicates slow WASM. */
const DIV_SLOW_RATIO = 3.0;
/** Square root ratio at or above this value provides another fast WASM signal. */
const SQRT_FAST_RATIO = 8.0;
/** Add cost above this value indicates slow WASM unless a fast ratio disagrees. */
const INTERP_ADD_NS_FLOOR = 1.2;
/** Divide samples below this duration are too short to classify. */
const MIN_DIV_MEDIAN_MS = 8;
/** Maximum time allowed for the worker benchmark to finish. */
const WORKER_TIMEOUT_MS = 8000;

/**
 * Maps probe status to capability. Uncertain stays unknown capability so we do not
 * false-block effects.
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

type WorkerBenchOutcome =
  | { type: 'reply'; data: WorkerReply }
  | { type: 'fail'; reason: WasmRuntimeUnknownReason };

/**
 * Tells whether WASM is fast enough for real-time effects (for example BNR on Edge
 * when JIT is off). Runs a quick WASM disabled check, then a Worker benchmark.
 * Cached once per page load.
 */
export class WasmRuntimeProbe {
  private static cachedResult?: Promise<WasmRuntimeResult>;

  /**
   * Runs the probe once per page (cached). The Worker times add, div, and sqrt in
   * WASM and the main thread compares ratios. Slow interpreter engines collapse both
   * ratios near 2 and status becomes {@link WasmRuntimeStatus.SLOW}.
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
   * Builds a {@link WasmRuntimeResult} from status, optional metrics, and optional
   * unknown reason.
   *
   * @param status - Classified status.
   * @param metrics - Optional raw timings from the worker.
   * @param metrics.divRatio - Divide median divided by add median.
   * @param metrics.sqrtRatio - Sqrt median divided by add median.
   * @param metrics.addNsPerOp - Nanoseconds per add op.
   * @param metrics.addMedianMs - Median add kernel time in ms.
   * @param metrics.divMedianMs - Median div kernel time in ms.
   * @param metrics.sqrtMedianMs - Median sqrt kernel time in ms.
   * @param unknownReason - Set when status is {@link WasmRuntimeStatus.UNKNOWN}.
   * @param uncertainReason - Set when status is {@link WasmRuntimeStatus.UNCERTAIN}.
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
    },
    unknownReason?: WasmRuntimeUnknownReason,
    uncertainReason?: WasmRuntimeUncertainReason
  ): WasmRuntimeResult {
    const hasFullMetrics =
      metrics?.divRatio !== undefined &&
      metrics.sqrtRatio !== undefined &&
      metrics.addNsPerOp !== undefined &&
      metrics.addMedianMs !== undefined &&
      metrics.divMedianMs !== undefined &&
      metrics.sqrtMedianMs !== undefined;

    const uncertainDetail =
      status === WasmRuntimeStatus.UNCERTAIN && hasFullMetrics
        ? formatUncertainDetail({
            divRatio: metrics.divRatio as number,
            sqrtRatio: metrics.sqrtRatio as number,
            addNsPerOp: metrics.addNsPerOp as number,
            addMedianMs: metrics.addMedianMs as number,
            divMedianMs: metrics.divMedianMs as number,
            sqrtMedianMs: metrics.sqrtMedianMs as number,
          })
        : null;

    return {
      status,
      capability: statusToCapability(status),
      unknownReason:
        status === WasmRuntimeStatus.UNKNOWN
          ? unknownReason ?? WasmRuntimeUnknownReason.INVALID_MEASUREMENT
          : null,
      uncertainReason: status === WasmRuntimeStatus.UNCERTAIN ? uncertainReason ?? null : null,
      uncertainDetail,
      divRatio: metrics?.divRatio ?? null,
      sqrtRatio: metrics?.sqrtRatio ?? null,
      addNsPerOp: metrics?.addNsPerOp ?? null,
      addMedianMs: metrics?.addMedianMs ?? null,
      divMedianMs: metrics?.divMedianMs ?? null,
      sqrtMedianMs: metrics?.sqrtMedianMs ?? null,
    };
  }

  /**
   * WASM support check, then Worker benchmark with timeout and cleanup.
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
      return this.buildResult(
        WasmRuntimeStatus.UNKNOWN,
        undefined,
        WasmRuntimeUnknownReason.WORKER_UNAVAILABLE
      );
    }

    const started = this.startWorker();
    if (!started) {
      return this.buildResult(
        WasmRuntimeStatus.UNKNOWN,
        undefined,
        WasmRuntimeUnknownReason.WORKER_START_FAILED
      );
    }

    const { worker, url } = started;
    try {
      const outcome = await new Promise<WorkerBenchOutcome>((resolve) => {
        const timer = setTimeout(
          () => resolve({ type: 'fail', reason: WasmRuntimeUnknownReason.WORKER_TIMEOUT }),
          WORKER_TIMEOUT_MS
        );
        // eslint-disable-next-line jsdoc/require-jsdoc
        worker.onmessage = (e: MessageEvent<WorkerReply>) => {
          clearTimeout(timer);
          resolve({ type: 'reply', data: e.data });
        };
        // eslint-disable-next-line jsdoc/require-jsdoc
        worker.onerror = () => {
          clearTimeout(timer);
          resolve({ type: 'fail', reason: WasmRuntimeUnknownReason.WORKER_BENCHMARK_FAILED });
        };
        worker.postMessage('start');
      });

      if (outcome.type === 'fail') {
        return this.buildResult(WasmRuntimeStatus.UNKNOWN, undefined, outcome.reason);
      }

      return this.classify(outcome.data);
    } finally {
      worker.terminate();
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Turns worker medians into status and metrics. High div or sqrt ratio means fast
   * WASM unless absolute add cost disagrees ({@link WasmRuntimeStatus.UNCERTAIN}).
   *
   * @param msg - Raw worker reply.
   * @returns Classified result with rounded metrics.
   */
  private static classify(msg: WorkerReply): WasmRuntimeResult {
    if (!msg.ok) {
      return this.buildResult(
        WasmRuntimeStatus.UNKNOWN,
        undefined,
        WasmRuntimeUnknownReason.WORKER_BENCHMARK_FAILED
      );
    }

    if (
      typeof msg.ops !== 'number' ||
      msg.ops <= 0 ||
      typeof msg.addMedianMs !== 'number' ||
      msg.addMedianMs <= 0 ||
      typeof msg.divMedianMs !== 'number' ||
      typeof msg.sqrtMedianMs !== 'number'
    ) {
      return this.buildResult(
        WasmRuntimeStatus.UNKNOWN,
        undefined,
        WasmRuntimeUnknownReason.INVALID_MEASUREMENT
      );
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
    let unknownReason: WasmRuntimeUnknownReason | undefined;
    let uncertainReason: WasmRuntimeUncertainReason | undefined;
    if (hidden) {
      status = WasmRuntimeStatus.UNKNOWN;
      unknownReason = WasmRuntimeUnknownReason.BACKGROUND_TAB;
    } else if (!workRan) {
      status = WasmRuntimeStatus.UNKNOWN;
      unknownReason = WasmRuntimeUnknownReason.TIMING_SAMPLE_TOO_SMALL;
    } else if (fastSignal && interpAbs) {
      // Ratios indicate fast WASM while absolute add cost indicates slow WASM.
      status = WasmRuntimeStatus.UNCERTAIN;
      uncertainReason = WasmRuntimeUncertainReason.FAST_RATIO_SLOW_ADD;
    } else if (fastSignal) {
      status = WasmRuntimeStatus.OK;
    } else if (slowSignalRatio || interpAbs) {
      status = WasmRuntimeStatus.SLOW;
    } else {
      // Ratios fall between the calibrated fast and slow ranges.
      status = WasmRuntimeStatus.UNCERTAIN;
      uncertainReason = WasmRuntimeUncertainReason.RATIOS_BETWEEN_THRESHOLDS;
    }

    return this.buildResult(
      status,
      {
        divRatio: round3(divRatio),
        sqrtRatio: round3(sqrtRatio),
        addNsPerOp: round3(addNsPerOp),
        addMedianMs: round3(addMedianMs),
        divMedianMs: round3(divMedianMs),
        sqrtMedianMs: round3(sqrtMedianMs),
      },
      unknownReason,
      uncertainReason
    );
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
