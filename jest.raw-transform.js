module.exports = {
  /**
   * Turns a *.worker.js file into a string module, matching how rollup-plugin-string
   * inlines it at build time. Since tests swap in a fake Worker, the worker file's
   * contents are never run — we only ever need it as a string, not as runnable code.
   *
   * @param sourceText - The raw worker file contents.
   * @returns The transformed module source for Jest.
   */
  process(sourceText) {
    return { code: `module.exports = ${JSON.stringify(sourceText)};` };
  },
};
