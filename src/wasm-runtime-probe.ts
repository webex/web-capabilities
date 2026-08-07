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
  /** Measurements do not clearly classify WASM as fast or slow. */
  UNCERTAIN = 'uncertain',
  /** Probe could not complete or validate a measurement. */
  UNKNOWN = 'unknown',
}

/** Reasons a probe returns {@link WasmRuntimeStatus.UNKNOWN}. */
export enum WasmRuntimeUnknownReason {
  /** No Web Worker or Blob URL support in this environment. */
  WORKER_UNAVAILABLE = 'worker_unavailable',
  /** Worker or Blob URL creation threw. */
  WORKER_START_FAILED = 'worker_start_failed',
  /** Benchmark did not finish before the configured worker timeout. */
  WORKER_TIMEOUT = 'worker_timeout',
  /** Worker raised an error before returning a response. */
  WORKER_RUNTIME_ERROR = 'worker_runtime_error',
  /** Worker completed but reported that the benchmark failed. */
  WORKER_BENCHMARK_FAILED = 'worker_benchmark_failed',
  /** Worker response is incomplete or contains an invalid timing. */
  INVALID_MEASUREMENT = 'invalid_measurement',
  /** Page was hidden during the benchmark, which can distort its timing. */
  BACKGROUND_TAB = 'background_tab',
  /** Divide benchmark finished too quickly to classify the runtime. */
  TIMING_SAMPLE_TOO_SMALL = 'timing_sample_too_small',
}

/** Reasons a probe returns {@link WasmRuntimeStatus.UNCERTAIN}. */
export enum WasmRuntimeUncertainReason {
  /** Divide or sqrt ratio indicates fast WASM, but add cost indicates slow WASM. */
  FAST_RATIO_SLOW_ADD = 'fast_ratio_slow_add',
  /** Ratios are neither clearly fast nor clearly slow. */
  RATIOS_BETWEEN_THRESHOLDS = 'ratios_between_thresholds',
}

interface WasmRuntimeMeasurements {
  divRatio: number;
  sqrtRatio: number;
  addNsPerOp: number;
  addMedianMs: number;
  divMedianMs: number;
  sqrtMedianMs: number;
}

/** Keeps the human-readable uncertainty message consistent in logs and telemetry. */
const UNCERTAIN_DETAIL_PREFIX = 'Measurements do not clearly classify WASM as fast or slow.';

/**
 * Formats an uncertain result for logs and telemetry.
 *
 * @param measurements - Values used to classify the WASM runtime.
 * @returns A generic explanation followed by the measurement values.
 */
const formatUncertainDetail = (measurements: WasmRuntimeMeasurements): string =>
  `${UNCERTAIN_DETAIL_PREFIX} divRatio=${measurements.divRatio}, sqrtRatio=${measurements.sqrtRatio}, addNsPerOp=${measurements.addNsPerOp}, addMedianMs=${measurements.addMedianMs}ms, divMedianMs=${measurements.divMedianMs}ms, sqrtMedianMs=${measurements.sqrtMedianMs}ms`;

/**
 * Result of the WASM runtime probe. Used to decide whether to allow real-time
 * WASM effects (BNR, VBG), which run poorly when the browser runs WASM through a
 * slow interpreter.
 */
