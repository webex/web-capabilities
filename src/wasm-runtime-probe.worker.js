/*
 * wasm-runtime-probe.worker.js — hardware-power-INDEPENDENT WASM JIT probe.
 *
 * Inlined as a string at build time and started from a Blob URL by
 * wasm-runtime-probe.ts; kept as a real file so it stays readable.
 *
 * WHAT IT MEASURES
 * ----------------
 * It times three dependent-chain WASM kernels on the SAME cpu, unrolled so the
 * inner op dominates loop overhead. Each is latency-bound (every op depends on
 * the previous accumulator), which is the only form an interpreter cannot hide:
 *
 *   add  : acc  = acc + tmp          (cheap  — integer ALU)
 *   div  : acc  = acc / tmp          (costly — INTEGER divider unit)
 *   sqrt : facc = sqrt(facc + tmp)   (costly — FP SQRT unit, a different unit)
 *
 * The MAIN THREAD then compares them as ratios (div/add, sqrt/add). A ratio
 * cancels out raw CPU speed, so it describes the ENGINE, not the machine:
 *   JIT ON  -> real hardware op-costs show through -> ratios HIGH (div ~5-30x)
 *   JIT OFF -> per-op interpreter dispatch overhead swamps the cheap add, so
 *              both gaps collapse                  -> ratios LOW  (~2x)
 * Two different execution units (integer divider vs FP sqrt) mean a single
 * hardware quirk (e.g. a very fast divider) can't fool both signals.
 *
 * This worker only MEASURES. It returns raw medians/mins so the main thread can
 * classify and re-threshold per feature. Changing the kernels or op counts
 * invalidates the calibrated thresholds in wasm-runtime-probe.ts.
 *
 * Protocol: main thread posts 'start'; replies
 *   { ok: true, ops, addMedianMs, divMedianMs, sqrtMedianMs,
 *     addMinMs, divMinMs, sqrtMinMs, checkAdd, checkDiv, checkSqrt }
 * or { ok: false }.
 */
self.onmessage = function onProbeStart() {
  try {
    var UNROLL = 16;
    var LOOPS = 1000000;
    var OPS = LOOPS * UNROLL; // ~16M effective inner ops per timed run
    var TRIALS = 5;

    // --- LEB128 + section helpers (build a tiny module in memory, nothing to fetch) ---
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

    // A section is one labelled block of the file: [id, length, ...bytes].
    var section = function section(id, bytes) {
      return [id].concat(encodeU32(bytes.length)).concat(bytes);
    };

    var toCharCodes = function toCharCodes(str) {
      return str.split('').map(function charCode(c) {
        return c.charCodeAt(0);
      });
    };

    // One export entry: name, then 0x00 (function kind) and the function index.
    var exportEntry = function exportEntry(name, funcIndex) {
      var chars = toCharCodes(name);
      return encodeU32(chars.length).concat(chars).concat([0x00, funcIndex]);
    };

    var I32 = 0x7f; // WASM's code for the 32-bit integer type.
    var F64 = 0x7c; // WASM's code for the 64-bit float type.

    // Two signatures: T0 (i32)->i32 for add/div, T1 (i32)->f64 for sqrt.
    var typeSec = section(
      1,
      encodeU32(2)
        .concat([0x60, 0x01, I32, 0x01, I32])
        .concat([0x60, 0x01, I32, 0x01, F64])
    );
    var funcSec = section(3, encodeU32(3).concat([0x00, 0x00, 0x01])); // add:T0 div:T0 sqrt:T1
    var exportSec = section(
      7,
      encodeU32(3)
        .concat(exportEntry('add', 0))
        .concat(exportEntry('div', 1))
        .concat(exportEntry('sqrt', 2))
    );

    // --- integer kernel (add/div): identical scaffold, ONE opcode differs ---
    // locals (beyond param0 = n): i(1), acc(2), tmp(3), all i32.
    var buildIntBody = function buildIntBody(opcode) {
      var body = [1, 3, I32].concat([0x03, 0x40]); // 3 i32 locals; loop (void)
      body = body.concat([0x20, 0x01, 0x41, 0x01, 0x72, 0x21, 0x03]); // tmp = (i | 1)
      for (var k = 0; k < UNROLL; k++) {
        body = body.concat([0x20, 0x02, 0x20, 0x03, opcode, 0x21, 0x02]); // acc = acc OP tmp
      }
      // i += 1; if (i < n) continue loop
      body = body.concat([0x20, 0x01, 0x41, 0x01, 0x6a, 0x22, 0x01, 0x20, 0x00, 0x48, 0x0d, 0x00]);
      body = body.concat([0x0b, 0x20, 0x02, 0x0b]); // end loop; return acc; end func
      return encodeU32(body.length).concat(body);
    };
    var addCode = buildIntBody(0x6a); // i32.add
    var divCode = buildIntBody(0x6e); // i32.div_u (dependent latency chain)

    // --- FP sqrt kernel: dependent chain on the FP sqrt unit ---
    // locals (beyond param0 = n): i(1) i32, facc(2) f64.
    var buildSqrtBody = function buildSqrtBody() {
      var body = [2, 1, I32, 1, F64].concat([0x03, 0x40]); // locals i(i32), facc(f64); loop (void)
      for (var k = 0; k < UNROLL; k++) {
        // facc = sqrt(facc + f64(i | 1))
        body = body.concat([0x20, 0x02, 0x20, 0x01, 0x41, 0x01, 0x72, 0xb8, 0xa0, 0x9f, 0x21, 0x02]);
      }
      body = body.concat([0x20, 0x01, 0x41, 0x01, 0x6a, 0x22, 0x01, 0x20, 0x00, 0x48, 0x0d, 0x00]);
      body = body.concat([0x0b, 0x20, 0x02, 0x0b]); // end loop; return facc; end func
      return encodeU32(body.length).concat(body);
    };
    var sqrtCode = buildSqrtBody();

    var codeSec = section(10, encodeU32(3).concat(addCode).concat(divCode).concat(sqrtCode));
    var bytes = new Uint8Array(
      [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0].concat(typeSec, funcSec, exportSec, codeSec)
    );
    var exports = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;

    var stats = function stats(samples) {
      var sorted = samples.slice().sort(function ascending(a, b) {
        return a - b;
      });
      return { median: sorted[Math.floor(sorted.length / 2)], min: sorted[0] };
    };

    // Warm up / tier up all three so the JIT (if on) has compiled before timing.
    exports.add(200000);
    exports.div(200000);
    exports.sqrt(200000);
    exports.add(200000);
    exports.div(200000);
    exports.sqrt(200000);

    // Interleaved trials: contention in any round hits all three equally, so the
    // per-kernel median stays comparable and the ratios survive a load spike.
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

    var addStat = stats(addMs);
    var divStat = stats(divMs);
    var sqrtStat = stats(sqrtMs);

    self.postMessage({
      ok: true,
      ops: OPS,
      addMedianMs: addStat.median,
      divMedianMs: divStat.median,
      sqrtMedianMs: sqrtStat.median,
      addMinMs: addStat.min,
      divMinMs: divStat.min,
      sqrtMinMs: sqrtStat.min,
      // Cheap correctness canaries (the kernels actually ran and returned a value).
      checkAdd: exports.add(3),
      checkDiv: exports.div(3),
      checkSqrt: exports.sqrt(3),
    });
  } catch (err) {
    self.postMessage({ ok: false });
  }
};
