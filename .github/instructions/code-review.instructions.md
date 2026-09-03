---
applyTo: 'src/**/*.ts,README.md,AGENTS.md,docs/knowledge-base/**/*.md'
name: web-capabilities Code Review
description: Use when reviewing capability checks, browser detection, system info, WASM runtime probing, worker lifecycle, public exports, tests, or architecture guidance.
---

# Code Review Instructions

## Priorities

1. `CapabilityState` stays correct. Return `UNKNOWN` when signals are missing instead of guessing.
2. Keep `WebCapabilities.supportsWasm()` separate from `WasmRuntimeProbe.check()`. They answer different questions.
3. Preserve probe cleanup: terminate the worker and revoke the Blob URL.
4. Treat probe thresholds, check order, visibility handling, and reason codes as correctness-sensitive.
5. Treat public exports and capability outcomes as compatibility-sensitive.
6. Require tests when behavior changes at browser boundaries or in the WASM probe.

## Checks

- Prefer browser APIs and feature detection. Use `BrowserInfo` for version checks instead of new user-agent parsing.
- Do not use the WASM availability helper as a stand-in for the async speed probe, or the other way around.
- Keep the probe's one-result-per-page cache unless a test intentionally resets it.
- Reject invalid worker measurements before classification.
- Return `UNKNOWN` for background-tab and too-short timing cases instead of a false slow or fast result.
- Keep `CpuInfo` deprecated behavior stable for existing callers.
- Register and unregister `SystemInfo` pressure callbacks safely when the API is missing.
- Keep JSDoc complete where ESLint requires it.
- Verify documentation claims against source, tests, and configuration.
- Do not add secrets, private URLs, real user-agent captures, or local absolute paths.
