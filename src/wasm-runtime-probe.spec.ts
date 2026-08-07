import { WasmRuntimeProbe, WasmRuntimeStatus } from './wasm-runtime-probe';
import { CapabilityState } from './web-capabilities';

interface FakeReply {
  ok: boolean;
  ops?: number;
  addMedianMs?: number;
  divMedianMs?: number;
  sqrtMedianMs?: number;
}

const OPS = 16_000_000;

// Lab-shaped worker replies (calibration matrix).
// JIT on (Mac Chrome): add 6.5, div 35.6, sqrt 80.6.
const FAST_REPLY: FakeReply = {
  ok: true,
  ops: OPS,
  addMedianMs: 6.5,
  divMedianMs: 35.6,
  sqrtMedianMs: 80.6,
};
// JIT off (Edge): add 32.1, div 60.6, sqrt 111.5.
const SLOW_REPLY: FakeReply = {
  ok: true,
  ops: OPS,
  addMedianMs: 32.1,
  divMedianMs: 60.6,
  sqrtMedianMs: 111.5,
};

let workerReply: FakeReply | undefined;
let workerConstructCount = 0;

/** Stand-in Worker for jsdom; uses {@link workerReply}. */
class MockWorker {
  onmessage: ((event: { data: FakeReply }) => void) | null = null;

  onerror: (() => void) | null = null;

  /** Tracks how many workers tests constructed. */
  constructor() {
    workerConstructCount += 1;
  }

  /** Posts {@link workerReply} to {@link MockWorker.onmessage} when configured. */
  postMessage(): void {
    if (workerReply && this.onmessage) {
      this.onmessage({ data: workerReply });
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
      workerReply = { ok: true, ops: OPS, addMedianMs: 6.5 }; // missing div/sqrt

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
      workerReply = undefined;

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
