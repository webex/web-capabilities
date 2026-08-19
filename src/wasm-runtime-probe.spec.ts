import {
  WasmRuntimeProbe,
  WasmRuntimeStatus,
  WasmRuntimeUncertainReason,
  WasmRuntimeUnknownReason,
} from './wasm-runtime-probe';
import { CapabilityState } from './web-capabilities';

interface MockWorkerResponse {
  ok: boolean;
  ops?: number;
  addMedianMs?: number;
  divMedianMs?: number;
  sqrtMedianMs?: number;
}

const TOTAL_OPERATIONS = 16_000_000;

const FAST_BENCHMARK_RESPONSE: MockWorkerResponse = {
  ok: true,
  ops: TOTAL_OPERATIONS,
  addMedianMs: 6.5,
  divMedianMs: 35.6,
  sqrtMedianMs: 80.6,
};
const SLOW_BENCHMARK_RESPONSE: MockWorkerResponse = {
  ok: true,
  ops: TOTAL_OPERATIONS,
  addMedianMs: 32.1,
  divMedianMs: 60.6,
  sqrtMedianMs: 111.5,
};

let workerResponse: MockWorkerResponse | undefined;
let shouldRaiseWorkerRuntimeError = false;
let shouldFailWorkerConstruction = false;
let workerConstructionCount = 0;

/** Mock Worker controlled by test state. */
class MockWorker {
  onmessage: ((event: { data: MockWorkerResponse }) => void) | null = null;

  onerror: (() => void) | null = null;

  /** Creates a worker or simulates a construction failure. */
  constructor() {
    workerConstructionCount += 1;
    if (shouldFailWorkerConstruction) {
      throw new Error('Worker construction failed');
    }
  }

  /** Delivers the configured worker outcome. */
  postMessage(): void {
    if (shouldRaiseWorkerRuntimeError && this.onerror) {
      this.onerror();
    } else if (workerResponse && this.onmessage) {
      this.onmessage({ data: workerResponse });
    }
  }

  /** Matches the Worker API without test cleanup. */
  // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-empty-function
  terminate(): void {}
}

