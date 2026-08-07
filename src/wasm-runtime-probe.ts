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
  WORKER_UNAVAILABLE = 'worker_unavailable',
  WORKER_START_FAILED = 'worker_start_failed',
  WORKER_TIMEOUT = 'worker_timeout',
  WORKER_RUNTIME_ERROR = 'worker_runtime_error',
  WORKER_BENCHMARK_FAILED = 'worker_benchmark_failed',
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

/** Additional context for an unknown or uncertain result. */
export type WasmRuntimeReason = WasmRuntimeUnknownReason | WasmRuntimeUncertainReason;

/** Measurements produced by a completed benchmark. */
export interface WasmRuntimeMeasurements {
  /** Divide time relative to add time. */
  divRatio: number;
  /** Square root time relative to add time. */
  sqrtRatio: number;
  /** Time for one add operation in nanoseconds. */
  addNsPerOp: number;
  /** Typical add benchmark time in milliseconds. */
  addMedianMs: number;
  /** Typical divide benchmark time in milliseconds. */
  divMedianMs: number;
  /** Typical square root benchmark time in milliseconds. */
  sqrtMedianMs: number;
}

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
  /** Additional context for an unknown or uncertain status. */
  reason: WasmRuntimeReason | null;
  /** Benchmark measurements when useful data was produced. */
  measurements: WasmRuntimeMeasurements | null;
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

/**
 * Checks that a worker response contains complete, usable measurements.
 *
 * @param response - Worker response to validate.
 * @returns Whether every measurement is finite and positive.
 */
const hasValidMeasurements = (response: WorkerResponse): response is Required<WorkerResponse> =>
  [response.ops, response.addMedianMs, response.divMedianMs, response.sqrtMedianMs].every(
    (value) => typeof value === 'number' && Number.isFinite(value) && value > 0
  );

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
   * Derives capability while keeping result construction in one place.
   *
   * @param status - Classified status.
   * @param reason - Additional result context.
   * @param measurements - Useful benchmark measurements.
   * @returns Assembled {@link WasmRuntimeResult}.
   */
  private static buildResult(
    status: WasmRuntimeStatus,
    reason: WasmRuntimeReason | null = null,
    measurements: WasmRuntimeMeasurements | null = null
  ): WasmRuntimeResult {
    return {
      status,
      capability: statusToCapability(status),
      reason,
      measurements,
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
        WasmRuntimeUnknownReason.WORKER_UNAVAILABLE
      );
    }

    const started = this.startWorker();
    if (!started) {
      return this.buildResult(
        WasmRuntimeStatus.UNKNOWN,
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
        return this.buildResult(WasmRuntimeStatus.UNKNOWN, outcome.reason);
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
        WasmRuntimeUnknownReason.WORKER_BENCHMARK_FAILED
      );
    }

    if (!hasValidMeasurements(response)) {
      return this.buildResult(
        WasmRuntimeStatus.UNKNOWN,
        WasmRuntimeUnknownReason.INVALID_MEASUREMENT
      );
    }

    const { addMedianMs, divMedianMs, sqrtMedianMs } = response;
    // eslint-disable-next-line jsdoc/require-jsdoc
    const roundToThreeDecimals = (value: number): number => Number(value.toFixed(3));

    const divRatio = divMedianMs / addMedianMs;
    const sqrtRatio = sqrtMedianMs / addMedianMs;
    const addNsPerOp = (addMedianMs * 1e6) / response.ops;

    const hasFastRatio = divRatio >= DIV_FAST_RATIO || sqrtRatio >= SQRT_FAST_RATIO;
    const hasSlowDivideRatio = divRatio <= DIV_SLOW_RATIO;
    const hasSlowAddCost = addNsPerOp > INTERP_ADD_NS_FLOOR;
    const hasSufficientDivideTiming = divMedianMs >= MIN_DIV_MEDIAN_MS;
    const isPageHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

    let status: WasmRuntimeStatus;
    let reason: WasmRuntimeReason | null = null;
    if (isPageHidden) {
      status = WasmRuntimeStatus.UNKNOWN;
      reason = WasmRuntimeUnknownReason.BACKGROUND_TAB;
    } else if (!hasSufficientDivideTiming) {
      status = WasmRuntimeStatus.UNKNOWN;
      reason = WasmRuntimeUnknownReason.TIMING_SAMPLE_TOO_SMALL;
    } else if (hasFastRatio && hasSlowAddCost) {
      status = WasmRuntimeStatus.UNCERTAIN;
      reason = WasmRuntimeUncertainReason.FAST_RATIO_SLOW_ADD;
    } else if (hasFastRatio) {
      status = WasmRuntimeStatus.OK;
    } else if (hasSlowDivideRatio || hasSlowAddCost) {
      status = WasmRuntimeStatus.SLOW;
    } else {
      status = WasmRuntimeStatus.UNCERTAIN;
      reason = WasmRuntimeUncertainReason.RATIOS_BETWEEN_THRESHOLDS;
    }

    return this.buildResult(status, reason, {
      divRatio: roundToThreeDecimals(divRatio),
      sqrtRatio: roundToThreeDecimals(sqrtRatio),
      addNsPerOp: roundToThreeDecimals(addNsPerOp),
      addMedianMs: roundToThreeDecimals(addMedianMs),
      divMedianMs: roundToThreeDecimals(divMedianMs),
      sqrtMedianMs: roundToThreeDecimals(sqrtMedianMs),
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
