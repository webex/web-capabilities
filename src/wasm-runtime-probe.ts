import { CapabilityState, WebCapabilities } from './web-capabilities';
import WORKER_SRC from './wasm-runtime-probe.worker';

/** Possible results of the WASM runtime probe. */
export enum WasmRuntimeStatus {
  OK = 'ok',
  SLOW = 'slow',
  DISABLED = 'disabled',
  UNKNOWN = 'unknown',
}

/**
 * Result of the WASM runtime probe. Used to decide whether to allow real-time
 * WASM effects (BNR, VBG), which run poorly when the browser runs WASM through a
 * slow interpreter.
 */
export interface WasmRuntimeResult {
  status: WasmRuntimeStatus;
  capability: CapabilityState;
  ratio: number | null; // wasmMs / jsMs, kept raw so the cutoff can be tuned later
  wasmMs: number | null;
  jsMs: number | null;
}

// Calibrated cutoff for the wasm/js ratio.
const SLOW_RATIO_THRESHOLD = 0.6;
const WORKER_TIMEOUT_MS = 3000;

/**
 * Maps a probe status to a CAPABLE/NOT_CAPABLE verdict.
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
  wasmMs?: number;
  jsMs?: number;
}

/**
 * Checks whether this browser runs WebAssembly at full (JIT) speed or through a
 * slow interpreter, by timing the same loop in WASM vs JS. This catches the case
 * where WASM is present but too slow for real-time effects (e.g. Edge with JIT
 * turned off). The quick "disabled" check is instant; the timed benchmark runs
 * off the main thread. The result is cached, so it runs at most once per page.
 */
export class WasmRuntimeProbe {
  private static cachedResult?: Promise<WasmRuntimeResult>;

  /**
   * Runs the probe (cached per page) and resolves with the classified result.
   *
   * Times the same loop in WASM and JS off the main thread and compares them as a
   * ratio (wasmMs / jsMs), which normalizes for the user's CPU. When the engine
   * isn't running at full JIT speed the ratio drops below a calibrated threshold,
   * and the probe reports {@link WasmRuntimeStatus.SLOW}.
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
   * Builds a {@link WasmRuntimeResult} from a status and optional raw measurements.
   *
   * @param status - The classified {@link WasmRuntimeStatus}.
   * @param extra - Optional raw measurements to include.
   * @param extra.ratio - The wasmMs / jsMs ratio.
   * @param extra.wasmMs - The measured WASM time in milliseconds.
   * @param extra.jsMs - The measured JS time in milliseconds.
   * @returns The assembled {@link WasmRuntimeResult}.
   */
  private static buildResult(
    status: WasmRuntimeStatus,
    extra?: { ratio?: number; wasmMs?: number; jsMs?: number }
  ): WasmRuntimeResult {
    return {
      status,
      capability: statusToCapability(status),
      ratio: extra?.ratio ?? null,
      wasmMs: extra?.wasmMs ?? null,
      jsMs: extra?.jsMs ?? null,
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

      if (
        !msg.ok ||
        typeof msg.jsMs !== 'number' ||
        msg.jsMs <= 0 ||
        typeof msg.wasmMs !== 'number'
      ) {
        return this.buildResult(WasmRuntimeStatus.UNKNOWN);
      }

      const ratio = Number((msg.wasmMs / msg.jsMs).toFixed(2));
      const status = ratio < SLOW_RATIO_THRESHOLD ? WasmRuntimeStatus.SLOW : WasmRuntimeStatus.OK;
      return this.buildResult(status, {
        ratio,
        wasmMs: Number(msg.wasmMs.toFixed(2)),
        jsMs: Number(msg.jsMs.toFixed(2)),
      });
    } finally {
      worker.terminate();
      URL.revokeObjectURL(url);
    }
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
