---
applyTo: '.github/workflows/**,release.config.js,package.json,rollup.config.js,typedoc.json'
name: web-capabilities CI/CD
description: Use when reviewing checks, builds, bundled worker source, documentation generation, package entry points, or semantic-release behavior.
---

# CI/CD Instructions

## Pull-request checks

- Read `.github/workflows/pull-request-checks.yml` before changing or describing CI.
- Pull requests install with Yarn, then run `yarn test:lint`, `yarn test:prettier`, `yarn test:spelling`, `yarn transpile:validate`, `yarn build`, and `yarn test:coverage`.
- Docs generation and the aggregate `yarn test` command are not current pull-request gates.
- Do not claim a check is CI-enforced unless the workflow invokes it.

## Build and package outputs

- Rollup builds ESM and CommonJS JavaScript plus bundled TypeScript declarations from `src/index.ts`.
- At build time, Rollup embeds `*.worker.js` into the bundle as a string (`rollup-plugin-string`). At runtime, the WASM probe creates a `Worker` from a Blob URL. The npm package does not ship a separate worker file on disk.
- Keep `package.json` `main`, `module`, `types`, and `exports` aligned with Rollup outputs.
- The npm package includes only `dist/**/*`.
- The runtime dependency is `bowser`. Review any proposed runtime package as a compatibility and supply-chain change.
- Generated API files belong under `docs/api/`. That directory is gitignored locally; semantic-release can still commit generated docs on release.
- Cleanup must not delete maintained files under `docs/contributing/` or `docs/knowledge-base/`.

## Release

- Pushes to `main` install with Yarn, run `yarn build`, and invoke semantic-release.
- Conventional Commits on `main` determine whether semantic-release publishes and which version increment applies.
- The release configuration publishes to the public npm registry and commits configured release assets, including the `docs` directory.
- The current release workflow builds but does not run tests or generate TypeDoc output. Document that gap accurately.
- Treat changes to capability outcomes, probe classification, `src/index.ts`, exported signatures, entry points, declarations, or runtime dependencies as compatibility-sensitive.

## Failure triage and safety

- Fix deterministic lint, test, type, documentation, or build failures. Do not rerun them hoping for a different result.
- Retry only failures supported by evidence of transient runner, registry, or network problems.
- Treat a release failure on `main` as a coordinated delivery issue.
- Never expose workflow tokens, npm credentials, or secret values.
- Do not run semantic-release or npm publishing locally unless the user explicitly requests a coordinated release.
