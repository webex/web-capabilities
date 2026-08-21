# AGENTS.md

## Project Overview

`@webex/web-capabilities` provides helper functions for browser and system information and for checking whether a browser is likely to support certain features.

Most checks run synchronously from browser APIs and hardware signals. `WasmRuntimeProbe` adds an optional async check when callers need to know whether WebAssembly runs fast enough, not just whether it is present.

Start with [README.md](README.md) for usage and [docs/knowledge-base/README.md](docs/knowledge-base/README.md) for a short architecture summary, build outputs, testing, and release behavior.

## General Guidelines

- Be direct, analytical, and evidence-based.
- Derive behavior from `src/`, co-located tests, and checked-in configuration.
- Treat `src/index.ts` as the public source export boundary and `package.json` as the authority for package entry points and runtime dependencies.
- Read the knowledge base before broad architecture searches.
- When guidance conflicts, current source and repository configuration win.

## Agent Rules

1. Cite repository paths, config keys, tests, or stable public links for factual claims.
2. Use public sources only. Do not add private issue links, documentation hosts, consumer chains, or enterprise-only skills.
3. Never commit secrets, credentials, private keys, certificate material, or decrypted `.env` content.
4. Do not add absolute local paths to committed files.
5. Create commits or push changes only when the user explicitly asks.

### Committing files

- Stage explicit paths only. Do not use `git add .` or `git add -A`.
- Stage only files changed for the current task.
- Before committing, inspect `git status` and the staged diff for secrets, keys, certificates, local paths, generated output, or unrelated changes.

### Knowledge base

The curated knowledge base under `docs/knowledge-base/` is maintained separately from generated API documentation under `docs/api/`.

- Read it for capability aggregation, browser and system inputs, WASM probing, worker lifecycle, public exports, and delivery behavior.
- Verify implementation details against source, tests, package metadata, and configuration.
- Ask before adding articles beyond the maintained index and architecture overview.
- Keep public repository content limited to publicly verifiable facts and links.

## Repository Layout

| Path                               | Purpose                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `src/index.ts`                     | Public source export barrel                                               |
| `src/web-capabilities.ts`          | Feature capability checks and primitive browser support helpers           |
| `src/browser-info.ts`              | Browser, OS, engine, and version helpers via `bowser`                     |
| `src/cpu-info.ts`                  | Deprecated CPU helper retained for compatibility                          |
| `src/system-info.ts`               | CPU core count and Compute Pressure API helpers                           |
| `src/wasm-runtime-probe.ts`        | Async WASM runtime benchmark orchestration                                |
| `src/wasm-runtime-probe.worker.js` | Inlined worker benchmark source embedded by Rollup                        |
| `src/**/*.spec.ts`                 | Co-located Jest unit tests                                                |
| `rollup.config.js`                 | ESM, CommonJS, and declaration builds; embeds worker source at build time |
| `.github/workflows/`               | Pull-request checks and main-branch publishing                            |
| `docs/knowledge-base/`             | Maintained architecture guidance                                          |
| `docs/api/`                        | Generated TypeDoc output (gitignored locally; published on release)       |

## Setup

Use a Node version that satisfies `package.json` `engines.node` and the Yarn version pinned by `package.json`. GitHub Actions workflows use Node 22.

```bash
yarn install --frozen-lockfile
yarn prepare
```

Do not use npm for dependency installation. `package.json` sets `engines.npm` to `please-use-yarn`.

## Development Commands

Run commands from the repository root.

| Command                   | Purpose                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `yarn build`              | Clean generated output and build ESM, CommonJS, and declaration artifacts           |
| `yarn watch`              | Run the Rollup build in watch mode                                                  |
| `yarn transpile:validate` | Type-check with TypeScript without emitting files                                   |
| `yarn test:unit`          | Run Jest unit tests                                                                 |
| `yarn test:coverage`      | Run Jest with coverage                                                              |
| `yarn test:lint`          | Run ESLint on TypeScript source                                                     |
| `yarn test:prettier`      | Check source and maintained Markdown formatting                                     |
| `yarn test:spelling`      | Spellcheck maintained source and documentation                                      |
| `yarn docs`               | Replace generated TypeDoc output under `docs/api/` while preserving maintained docs |
| `yarn fix`                | Apply configured Prettier and ESLint fixes                                          |

`yarn test` runs the build and every `test:*` script. Run `yarn transpile:validate` separately because the aggregate script does not include it.

## Coding Conventions

### TypeScript

- TypeScript strict mode, `noImplicitAny`, `strictNullChecks`, and `noImplicitReturns` are enabled.
- The compiler targets ES2015 and emits ESNext modules for Rollup.
- Prefer feature detection over new user-agent parsing. Use `BrowserInfo` when a check depends on browser version.
- Return `CapabilityState.UNKNOWN` when required signals are missing rather than guessing capability.
- Avoid `any` unless an existing browser boundary requires it and the reason is documented.

### Formatting, comments, and JSDoc

