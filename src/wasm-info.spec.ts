import { hasWasmSupport } from './wasm-info';

describe('hasWasmSupport', () => {
  const originalWebAssembly = globalThis.WebAssembly;

  afterEach(() => {
    // Restore the WebAssembly global mutated by individual cases.
    (globalThis as { WebAssembly?: typeof WebAssembly }).WebAssembly = originalWebAssembly;
  });

  it('should return true when the WebAssembly runtime is available', () => {
    expect.assertions(1);

    expect(hasWasmSupport()).toBe(true);
  });

  it('should return false when the WebAssembly runtime is hard-disabled', () => {
    expect.assertions(1);

    delete (globalThis as { WebAssembly?: typeof WebAssembly }).WebAssembly;

    expect(hasWasmSupport()).toBe(false);
  });
});
