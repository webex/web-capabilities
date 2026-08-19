/*
 * WASM runtime benchmark worker. Inlined into wasm-runtime-probe.ts via Blob URL.
 *
 * Times add, divide, and square root WASM loops. Each operation uses the previous
 * result so the browser cannot run several operations at once. The main thread
 * compares divide/add and square root/add ratios so CPU speed mostly cancels out.
 *
 * Counterintuitive: HIGH ratio means JIT OK. LOW near 2 means interpreted WASM.
 * Thresholds live in wasm-runtime-probe.ts. Do not invert ratios when classifying.
 *
 * postMessage('start') returns medians or { ok: false }.
 */
self.onmessage = function onProbeStart() {
  try {
    // Each function runs 1 million loops with 16 operations per loop.
    var OPERATIONS_PER_LOOP = 16;
    var LOOPS = 1000000;
    var OPS = LOOPS * OPERATIONS_PER_LOOP;
    var TRIALS = 5;
    var WARMUP_LOOPS = 200000;

    // Build the WASM binary in memory so the probe does not need a separate file.
    var encodeU32 = function encodeU32(value) {
      var out = [];
      do {
        var byte = value & 0x7f;
        value >>>= 7;
        if (value) byte |= 0x80;
        out.push(byte);
      } while (value);
      return out;
    };

    var section = function section(id, bytes) {
      return [id].concat(encodeU32(bytes.length)).concat(bytes);
    };

    var toCharCodes = function toCharCodes(str) {
      return str.split('').map(function charCode(c) {
        return c.charCodeAt(0);
      });
    };

    var exportEntry = function exportEntry(name, funcIndex) {
      var chars = toCharCodes(name);
      return encodeU32(chars.length).concat(chars).concat([0x00, funcIndex]);
    };

    var I32 = 0x7f;
    var F64 = 0x7c;

    // Define three exported functions. Add and divide return i32, while square root returns f64.
    var typeSec = section(
      1,
      encodeU32(2)
        .concat([0x60, 0x01, I32, 0x01, I32])
        .concat([0x60, 0x01, I32, 0x01, F64])
    );
    var funcSec = section(3, encodeU32(3).concat([0x00, 0x00, 0x01]));
    var exportSec = section(
      7,
      encodeU32(3)
        .concat(exportEntry('add', 0))
        .concat(exportEntry('div', 1))
        .concat(exportEntry('sqrt', 2))
    );

    // Build an integer loop where each result becomes the input to the next operation.
    var buildIntBody = function buildIntBody(opcode) {
      var body = [1, 3, I32].concat([0x03, 0x40]);
      body = body.concat([0x20, 0x01, 0x41, 0x01, 0x72, 0x21, 0x03]);
      for (var k = 0; k < OPERATIONS_PER_LOOP; k++) {
        body = body.concat([0x20, 0x02, 0x20, 0x03, opcode, 0x21, 0x02]);
      }
      body = body.concat([0x20, 0x01, 0x41, 0x01, 0x6a, 0x22, 0x01, 0x20, 0x00, 0x48, 0x0d, 0x00]);
      body = body.concat([0x0b, 0x20, 0x02, 0x0b]);
      return encodeU32(body.length).concat(body);
    };
    // These WASM opcodes select i32.add and unsigned i32.div.
    var addCode = buildIntBody(0x6a);
    var divCode = buildIntBody(0x6e);

    // Build the same dependency pattern for floating-point square root.
    var buildSqrtBody = function buildSqrtBody() {
      var body = [2, 1, I32, 1, F64].concat([0x03, 0x40]);
      for (var k = 0; k < OPERATIONS_PER_LOOP; k++) {
        body = body.concat([0x20, 0x02, 0x20, 0x01, 0x41, 0x01, 0x72, 0xb8, 0xa0, 0x9f, 0x21, 0x02]);
      }
      body = body.concat([0x20, 0x01, 0x41, 0x01, 0x6a, 0x22, 0x01, 0x20, 0x00, 0x48, 0x0d, 0x00]);
      body = body.concat([0x0b, 0x20, 0x02, 0x0b]);
      return encodeU32(body.length).concat(body);
    };
    var sqrtCode = buildSqrtBody();

    // Assemble and compile the module once before any timed trials.
    var codeSec = section(10, encodeU32(3).concat(addCode).concat(divCode).concat(sqrtCode));
    var bytes = new Uint8Array(
      [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0].concat(typeSec, funcSec, exportSec, codeSec)
    );
    var exports = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;

    // Median reduces the effect of one unusually slow trial.
    var median = function median(samples) {
      var sorted = samples.slice().sort(function ascending(a, b) {
        return a - b;
      });
      return sorted[Math.floor(sorted.length / 2)];
    };

    // Run each function before timing so the browser can compile it.
    exports.add(WARMUP_LOOPS);
    exports.div(WARMUP_LOOPS);
    exports.sqrt(WARMUP_LOOPS);
    exports.add(WARMUP_LOOPS);
    exports.div(WARMUP_LOOPS);
    exports.sqrt(WARMUP_LOOPS);

    // Alternate operations so temporary system load affects them similarly.
    var addMs = [];
    var divMs = [];
    var sqrtMs = [];
    for (var t = 0; t < TRIALS; t++) {
      var a0 = performance.now();
      exports.add(LOOPS);
      addMs.push(performance.now() - a0);
      var d0 = performance.now();
      exports.div(LOOPS);
      divMs.push(performance.now() - d0);
      var s0 = performance.now();
      exports.sqrt(LOOPS);
      sqrtMs.push(performance.now() - s0);
    }

    self.postMessage({
      ok: true,
      ops: OPS,
      addMedianMs: median(addMs),
      divMedianMs: median(divMs),
      sqrtMedianMs: median(sqrtMs),
    });
  } catch (err) {
    self.postMessage({ ok: false });
  }
};
