/*
 * WASM runtime benchmark worker. Inlined into wasm-runtime-probe.ts via Blob URL.
 *
 * Times dependent-chain add, div, and sqrt kernels. The main thread compares
 * div/add and sqrt/add ratios so CPU clock speed mostly cancels out.
 *
 * Counterintuitive: HIGH ratio means JIT OK. LOW near 2 means interpreted WASM.
 * Thresholds live in wasm-runtime-probe.ts. Do not invert ratios when classifying.
 *
 * postMessage('start') returns medians or { ok: false }.
 */
self.onmessage = function onProbeStart() {
  try {
    var UNROLL = 16;
    var LOOPS = 1000000;
    var OPS = LOOPS * UNROLL;
    var TRIALS = 5;

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

    var buildIntBody = function buildIntBody(opcode) {
      var body = [1, 3, I32].concat([0x03, 0x40]);
      body = body.concat([0x20, 0x01, 0x41, 0x01, 0x72, 0x21, 0x03]);
      for (var k = 0; k < UNROLL; k++) {
        body = body.concat([0x20, 0x02, 0x20, 0x03, opcode, 0x21, 0x02]);
      }
      body = body.concat([0x20, 0x01, 0x41, 0x01, 0x6a, 0x22, 0x01, 0x20, 0x00, 0x48, 0x0d, 0x00]);
      body = body.concat([0x0b, 0x20, 0x02, 0x0b]);
      return encodeU32(body.length).concat(body);
    };
    var addCode = buildIntBody(0x6a);
    var divCode = buildIntBody(0x6e);

    var buildSqrtBody = function buildSqrtBody() {
      var body = [2, 1, I32, 1, F64].concat([0x03, 0x40]);
      for (var k = 0; k < UNROLL; k++) {
        body = body.concat([0x20, 0x02, 0x20, 0x01, 0x41, 0x01, 0x72, 0xb8, 0xa0, 0x9f, 0x21, 0x02]);
      }
      body = body.concat([0x20, 0x01, 0x41, 0x01, 0x6a, 0x22, 0x01, 0x20, 0x00, 0x48, 0x0d, 0x00]);
      body = body.concat([0x0b, 0x20, 0x02, 0x0b]);
      return encodeU32(body.length).concat(body);
    };
    var sqrtCode = buildSqrtBody();

    var codeSec = section(10, encodeU32(3).concat(addCode).concat(divCode).concat(sqrtCode));
    var bytes = new Uint8Array(
      [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0].concat(typeSec, funcSec, exportSec, codeSec)
    );
    var exports = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;

    // Median dampens one bad scheduler slice in a trial.
    var median = function median(samples) {
      var sorted = samples.slice().sort(function ascending(a, b) {
        return a - b;
      });
      return sorted[Math.floor(sorted.length / 2)];
    };

    // Tier-up before timing so JIT-on engines are measured compiled, not cold.
    exports.add(200000);
    exports.div(200000);
    exports.sqrt(200000);
    exports.add(200000);
    exports.div(200000);
    exports.sqrt(200000);

    // Round-robin trials so load spikes affect all three kernels equally.
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