export interface WasmRuntimeResult {
  /** See {@link WasmRuntimeStatus}. */
  status: WasmRuntimeStatus;
  /** Product capability derived from {@link status}. */
  capability: CapabilityState;
  /** See {@link WasmRuntimeUnknownReason}. */
  unknownReason: WasmRuntimeUnknownReason | null;
  /** See {@link WasmRuntimeUncertainReason}. */
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
const WORKER_TIMEOUT_MS = 5000;

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

interface WorkerResponse {
  ok: boolean;
  ops?: number;
  addMedianMs?: number;
  divMedianMs?: number;
  sqrtMedianMs?: number;
}

type WorkerResponseOutcome =
  | { type: 'response'; response: WorkerResponse }
  | {
      type: 'no_response';
      reason:
        | WasmRuntimeUnknownReason.WORKER_TIMEOUT
        | WasmRuntimeUnknownReason.WORKER_RUNTIME_ERROR;
    };

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
   * Keeps status-specific reason and detail fields consistent.
   *
   * @param status - Classified status.
   * @param measurements - Available benchmark measurements.
   * @param unknownReason - Optional unknown result detail.
   * @param uncertainReason - Optional uncertain result detail.
   * @returns Assembled {@link WasmRuntimeResult}.
   */
  private static buildResult(
    status: WasmRuntimeStatus,
    measurements?: Partial<WasmRuntimeMeasurements>,
    unknownReason?: WasmRuntimeUnknownReason,
    uncertainReason?: WasmRuntimeUncertainReason
  ): WasmRuntimeResult {
    const hasFullMetrics =
      measurements?.divRatio !== undefined &&
      measurements.sqrtRatio !== undefined &&
      measurements.addNsPerOp !== undefined &&
      measurements.addMedianMs !== undefined &&
      measurements.divMedianMs !== undefined &&
      measurements.sqrtMedianMs !== undefined;

    const uncertainDetail =
      status === WasmRuntimeStatus.UNCERTAIN && hasFullMetrics
        ? formatUncertainDetail({
            divRatio: measurements.divRatio as number,
            sqrtRatio: measurements.sqrtRatio as number,
            addNsPerOp: measurements.addNsPerOp as number,
            addMedianMs: measurements.addMedianMs as number,
            divMedianMs: measurements.divMedianMs as number,
            sqrtMedianMs: measurements.sqrtMedianMs as number,
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
      divRatio: measurements?.divRatio ?? null,
      sqrtRatio: measurements?.sqrtRatio ?? null,
      addNsPerOp: measurements?.addNsPerOp ?? null,
      addMedianMs: measurements?.addMedianMs ?? null,
      divMedianMs: measurements?.divMedianMs ?? null,
      sqrtMedianMs: measurements?.sqrtMedianMs ?? null,
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
      const outcome = await new Promise<WorkerResponseOutcome>((resolve) => {
        const timer = setTimeout(
          () =>
            resolve({
              type: 'no_response',
              reason: WasmRuntimeUnknownReason.WORKER_TIMEOUT,
            }),
          WORKER_TIMEOUT_MS
        );
        // eslint-disable-next-line jsdoc/require-jsdoc
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          clearTimeout(timer);
          resolve({ type: 'response', response: event.data });
        };
        // eslint-disable-next-line jsdoc/require-jsdoc
        worker.onerror = () => {
          clearTimeout(timer);
          resolve({
            type: 'no_response',
            reason: WasmRuntimeUnknownReason.WORKER_RUNTIME_ERROR,
          });
        };
        worker.postMessage('start');
      });

      if (outcome.type === 'no_response') {
        return this.buildResult(WasmRuntimeStatus.UNKNOWN, undefined, outcome.reason);
      }

      return this.classify(outcome.response);
    } finally {
      worker.terminate();
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Turns worker medians into status and metrics. High div or sqrt ratio means fast
   * WASM unless absolute add cost disagrees ({@link WasmRuntimeStatus.UNCERTAIN}).
   *
   * @param response - Raw worker response.
   * @returns Classified result with rounded metrics.
   */
  private static classify(response: WorkerResponse): WasmRuntimeResult {
    if (!response.ok) {
      return this.buildResult(
        WasmRuntimeStatus.UNKNOWN,
        undefined,
        WasmRuntimeUnknownReason.WORKER_BENCHMARK_FAILED
      );
    }

    if (
      typeof response.ops !== 'number' ||
      response.ops <= 0 ||
      typeof response.addMedianMs !== 'number' ||
      response.addMedianMs <= 0 ||
      typeof response.divMedianMs !== 'number' ||
      typeof response.sqrtMedianMs !== 'number'
    ) {
      return this.buildResult(
        WasmRuntimeStatus.UNKNOWN,
        undefined,
        WasmRuntimeUnknownReason.INVALID_MEASUREMENT
      );
    }

    const { addMedianMs, divMedianMs, sqrtMedianMs } = response;
    // eslint-disable-next-line jsdoc/require-jsdoc
    const round3 = (v: number): number => Number(v.toFixed(3));

    const divRatio = divMedianMs / addMedianMs;
    const sqrtRatio = sqrtMedianMs / addMedianMs;
    const addNsPerOp = (addMedianMs * 1e6) / response.ops;

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
      status = WasmRuntimeStatus.UNCERTAIN;
      uncertainReason = WasmRuntimeUncertainReason.FAST_RATIO_SLOW_ADD;
    } else if (fastSignal) {
      status = WasmRuntimeStatus.OK;
    } else if (slowSignalRatio || interpAbs) {
      status = WasmRuntimeStatus.SLOW;
    } else {
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
