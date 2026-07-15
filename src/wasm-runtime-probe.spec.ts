import { WasmRuntimeProbe, WasmJitStatus } from './wasm-runtime-probe';
import { CapabilityState } from './web-capabilities';

interface FakeReply {
  ok: boolean;
  wasmMs?: number;
  jsMs?: number;
}

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

    expect(result.status).toBe(WasmJitStatus.DISABLED);
    expect(result.capability).toBe(CapabilityState.NOT_CAPABLE);
    expect(result.ratio).toBeNull();
    expect(result.wasmMs).toBeNull();
    expect(result.jsMs).toBeNull();
  });

  it('should return UNKNOWN when Web Workers are not available', async () => {
    expect.assertions(2);

    const result = await WasmRuntimeProbe.check();

    expect(result.status).toBe(WasmJitStatus.UNKNOWN);
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

    it('should return SLOW when the wasm/js ratio is below the threshold', async () => {
      expect.assertions(5);
      workerReply = { ok: true, wasmMs: 25, jsMs: 100 };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmJitStatus.SLOW);
      expect(result.capability).toBe(CapabilityState.NOT_CAPABLE);
      expect(result.ratio).toBe(0.25);
      expect(result.wasmMs).toBe(25);
      expect(result.jsMs).toBe(100);
    });

    it('should return OK when the wasm/js ratio is at or above the threshold', async () => {
      expect.assertions(5);
      workerReply = { ok: true, wasmMs: 110, jsMs: 100 };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmJitStatus.OK);
      expect(result.capability).toBe(CapabilityState.CAPABLE);
      expect(result.ratio).toBe(1.1);
      expect(result.wasmMs).toBe(110);
      expect(result.jsMs).toBe(100);
    });

    it('should return UNKNOWN when the worker reports a failure', async () => {
      expect.assertions(1);
      workerReply = { ok: false };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmJitStatus.UNKNOWN);
    });

    it('should return UNKNOWN when jsMs is not a positive number', async () => {
      expect.assertions(1);
      workerReply = { ok: true, wasmMs: 10, jsMs: 0 };

      const result = await WasmRuntimeProbe.check();

      expect(result.status).toBe(WasmJitStatus.UNKNOWN);
    });

    it('should return UNKNOWN when the worker does not reply before the timeout', async () => {
      expect.assertions(1);
      jest.useFakeTimers();
      workerReply = undefined; // never replies

      const promise = WasmRuntimeProbe.check();
      jest.advanceTimersByTime(3000);
      const result = await promise;

      expect(result.status).toBe(WasmJitStatus.UNKNOWN);
      jest.useRealTimers();
    });

    it('should cache the result so repeated calls run the benchmark only once', async () => {
      expect.assertions(2);
      workerReply = { ok: true, wasmMs: 110, jsMs: 100 };

      const first = WasmRuntimeProbe.check();
      const second = WasmRuntimeProbe.check();

      expect(first).toBe(second);
      await first;
      expect(workerConstructCount).toBe(1);
    });
  });
});
