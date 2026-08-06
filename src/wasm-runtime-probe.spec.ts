import { WasmRuntimeProbe, WasmRuntimeStatus } from './wasm-runtime-probe';
import { CapabilityState } from './web-capabilities';

interface FakeReply {
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

const OPS = 16_000_000;

// Realistic measured signatures (see wasm-runtime-probe calibration matrix).
// JIT ON (Mac Chrome): add 6.5ms, div 35.6, sqrt 80.6 -> divRatio 5.5, addNs 0.41.
const FAST_REPLY: FakeReply = {
  ok: true,
  ops: OPS,
  addMedianMs: 6.5,
  divMedianMs: 35.6,
  sqrtMedianMs: 80.6,
};
// JIT OFF (Edge, JIT disabled): add 32.1, div 60.6, sqrt 111.5 -> divRatio 1.9, addNs 2.0.
const SLOW_REPLY: FakeReply = {
  ok: true,
  ops: OPS,
  addMedianMs: 32.1,
  divMedianMs: 60.6,
  sqrtMedianMs: 111.5,
};

// Shared state that controls how the mock Worker behaves in the current test.
let workerReply: FakeReply | undefined;
let workerConstructCount = 0;

/**
 * Fake Worker for jsdom, which has no real one. On postMessage it replies immediately with whatever
 * {@link workerReply} the test set, or stays silent so we can test the timeout path.
 */
class MockWorker {
  onmessage: ((event: { data: FakeReply }) => void) | null = null;

  onerror: (() => void) | null = null;

  /**
   * Counts how many workers were created, so the caching test can check it.
   */
  constructor() {
    workerConstructCount += 1;
  }

  /**
   * Sends the configured reply back to the probe, or nothing if none is set.
   */
  postMessage(): void {
    if (workerReply && this.onmessage) {
      this.onmessage({ data: workerReply });
    }
  }

  /**
   * Does nothing; just matches the real Worker API.
   */
  // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-empty-function
  terminate(): void {}
}

describe('WasmRuntimeProbe', () => {
  const originalWebAssembly = globalThis.WebAssembly;

  beforeEach(() => {
    // Clear the per-page cache so each test starts fresh (private, reached via a cast).
    (WasmRuntimeProbe as unknown as { cachedResult?: unknown }).cachedResult = undefined;
    workerReply = undefined;
    workerConstructCount = 0;
  });

  afterEach(() => {
    (globalThis as { WebAssembly?: typeof WebAssembly }).WebAssembly = originalWebAssembly;
  });

  it('should return DISABLED when WebAssembly is hard-disabled', async () => {
    expect.assertions(5);
    delete (globalThis as { WebAssembly?: typeof WebAssembly }).WebAssembly;

    const result = await WasmRuntimeProbe.check();

    expect(result.status).toBe(WasmRuntimeStatus.DISABLED);
    expect(result.capability).toBe(CapabilityState.NOT_CAPABLE);
    expect(result.divRatio).toBeNull();
    expect(result.addNsPerOp).toBeNull();
    expect(result.divMedianMs).toBeNull();
  });

  it('should return UNKNOWN when Web Workers are not available', async () => {
    expect.assertions(2);

    const result = await WasmRuntimeProbe.check();

    expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
    expect(result.capability).toBe(CapabilityState.UNKNOWN);
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

    it('should return OK when the op-cost ratios show native (JIT) speed', async () => {
      expect.assertions(4);
      workerReply = FAST_REPLY;

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.OK);
      expect(result.capability).toBe(CapabilityState.CAPABLE);
      expect(result.divRatio).toBeCloseTo(5.48, 1);
      expect(result.addNsPerOp).toBeCloseTo(0.406, 2);
    });

    it('should return SLOW when the div/add ratio collapses (interpreter)', async () => {
      expect.assertions(4);
      workerReply = SLOW_REPLY;

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.SLOW);
      expect(result.capability).toBe(CapabilityState.NOT_CAPABLE);
      expect(result.divRatio).toBeCloseTo(1.888, 1);
      expect(result.addNsPerOp).toBeGreaterThan(1.2);
    });

    it('should return UNCERTAIN when a fast ratio contradicts an interpreter-slow add', async () => {
      expect.assertions(2);
      // divRatio 5 (looks native) but addNs 2.5 (interpreter-slow) -> contradiction.
      workerReply = { ok: true, ops: OPS, addMedianMs: 40, divMedianMs: 200, sqrtMedianMs: 480 };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNCERTAIN);
      expect(result.capability).toBe(CapabilityState.UNKNOWN);
    });

    it('should return UNCERTAIN when the ratios fall between the fast and slow bars', async () => {
      expect.assertions(1);
      // divRatio 3.5 (between 3 and 4), sqrtRatio 7 (< 8), addNs 0.625 (< floor).
      workerReply = { ok: true, ops: OPS, addMedianMs: 10, divMedianMs: 35, sqrtMedianMs: 70 };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNCERTAIN);
    });

    it('should return UNKNOWN when the div kernel is too small to have really run', async () => {
      expect.assertions(1);
      // div median below the MIN_DIV_MEDIAN_MS floor -> nothing measurable executed.
      workerReply = { ok: true, ops: OPS, addMedianMs: 1, divMedianMs: 2, sqrtMedianMs: 5 };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
    });

    it('should return UNKNOWN when the worker reports a failure', async () => {
      expect.assertions(1);
      workerReply = { ok: false };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
    });

    it('should return UNKNOWN when a measurement field is missing', async () => {
      expect.assertions(1);
      workerReply = { ok: true, ops: OPS, addMedianMs: 6.5 }; // no div/sqrt

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
    });

    it('should return UNKNOWN when addMedianMs is not positive', async () => {
      expect.assertions(1);
      workerReply = { ok: true, ops: OPS, addMedianMs: 0, divMedianMs: 60, sqrtMedianMs: 110 };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
    });

    it('should return UNKNOWN when the worker does not reply before the timeout', async () => {
      expect.assertions(1);
      jest.useFakeTimers();
      workerReply = undefined; // never replies

      const promise = WasmRuntimeProbe.check();
      jest.advanceTimersByTime(8000);
      const result = await promise;

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
      jest.useRealTimers();
    });

    it('should cache the result so repeated calls run the benchmark only once', async () => {
      expect.assertions(2);
      workerReply = FAST_REPLY;

      const first = WasmRuntimeProbe.check();
      const second = WasmRuntimeProbe.check();

      expect(first).toBe(second);
      await first;
      expect(workerConstructCount).toBe(1);
    });
  });
});
