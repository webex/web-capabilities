/**
 * Tells TypeScript that importing `wasm-runtime-probe.worker.js` gives a string.
 * The build (rollup-plugin-string) and the tests (jest raw transform) both turn
 * that file into this default string export.
 */
declare const workerSource: string;
export default workerSource;
