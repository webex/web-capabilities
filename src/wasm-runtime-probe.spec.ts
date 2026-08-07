import {
  WasmRuntimeProbe,
  WasmRuntimeStatus,
  WasmRuntimeUncertainReason,
  WasmRuntimeUnknownReason,
} from './wasm-runtime-probe';
import { CapabilityState } from './web-capabilities';

interface FakeWorkerResponse {
  ok: boolean;
  ops?: number;
  addMedianMs?: number;
  divMedianMs?: number;
  sqrtMedianMs?: number;
}

const OPS = 16_000_000;

const FAST_RESPONSE: FakeWorkerResponse = {
  ok: true,
  ops: OPS,
  addMedianMs: 6.5,
  divMedianMs: 35.6,
  sqrtMedianMs: 80.6,
};
const SLOW_RESPONSE: FakeWorkerResponse = {
  ok: true,
  ops: OPS,
  addMedianMs: 32.1,
  divMedianMs: 60.6,
  sqrtMedianMs: 111.5,
};

let workerResponse: FakeWorkerResponse | undefined;
let workerRuntimeError = false;
let workerConstructionError = false;
let workerConstructCount = 0;

/** Stand-in Worker for jsdom. */
class MockWorker {
  onmessage: ((event: { data: FakeWorkerResponse }) => void) | null = null;

  onerror: (() => void) | null = null;

  /** Tracks how many workers tests constructed. */
  constructor() {
    workerConstructCount += 1;
    if (workerConstructionError) {
      throw new Error('Worker construction failed');
    }
  }

  /** Sends the configured response or runtime error. */
  postMessage(): void {
    if (workerRuntimeError && this.onerror) {
      this.onerror();
    } else if (workerResponse && this.onmessage) {
      this.onmessage({ data: workerResponse });
    }
  }

  /** No-op for API parity. */
  // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-empty-function
  terminate(): void {}
}