- Prettier uses a 100-character print width, single quotes, two-space indentation, and ES5 trailing commas.
- ESLint uses Airbnb, TypeScript, Jest, JSDoc, and Prettier rules.
- JSDoc is required for functions, classes, and methods unless a narrow existing suppression applies.
- Comments explain intent, browser constraints, or counterintuitive behavior. Do not narrate obvious code or change history.
- Keep public API descriptions concise and include required `@param` and `@returns` tags.

### Capability and runtime boundaries

- `CapabilityState` values are API outcomes, not product policy. `CAPABLE`, `NOT_CAPABLE`, and `UNKNOWN` must stay semantically stable.
- `WebCapabilities.supportsWasm()` checks whether WASM is available. `WasmRuntimeProbe.check()` is a separate async speed check.
- `WasmRuntimeProbe.check()` caches one promise per page load. Do not add duplicate probes without clearing that cache intentionally in tests.
- Worker lifecycle must terminate the worker and revoke the Blob URL in a `finally` block.
- Benchmark thresholds, classification order, visibility handling, timeout behavior, and unknown or uncertain reasons are correctness-sensitive.

## Public API and Compatibility

`src/index.ts` re-exports `WebCapabilities`, `CapabilityState`, `BrowserInfo`, `BrowserName`, `OSName`, `CpuInfo`, `SystemInfo`, `SystemInfoEvents`, pressure-related types, and the WASM runtime probe types. Changes to those exports, method signatures, capability outcomes, probe classification, or package entry points can affect consumers and semantic versioning.

The package publishes ESM, CommonJS, and bundled declaration entry points from `dist/`. The only runtime dependency is `bowser`.

See [the architecture overview](docs/knowledge-base/architecture/web-capabilities-overview.md) for package areas, CapabilityState, the WASM probe, builds, tests, and releases.

## Testing

- Jest runs through `ts-jest` in the jsdom environment configured by `jest.config.js`.
- Tests are co-located as `src/**/*.spec.ts`.
- `*.worker.js` imports use the raw transform configured in `jest.config.js`.
- Capability tests mock or stub browser globals such as `WebAssembly`, `Worker`, `RTCPeerConnection`, and codec capabilities.
- WASM runtime probe tests reset the cached promise, mock worker construction and responses, and cover disabled, slow, fast, uncertain, unknown, timeout, and cleanup paths.
- Add a regression test for every capability outcome, threshold, worker lifecycle, or public behavior change.
- Run `yarn transpile:validate` for exported type or public API changes in addition to Jest.

Path-scoped detail lives in [.github/instructions/testing.instructions.md](.github/instructions/testing.instructions.md).

## Code Review Priorities

1. Preserve `CapabilityState` semantics and avoid false positives that block or enable features incorrectly.
2. Keep `supportsWasm()` separate from `WasmRuntimeProbe.check()`.
3. Preserve worker termination and Blob URL cleanup in the probe.
4. Treat probe thresholds, check order, visibility handling, and reason codes as correctness-sensitive.
5. Treat exports, declarations, entry points, and capability outcomes as compatibility-sensitive.
6. Add or update tests when browser-boundary or probe behavior changes.

Path-scoped detail lives in [.github/instructions/code-review.instructions.md](.github/instructions/code-review.instructions.md).

## CI/CD

- Pull requests install with Yarn, then run `yarn test:lint`, `yarn test:prettier`, `yarn test:spelling`, `yarn transpile:validate`, `yarn build`, and `yarn test:coverage` in GitHub Actions.
- Docs generation and the aggregate `yarn test` command are not current pull-request gates.
- Pushes to `main` install dependencies, run `yarn build`, and invoke semantic-release.
- semantic-release analyzes Conventional Commits, publishes the public npm package, updates the changelog and package metadata, and commits configured release assets.
- Do not run semantic-release or publish locally unless the user explicitly requests a coordinated release.

Path-scoped detail lives in [.github/instructions/ci-cd.instructions.md](.github/instructions/ci-cd.instructions.md).

## Pull Requests

- Follow [docs/contributing/GIT_CONVENTIONS.md](docs/contributing/GIT_CONVENTIONS.md) for branches and Conventional Commits.
- Use [.github/skills/pr-description/SKILL.md](.github/skills/pr-description/SKILL.md) to draft the existing pull-request template from the complete committed diff and observed test evidence.
- Lead with why the change is useful, use outcome-focused bullets, and prefer plain language over implementation jargon.
- Call out capability outcome, browser detection, worker lifecycle, probe classification, public API, declaration, package-format, or semantic-version impact when applicable.
- Preserve the template headings and leave Generative AI disclosure choices to the author.

## Security and Public Scope

- Do not add secrets, tokens, credentials, private keys, certificates, `.env` values, private URLs, or absolute local paths.
- Do not copy private issue, documentation, CI, or consumer information into this public repository.
- Do not add real user-agent strings, browser profiles, or identifying session data to tests or logs.
- Keep dependency and workflow changes deterministic through `yarn.lock` and review package-source changes carefully.

## Maintaining This Guidance

Update this guidance when public exports, capability boundaries, scripts, Node or Yarn requirements, tests, build outputs, workflows, or release behavior change.

If guidance disagrees with current source or configuration, fix the guidance rather than preserving stale assumptions.
