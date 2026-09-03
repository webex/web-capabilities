---
applyTo: 'src/**/*.spec.ts,src/**/*.worker.js'
name: web-capabilities Tests
description: Use when writing or reviewing co-located Jest tests and WASM worker benchmark behavior.
---

# Testing Instructions

## Framework and location

- Jest runs through `ts-jest` in the environment configured by `jest.config.js`. Check `package.json` and `jest.config.js` instead of pinning tool versions in guidance.
- Keep tests next to source as `src/**/*.spec.ts`.
- Import worker source through the same path the production code uses. `jest.config.js` applies a raw transform to `*.worker.js`.
- Use `yarn test:unit` for focused runtime feedback and `yarn test:coverage` for the pull-request test command.
- Run `yarn transpile:validate` when changing exports, public types, probe result shapes, or worker message contracts.

## Test patterns

- Name the top-level `describe` after the class or capability under test.
- Use behavior-focused `it('should ...')` descriptions.
- Reset `WasmRuntimeProbe` cached state in `beforeEach` when testing probe behavior.
- Mock `Worker`, `URL.createObjectURL`, and `URL.revokeObjectURL` when exercising probe orchestration without running the real benchmark.
- Stub browser globals such as `WebAssembly`, `RTCPeerConnection`, codec capabilities, and `document.visibilityState` explicitly for capability tests.
- Assert full result objects or focused fields for `status`, `capability`, `reason`, and `measurements` where classification matters.
- Keep tests independent. Avoid relying on execution order across spec files.

## Required coverage by change type

- Capability method changes: `CAPABLE`, `NOT_CAPABLE`, and `UNKNOWN` paths, including missing hardware or API signals.
- Browser helper changes: version comparison helpers and browser or OS identification against controlled parser inputs.
- System info changes: pressure observer support, callback registration, immediate callback when state already exists, and logical core count behavior.
- WASM support changes: disabled runtime, missing worker support, worker start failure, timeout, runtime error, invalid measurements, and cleanup.
- Probe classification changes: fast ratios, slow ratios, uncertain combinations, background tab, divide timing too short, and measurement rounding.
- Public type changes: TypeScript validation plus runtime tests where behavior also changes.
- Regression fixes: the smallest mock or stub setup that fails before the fix and passes after it.
