/**
 * Checks whether the WebAssembly runtime is available, without throwing when it is not.
 *
 * Returns false only when WebAssembly is hard-disabled, such as Chromium jitless mode where the
 * global is removed entirely.
 *
 * @returns True if the WebAssembly runtime is present, false if it is hard-disabled.
 */
export const hasWasmSupport = (): boolean =>
  typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function';