describe('WasmRuntimeProbe', () => {
  const originalWebAssembly = globalThis.WebAssembly;

  beforeEach(() => {
    (WasmRuntimeProbe as unknown as { cachedResult?: unknown }).cachedResult = undefined;
    workerResponse = undefined;
    shouldRaiseWorkerRuntimeError = false;
    shouldFailWorkerConstruction = false;
    workerConstructionCount = 0;
  });

  afterEach(() => {
    (globalThis as { WebAssembly?: typeof WebAssembly }).WebAssembly = originalWebAssembly;
  });

  it('should return DISABLED when WebAssembly is unavailable', async () => {
    expect.assertions(1);
    delete (globalThis as { WebAssembly?: typeof WebAssembly }).WebAssembly;

    const result = await WasmRuntimeProbe.check();

    expect(result).toMatchObject({
      status: WasmRuntimeStatus.DISABLED,
      capability: CapabilityState.NOT_CAPABLE,
      reason: null,
      measurements: null,
    });
  });

  it('should return UNKNOWN when Web Workers are unavailable', async () => {
    expect.assertions(1);

    const result = await WasmRuntimeProbe.check();

    expect(result).toMatchObject({
      status: WasmRuntimeStatus.UNKNOWN,
      capability: CapabilityState.UNKNOWN,
      reason: WasmRuntimeUnknownReason.WORKER_UNAVAILABLE,
      measurements: null,
    });
  });

  describe('worker benchmark', () => {
    beforeEach(() => {
      Object.defineProperty(globalThis, 'Worker', {
        writable: true,
        configurable: true,
        value: MockWorker,
      });
      Object.defineProperty(URL, 'createObjectURL', {
        writable: true,
        configurable: true,
        value: jest.fn(() => 'blob:mock'),
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        writable: true,
        configurable: true,
        value: jest.fn(),
      });
    });

    afterEach(() => {
      delete (globalThis as { Worker?: unknown }).Worker;
      delete (URL as { createObjectURL?: unknown }).createObjectURL;
      delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
    });

    it('should revoke the Blob URL when Worker construction fails', async () => {
      expect.assertions(2);
      shouldFailWorkerConstruction = true;

      const result = await WasmRuntimeProbe.check();

      expect(result).toMatchObject({
        status: WasmRuntimeStatus.UNKNOWN,
        reason: WasmRuntimeUnknownReason.WORKER_START_FAILED,
        measurements: null,
      });
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    });

    it('should return OK when measurements indicate fast WASM', async () => {
      expect.assertions(1);
      workerResponse = FAST_BENCHMARK_RESPONSE;

      const result = await WasmRuntimeProbe.check();

      expect(result).toMatchObject({
        status: WasmRuntimeStatus.OK,
        capability: CapabilityState.CAPABLE,
        reason: null,
        measurements: {
          divRatio: 5.477,
          sqrtRatio: 12.4,
          addNsPerOp: 0.406,
          addMedianMs: 6.5,
          divMedianMs: 35.6,
          sqrtMedianMs: 80.6,
        },
      });
    });

    it('should return SLOW when measurements indicate slow WASM', async () => {
      expect.assertions(1);
      workerResponse = SLOW_BENCHMARK_RESPONSE;

      const result = await WasmRuntimeProbe.check();

      expect(result).toMatchObject({
        status: WasmRuntimeStatus.SLOW,
        capability: CapabilityState.NOT_CAPABLE,
        reason: null,
        measurements: {
          divRatio: 1.888,
          sqrtRatio: 3.474,
          addNsPerOp: 2.006,
          addMedianMs: 32.1,
          divMedianMs: 60.6,
          sqrtMedianMs: 111.5,
        },
      });
    });

    it('should return UNCERTAIN when fast ratios conflict with slow add timing', async () => {
      expect.assertions(1);
      workerResponse = {
        ok: true,
        ops: TOTAL_OPERATIONS,
        addMedianMs: 40,
        divMedianMs: 200,
        sqrtMedianMs: 480,
      };

      const result = await WasmRuntimeProbe.check();

      expect(result).toMatchObject({
        status: WasmRuntimeStatus.UNCERTAIN,
        capability: CapabilityState.UNKNOWN,
        reason: WasmRuntimeUncertainReason.FAST_RATIO_SLOW_ADD,
        measurements: {
          divRatio: 5,
          sqrtRatio: 12,
          addNsPerOp: 2.5,
        },
      });
    });

    it('should return UNCERTAIN when ratios are between thresholds', async () => {
      expect.assertions(1);
      workerResponse = {
        ok: true,
        ops: TOTAL_OPERATIONS,
        addMedianMs: 10,
        divMedianMs: 35,
        sqrtMedianMs: 70,
      };

      const result = await WasmRuntimeProbe.check();

      expect(result).toMatchObject({
        status: WasmRuntimeStatus.UNCERTAIN,
        capability: CapabilityState.UNKNOWN,
        reason: WasmRuntimeUncertainReason.RATIOS_BETWEEN_THRESHOLDS,
      });
    });

    it('should return UNKNOWN when divide timing is too short', async () => {
      expect.assertions(1);
      workerResponse = {
        ok: true,
        ops: TOTAL_OPERATIONS,
        addMedianMs: 1,
        divMedianMs: 2,
        sqrtMedianMs: 5,
      };

      const result = await WasmRuntimeProbe.check();

      expect(result).toMatchObject({
        status: WasmRuntimeStatus.UNKNOWN,
        reason: WasmRuntimeUnknownReason.DIV_TIMING_TOO_SHORT,
        measurements: { divMedianMs: 2 },
      });
    });

    it('should return UNKNOWN when the worker reports benchmark failure', async () => {
      expect.assertions(1);
      workerResponse = { ok: false };

      const result = await WasmRuntimeProbe.check();

      expect(result).toMatchObject({
        status: WasmRuntimeStatus.UNKNOWN,
        reason: WasmRuntimeUnknownReason.WORKER_BENCHMARK_FAILED,
        measurements: null,
      });
    });

    it('should return UNKNOWN when the worker raises a runtime error', async () => {
      expect.assertions(1);
      shouldRaiseWorkerRuntimeError = true;

      const result = await WasmRuntimeProbe.check();

      expect(result).toMatchObject({
        status: WasmRuntimeStatus.UNKNOWN,
        reason: WasmRuntimeUnknownReason.WORKER_RUNTIME_ERROR,
        measurements: null,
      });
    });

    it('should reject an incomplete worker response', async () => {
      expect.assertions(1);
      workerResponse = { ok: true, ops: TOTAL_OPERATIONS, addMedianMs: 6.5 };

      const result = await WasmRuntimeProbe.check();

      expect(result).toMatchObject({
        status: WasmRuntimeStatus.UNKNOWN,
        reason: WasmRuntimeUnknownReason.INVALID_MEASUREMENT,
        measurements: null,
      });
    });

    it('should return UNKNOWN when the worker times out', async () => {
      expect.assertions(1);
      jest.useFakeTimers();
      workerResponse = undefined;

      const promise = WasmRuntimeProbe.check();
      jest.advanceTimersByTime(5000);
      const result = await promise;

      expect(result).toMatchObject({
        status: WasmRuntimeStatus.UNKNOWN,
        reason: WasmRuntimeUnknownReason.WORKER_TIMEOUT,
        measurements: null,
      });
      jest.useRealTimers();
    });

    it('should run the benchmark once for repeated checks', async () => {
      expect.assertions(2);
      workerResponse = FAST_BENCHMARK_RESPONSE;

      const first = WasmRuntimeProbe.check();
      const second = WasmRuntimeProbe.check();

      expect(first).toBe(second);
      await first;
      expect(workerConstructionCount).toBe(1);
    });
  });
});
