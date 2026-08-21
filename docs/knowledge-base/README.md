# Knowledge Base

Public, repository-local architecture and onboarding guidance for `@webex/web-capabilities`. Read this index before broad searches about capability checks, browser detection, system signals, WASM runtime probing, package boundaries, or release behavior.

| Link                                                                                   | What you get                                                              |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [architecture/web-capabilities-overview.md](architecture/web-capabilities-overview.md) | Package areas, CapabilityState, WASM probe basics, build and test summary |
| [README.md](../../README.md)                                                           | Package usage and development links                                       |
| [src/index.ts](../../src/index.ts)                                                     | Authoritative public source exports                                       |

Generated API documentation belongs under `docs/api/`. That directory is gitignored locally. Cleanup commands must preserve this knowledge base and `docs/contributing/`.

Keep articles short and verify implementation details against current source, tests, package metadata, and configuration. Use only public links and publicly verifiable relationships.

New articles belong under `architecture/` or `questions/` and must be linked here. Agents should ask before capturing additional repeatable knowledge.
