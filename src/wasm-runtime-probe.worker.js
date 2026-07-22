/*
 * wasm-runtime-probe.worker.js — measures how long the same loop takes in WASM vs JS, off the main thread.
 *
 * Inlined as a string at build time and started from a Blob URL by wasm-runtime-probe.ts;
 * kept as a real file so it stays readable.
 *
 * Protocol: main thread posts 'start'; replies { ok: true, wasmMs, jsMs } or { ok: false }.
 */
self.onmessage = function onProbeStart() {
  try {
    // Standard LCG constants (Numerical Recipes): acc = acc * MULT + INC is a cheap
    // arithmetic loop the JIT can't optimize away, so it's a fair CPU benchmark. The
    // WASM and JS loops share them so both do identical work; changing them
    // invalidates the calibrated threshold.
    var LCG_MULT = 1664525; // multiplier
    var LCG_INC = 1013904223; // increment
    var ITERATIONS = 5000000;
    var SAMPLE_RUNS = 7; // keep the median of this many runs

    // Build a tiny WASM module in memory that exports bench(n) — nothing to fetch.
    // Bytes use LEB128: encodeU32 for lengths/counts, encodeI32 for signed values.
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

    var encodeI32 = function encodeI32(value) {
      var out = [];
      var more = true;
      while (more) {
        var byte = value & 0x7f;
        value >>= 7;
        if ((value === 0 && !(byte & 0x40)) || (value === -1 && byte & 0x40)) {
          more = false;
        } else {
          byte |= 0x80;
        }
        out.push(byte);
      }
      return out;
    };

    // A section is one labelled block of the file: [id, length, ...bytes].
    var section = function section(id, bytes) {
      return [id].concat(encodeU32(bytes.length)).concat(bytes);
    };

    var I32 = 0x7f; // WASM's code for the 32-bit integer type.

    var buildWasmLoopModule = function buildWasmLoopModule() {
      var typeSec = section(1, encodeU32(1).concat([0x60, 0x01, I32, 0x01, I32])); // bench's type: takes one i32, returns one i32
      var funcSec = section(3, encodeU32(1).concat([0x00])); // function 0 uses signature 0
      var name = 'bench'.split('').map(function toCharCode(c) {
        return c.charCodeAt(0);
      });
      var exportSec = section(
        7,
        encodeU32(1).concat(encodeU32(name.length)).concat(name).concat([0x00, 0x00])
      ); // export the function as "bench"
      // Function body — 2 locals (i, acc), then the loop:
      //   acc = acc * LCG_MULT + LCG_INC;  i += 1;  if (i < n) loop;  return acc
      var body = encodeU32(1)
        .concat(encodeU32(2))
        .concat([I32, 0x03, 0x40, 0x20, 0x02, 0x41])
        .concat(encodeI32(LCG_MULT))
        .concat([0x6c, 0x41])
        .concat(encodeI32(LCG_INC))
        .concat([
          0x6a, 0x21, 0x02, 0x20, 0x01, 0x41, 0x01, 0x6a, 0x22, 0x01, 0x20, 0x00, 0x48, 0x0d, 0x00,
          0x0b, 0x20, 0x02, 0x0b,
        ]);
      var codeSec = section(10, encodeU32(1).concat(encodeU32(body.length)).concat(body));
      // "\0asm" + version 1 + the four sections
      return new Uint8Array(
        [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0].concat(typeSec, funcSec, exportSec, codeSec)
      );
    };

    // Median of several runs, so one slow run (e.g. a background hiccup) is ignored.
    var medianRuntimeMs = function medianRuntimeMs(loopFn) {
      loopFn(ITERATIONS); // warm-up run (not timed)
      var samples = [];
      for (var k = 0; k < SAMPLE_RUNS; k++) {
        var start = performance.now();
        loopFn(ITERATIONS);
        samples.push(performance.now() - start);
      }
      samples.sort(function ascending(a, b) {
        return a - b;
      });
      return samples[Math.floor(samples.length / 2)];
    };

    var runWasmLoop = new WebAssembly.Instance(
      new WebAssembly.Module(buildWasmLoopModule())
    ).exports.bench;
    var runJsLoop = function runJsLoop(n) {
      var acc = 0;
      for (var k = 0; k < n; k++) {
        acc = (Math.imul(acc, LCG_MULT) + LCG_INC) | 0;
      }
      return acc;
    };

    var wasmMs = medianRuntimeMs(runWasmLoop);
    var jsMs = medianRuntimeMs(runJsLoop);
    self.postMessage({ ok: true, wasmMs: wasmMs, jsMs: jsMs });
  } catch (err) {
    self.postMessage({ ok: false });
  }
};
