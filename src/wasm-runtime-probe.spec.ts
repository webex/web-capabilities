import {
  WasmRuntimeProbe,
  WasmRuntimeStatus,
  WasmRuntimeUncertainReason,
  WasmRuntimeUnknownReason,
} from './wasm-runtime-probe';
import { CapabilityState } from './web-capabilities';

interface FakeReply {
  ok: boolean;
  ops?: number;
  addMedianMs?: number;
  divMedianMs?: number;
  sqrtMedianMs?: number;
}

const OPS = 16_000_000;

// Calibration fixtures for classify() (fast JIT-shaped vs slow interpreter-shaped medians).
const FAST_REPLY: FakeReply = {
  ok: true,
  ops: OPS,
  addMedianMs: 6.5,
  divMedianMs: 35.6,
  sqrtMedianMs: 80.6,
};
// Slow interpreter-shaped medians for the same op count.
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
    expect.assertions(8);
    delete (globalThis as { WebAssembly?: typeof WebAssembly }).WebAssembly;

    const result = await WasmRuntimeProbe.check();

    expect(result.status).toBe(WasmRuntimeStatus.DISABLED);
    expect(result.capability).toBe(CapabilityState.NOT_CAPABLE);
    expect(result.unknownReason).toBeNull();
    expect(result.uncertainReason).toBeNull();
    expect(result.uncertainDetail).toBeNull();
    expect(result.divRatio).toBeNull();
    expect(result.addNsPerOp).toBeNull();
    expect(result.divMedianMs).toBeNull();
  });

  it('should return UNKNOWN when Web Workers are not available', async () => {
    expect.assertions(3);

    const result = await WasmRuntimeProbe.check();

    expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
    expect(result.capability).toBe(CapabilityState.UNKNOWN);
    expect(result.unknownReason).toBe(WasmRuntimeUnknownReason.WORKER_UNAVAILABLE);
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
      expect.assertions(6);
      workerReply = FAST_REPLY;

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.OK);
      expect(result.capability).toBe(CapabilityState.CAPABLE);
      expect(result.unknownReason).toBeNull();
      expect(result.uncertainReason).toBeNull();
      expect(result.divRatio).toBeCloseTo(5.48, 1);
      expect(result.addNsPerOp).toBeCloseTo(0.406, 2);
    });

    it('should return SLOW when the div/add ratio collapses (interpreter)', async () => {
      expect.assertions(5);
      workerReply = SLOW_REPLY;

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.SLOW);
      expect(result.capability).toBe(CapabilityState.NOT_CAPABLE);
      expect(result.divRatio).toBeCloseTo(1.888, 1);
      expect(result.addNsPerOp).toBeGreaterThan(1.2);
      expect(result.uncertainReason).toBeNull();
    });

    it('should return UNCERTAIN when a fast ratio contradicts an interpreter-slow add', async () => {
      expect.assertions(5);
      // Fast div ratio but interpreter-slow addNs. Expect UNCERTAIN.
      workerReply = { ok: true, ops: OPS, addMedianMs: 40, divMedianMs: 200, sqrtMedianMs: 480 };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNCERTAIN);
      expect(result.capability).toBe(CapabilityState.UNKNOWN);
      expect(result.uncertainReason).toBe(WasmRuntimeUncertainReason.CONFLICTING_SIGNALS);
      expect(result.uncertainDetail).toContain(
        'Different parts of the measurement do not point to the same outcome.'
      );
      expect(result.uncertainDetail).toMatch(/divRatio=5, sqrtRatio=12, addNsPerOp=2\.5/);
    });

    it('should return UNCERTAIN when the ratios fall between the fast and slow bars', async () => {
      expect.assertions(3);
      // Ratios between fast and slow thresholds.
      workerReply = { ok: true, ops: OPS, addMedianMs: 10, divMedianMs: 35, sqrtMedianMs: 70 };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNCERTAIN);
      expect(result.uncertainReason).toBe(WasmRuntimeUncertainReason.RATIOS_INCONCLUSIVE);
      expect(result.uncertainDetail).toContain('addMedianMs=10ms');
    });

    it('should return UNKNOWN when the div kernel is too small to have really run', async () => {
      expect.assertions(2);
      workerReply = { ok: true, ops: OPS, addMedianMs: 1, divMedianMs: 2, sqrtMedianMs: 5 };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
      expect(result.unknownReason).toBe(WasmRuntimeUnknownReason.TIMING_SAMPLE_TOO_SMALL);
    });

    it('should return UNKNOWN when the worker reports a failure', async () => {
      expect.assertions(2);
      workerReply = { ok: false };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
      expect(result.unknownReason).toBe(WasmRuntimeUnknownReason.WORKER_BENCHMARK_FAILED);
    });

    it('should return UNKNOWN when a measurement field is missing', async () => {
      expect.assertions(2);
      workerReply = { ok: true, ops: OPS, addMedianMs: 6.5 };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
      expect(result.unknownReason).toBe(WasmRuntimeUnknownReason.INVALID_MEASUREMENT);
    });

    it('should return UNKNOWN when addMedianMs is not positive', async () => {
      expect.assertions(2);
      workerReply = { ok: true, ops: OPS, addMedianMs: 0, divMedianMs: 60, sqrtMedianMs: 110 };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
      expect(result.unknownReason).toBe(WasmRuntimeUnknownReason.INVALID_MEASUREMENT);
    });

    it('should return UNKNOWN when the worker does not reply before the timeout', async () => {
      expect.assertions(2);
      jest.useFakeTimers();
      workerReply = undefined;

      const promise = WasmRuntimeProbe.check();
      jest.advanceTimersByTime(8000);
      const result = await promise;

      expect(result.status).toBe(WasmRuntimeStatus.UNKNOWN);
      expect(result.unknownReason).toBe(WasmRuntimeUnknownReason.WORKER_TIMEOUT);
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