describe('WasmRuntimeProbe', () => {
  const originalWebAssembly = globalThis.WebAssembly;

  beforeEach(() => {
    (WasmRuntimeProbe as unknown as { cachedResult?: unknown }).cachedResult = undefined;
    workerResponse = undefined;
    workerRuntimeError = false;
    workerConstructionError = false;
    workerConstructCount = 0;
  });

  afterEach(() => {
    (globalThis as { WebAssembly?: typeof WebAssembly }).WebAssembly = originalWebAssembly;
  });

  it('should return DISABLED when WebAssembly is hard-disabled', async () => {
    expect.assertions(4);
    delete (globalThis as { WebAssembly?: typeof WebAssembly }).WebAssembly;

    const result = await WasmRuntimeProbe.check();

    expect(result.status).toBe(WasmRuntimeStatus.DISABLED);
    expect(result.capability).toBe(CapabilityState.NOT_CAPABLE);
    expect(result.reason).toBeNull();
    expect(result.measurements).toBeNull();
  });

  it('should return UNKNOWN when Web Workers are not available', async () => {
    expect.assertions(3);

    const result = await WasmRuntimeProbe.check();

    expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
    expect(result.capability).toBe(CapabilityState.UNKNOWN);
    expect(result.reason).toBe(WasmRuntimeUnknownReason.WORKER_UNAVAILABLE);
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
      expect.assertions(3);
      workerConstructionError = true;

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
      expect(result.reason).toBe(WasmRuntimeUnknownReason.WORKER_START_FAILED);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    });

    it('should return OK when the op-cost ratios show native (JIT) speed', async () => {
      expect.assertions(5);
      workerResponse = FAST_RESPONSE;

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.OK);
      expect(result.capability).toBe(CapabilityState.CAPABLE);
      expect(result.reason).toBeNull();
      expect(result.measurements?.divRatio).toBeCloseTo(5.48, 1);
      expect(result.measurements?.addNsPerOp).toBeCloseTo(0.406, 2);
    });

    it('should return SLOW when the div/add ratio collapses (interpreter)', async () => {
      expect.assertions(5);
      workerResponse = SLOW_RESPONSE;

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.SLOW);
      expect(result.capability).toBe(CapabilityState.NOT_CAPABLE);
      expect(result.measurements?.divRatio).toBeCloseTo(1.888, 1);
      expect(result.measurements?.addNsPerOp).toBeGreaterThan(1.2);
      expect(result.reason).toBeNull();
    });

    it('should return UNCERTAIN when a fast ratio contradicts an interpreter-slow add', async () => {
      expect.assertions(4);
      workerResponse = {
        ok: true,
        ops: OPS,
        addMedianMs: 40,
        divMedianMs: 200,
        sqrtMedianMs: 480,
      };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNCERTAIN);
      expect(result.capability).toBe(CapabilityState.UNKNOWN);
      expect(result.reason).toBe(WasmRuntimeUncertainReason.FAST_RATIO_SLOW_ADD);
      expect(result.measurements).toMatchObject({
        divRatio: 5,
        sqrtRatio: 12,
        addNsPerOp: 2.5,
      });
    });

    it('should return UNCERTAIN when the ratios fall between the fast and slow bars', async () => {
      expect.assertions(2);
      workerResponse = {
        ok: true,
        ops: OPS,
        addMedianMs: 10,
        divMedianMs: 35,
        sqrtMedianMs: 70,
      };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNCERTAIN);
      expect(result.reason).toBe(WasmRuntimeUncertainReason.RATIOS_BETWEEN_THRESHOLDS);
    });

    it('should return UNKNOWN when the div kernel is too small to have really run', async () => {
      expect.assertions(3);
      workerResponse = {
        ok: true,
        ops: OPS,
        addMedianMs: 1,
        divMedianMs: 2,
        sqrtMedianMs: 5,
      };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
      expect(result.reason).toBe(WasmRuntimeUnknownReason.TIMING_SAMPLE_TOO_SMALL);
      expect(result.measurements?.divMedianMs).toBe(2);
    });

    it('should return UNKNOWN when the worker reports a failure', async () => {
      expect.assertions(2);
      workerResponse = { ok: false };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
      expect(result.reason).toBe(WasmRuntimeUnknownReason.WORKER_BENCHMARK_FAILED);
    });

    it('should return UNKNOWN when the worker raises a runtime error', async () => {
      expect.assertions(2);
      workerRuntimeError = true;

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
      expect(result.reason).toBe(WasmRuntimeUnknownReason.WORKER_RUNTIME_ERROR);
    });

    it('should return UNKNOWN when a measurement field is missing', async () => {
      expect.assertions(3);
      workerResponse = { ok: true, ops: OPS, addMedianMs: 6.5 };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
      expect(result.reason).toBe(WasmRuntimeUnknownReason.INVALID_MEASUREMENT);
      expect(result.measurements).toBeNull();
    });

    it('should return UNKNOWN when a measurement is not positive', async () => {
      expect.assertions(2);
      workerResponse = {
        ok: true,
        ops: OPS,
        addMedianMs: 32,
        divMedianMs: -1,
        sqrtMedianMs: 110,
      };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
      expect(result.reason).toBe(WasmRuntimeUnknownReason.INVALID_MEASUREMENT);
    });

    it('should return UNKNOWN when the worker does not reply before the timeout', async () => {
      expect.assertions(3);
      jest.useFakeTimers();
      workerResponse = undefined;

      const promise = WasmRuntimeProbe.check();
      jest.advanceTimersByTime(5000);
      const result = await promise;

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
      expect(result.reason).toBe(WasmRuntimeUnknownReason.WORKER_TIMEOUT);
      expect(result.measurements).toBeNull();
      jest.useRealTimers();
    });

    it('should cache the result so repeated calls run the benchmark only once', async () => {
      expect.assertions(2);
      workerResponse = FAST_RESPONSE;

      const first = WasmRuntimeProbe.check();
      const second = WasmRuntimeProbe.check();

      expect(first).toBe(second);
      await first;
      expect(workerConstructCount).toBe(1);
    });
  });
});
