# Branch and Commit Conventions

Use these rules for branch names and commit messages. Pull-request description guidance lives in [the PR description skill](../../.github/skills/pr-description/SKILL.md).

## Branch names

The repository does not currently enforce a branch-name format. Existing remote branches include both `<username>/<topic>` and standalone topic patterns.

- Start new work from the current `main` branch.
- Prefer `<username>/<short-description>` for contributor branches.
- Keep names lowercase, short, and hyphen-separated.
- Describe the change rather than copying a long issue title.

Example:

```text
developer/wasm-probe-thresholds
```

## Commit messages

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). The local Husky commit-message hook runs commitlint with the conventional configuration, and semantic-release analyzes commits that reach `main`.

Use this format:

```text
<type>(<optional-scope>): <description>
```

Common types:

- `feat`: new behavior that normally produces a minor release
- `fix`: corrected behavior that normally produces a patch release
- `docs`: documentation-only change
- `refactor`: internal restructuring without a behavior change
- `test`: test-only change
- `chore`, `ci`, or `build`: maintenance and delivery work

Keep the subject direct and lowercase. Use the body when the reason or tradeoff is not clear from the subject.

Mark an intentional breaking change with `!` after the type or scope, or add a `BREAKING CHANGE:` footer. Breaking changes can produce a major release.

semantic-release reads commits merged into `main`. Do not assume the pull-request title alone controls the published version.
