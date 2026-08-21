---
name: pr-description
description: Draft accurate web-capabilities pull-request descriptions from the repository template, committed changes, and observed test evidence.
---

# PR Description

Create a concise, reader-friendly pull-request description that helps reviewers understand why the change matters, what behavior changes, and how it was verified.

## Sources

Read these before drafting:

1. `.github/pull_request_template.md`
2. The complete committed diff against the pull-request base branch
3. All branch commits
4. Test output supplied by the author or produced in the current session
5. Public issues or documentation linked by the author

Repository files and observed results are authoritative. Do not invent motivation, test evidence, issue links, screenshots, browser compatibility, or release claims.

## Workflow

1. Confirm the base branch. Use `main` when no other base is specified.
2. Review the complete branch diff, not only the latest commit.
3. Check `git status`. If uncommitted changes exist, warn the author and exclude them from the pull-request description until committed.
4. Identify effects on capability outcomes, browser detection, system info, WASM checks, runtime probe behavior, public exports, declarations, package formats, runtime dependencies, and release behavior.
5. Ask what manual testing was performed. Request the browser scenario and result when relevant. If no manual testing was needed, ask the author to confirm why.
6. Ask only for facts that cannot be derived, such as a public issue link, screenshots, or the Generative AI disclosure category.
7. Produce the completed repository template without removing headings or policy checkboxes. Do not reproduce private-only links in newly drafted text.

## Description rules

- Under `Description`, start with two to four short bullets that explain the developer or user outcome.
- Lead with why the change is useful, then explain what changed to achieve it.
- Use plain language, active voice, and short sentences. Explain an unavoidable technical term the first time it appears.
- Prefer outcomes such as “documentation commands cannot remove contributor guides” over implementation phrases such as “isolate generated output.”
- Describe behavior and developer outcomes instead of listing changed files or repeating the diff.
- Include implementation details only when they help a reviewer evaluate correctness or compatibility.
- State important non-effects directly, such as “This does not change runtime behavior or the public API.”
- Add a short `Testing` subsection under `Description` with only commands and manual checks that actually ran.
- Summarize warnings or partial results in plain language and identify whether they existed before the change.
- When manual testing was not needed, explain why in one sentence.
- Call out capability outcome changes, browser detection changes, probe classification changes, public API impact, declaration changes, package compatibility, dependency changes, migration steps, or semantic-version impact only when supported by the diff.
- Preserve the `This change implements...`, breaking-change, certification, and Generative AI sections.
- Keep checkboxes unchecked when evidence or author input is missing.
- Never mark the test certification checkbox without evidence.
- Never select a Generative AI disclosure category for the author.
- Do not add a dedicated risk section. Fold important compatibility or rollout notes into the description bullets when the diff requires them.
- Use only public links in this public repository.

## Wording example

Avoid:

> Preserve maintained documentation by isolating generated TypeDoc output and extend validation coverage.

Prefer:

> Keep generated API documentation separate from contributor guides so documentation commands cannot remove maintained content. Include the new guides in formatting and spell checks.

For capability or probe changes, prefer:

> Treat background-tab probe runs as inconclusive (`UNKNOWN`) instead of slow WASM.

over:

> Add `BACKGROUND_TAB` handling in `WasmRuntimeProbe.classify()`.

## Output

Return one Markdown block that can be pasted into GitHub.

After the block, list unresolved author questions separately. Do not put `TBD` placeholders in an otherwise final description.
