# Prompt Hub and Staged Design Production Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the bounded tasks below; keep implementation ownership separate and review each result.

**Goal:** Ship a source-preserving prompt library with contextual retrieval, revision-specific outcomes, stage planning guidance, and optional advisory Jev selection.

**Architecture:** Add a separate file-backed prompt store without changing collection version 1. Expose it through a bundled CLI and the existing local library UI. Jev receives a bounded menu assembled locally; the main agent owns execution and visual judgment.

**Tech stack:** Existing Node ESM, node:test, React/TypeScript, local HTTP server, and esbuild packaging; no new runtime dependencies.

**Spec:** [Approved design](../specs/2026-09-26-prompt-hub-design.md).

## Global constraints

- Work in the existing `codex/reference-exploration` worktree; preserve unrelated changes and old collections.
- Project prompts live in `.incline/prompts/`; personal prompts use the separate `~/.incline/prompt-library/` namespace. Reads do not create storage.
- Original prompt text, source metadata, assets, revisions, and explicit imports are recoverable; modified revisions never inherit their parent's testing verdict.
- Personal lookup requires configured project consent or an explicit library operation. Local-only mode disables personal lookup and external selection.
- Stop-recording blocks new run/decision memory; it does not delete prior evidence or prohibit an explicitly requested prompt save.
- No real project data is sent externally during implementation. Network behaviour is tested with injected responses; no API key is needed.
- Build plans use existing host tools and bounded delegation. No autonomous scheduler, model training, or claim of improved aesthetic quality.

## Task 1: Prompt storage, retrieval, and portable CLI

**Files:** create `local/prompts.mjs`, `local/prompts-cli.mjs`, `local/prompts.test.mjs`, `local/prompts-cli.test.mjs`.

**Interface:** `createPromptStore(directory)` returns `save(input)`, `list()`, `read(id, revision?)`, `query(options)`, `saveRun(id, revision, input)`, `runs(id, revision?)`, and `asset(id, revision, assetId)`. Export `copyPrompt(source, destination, id, revision?)`. Returned entries include `id`, `revision`, `title`, exact `prompt`, typed tags, source, requirements, immutable asset descriptors, and integrity hashes. `query({text, tags, limit})` returns compact entries; tags are `{facet,value,provenance}`. Callers must supply the actual project/personal directory; constructors do not read or create it. Document exact accepted fields alongside the implementation.

- [x] Write tests proving lossless Unicode/newline text, revision immutability, old-revision reads, no-write reads, copied assets, independent imports, tag provenance, scoped query, and revision-specific runs.
- [x] Implement bounded schema validation, safe filenames and directory traversal, no symlink following, staged atomic publication, content hashes, explicit media gaps, and actionable corrupt/missing data errors. Reject duplicate revision writes and bad dependency references/cycles in optional recipe stages.
- [x] Derive a disposable metadata search view from authoritative entry revisions; exact facets and text produce a bounded shortlist while full prompts load only on read. Do not make inferred style labels hard compatibility exclusions.
- [x] Persist run evidence against exact revision/inputs/tools/artifacts with distinct execution, inspection, tester and user-review fields; enforce active recording scope. Stage/dependency links are explicit when supplied; no automatic user verdict inference.
- [x] Implement CLI save/read/list/query/copy/run operations with project-root resolution, selected personal directory, local-only enforcement, and JSON input files. Invalid options must fail before writing.
- [x] Run focused storage/CLI tests and review the public interface before downstream integration.

Example behavioural check:

```js
const first = await store.save({title: 'Reveal', prompt: 'Line one\r\n色', origin: 'user-authored'});
assert.equal((await store.read(first.id, first.revision)).prompt, 'Line one\r\n色');
const next = await store.save({id: first.id, baseRevision: first.revision, title: first.title, origin: first.origin, prompt: 'Changed'});
assert.equal((await store.runs(first.id, next.revision)).length, 0);
```

## Task 2: Local library UI and server integration

**Files:** create `components/incline/prompt-library.tsx`, `local/prompts-api.mjs`, `local/prompts-api.test.mjs`; modify `app/page.tsx`, `components/incline/use-session-store.ts`, `local/server.mjs`, `local/options.mjs`, related options/server tests, and scoped styles if needed.

**Consumes:** Task 1 store API. **Produces:** authenticated local endpoints and a Prompts area inside the existing library experience.

- [x] Test token/origin checks, local-only rejection of personal operations, explicit copies, revision edits, asset path rejection, and unchanged collection behaviour.
- [x] Add prompt listing/search, source and prompt preview, save/edit revision, editable faceted tags, explicit personal save/import, and honest testing/source-media status. Render untrusted text safely; source URLs are links, not proof of retained media.
- [x] Add bounded upload and safe source/result preview using the core asset manifest; unavailable sources stay visible as gaps.
- [x] Add explicit project preference for personal prompt lookup; opening the prompt library must not automatically scan the personal store.
- [x] Verify UI interactions on a disposable project, including create, edit, query and copy, then run type checks and focused server tests.

## Task 3: Optional bounded Jev selection

**Files:** create `local/prompt-routing.mjs`, `local/prompt-routing-cli.mjs`, `local/prompt-routing.test.mjs`, and synthetic evaluation fixtures.

**Consumes:** Task 1 query/read outputs and current project recording/config state. **Produces:** offline request preview, one explicit send with exact request hash, advisory candidate/abstention, validation/fallback, and immutable decision receipt.

- [x] Verify the current TypeSafe request schema from official documentation before implementing the separate rubric.
- [x] Test candidate membership, distribution consistency, explicit abstention, malformed response, changed source/brief/scope, pinned choice, no-match/direct lookup, timeout, and no external request before explicit send/hash agreement.
- [x] Keep exact eligibility and tags in code; send only bounded selected descriptions/requirements and stage intent. Candidate IDs map only to prompt inspection, never executable instructions.
- [x] Revalidate after responses; return ordinary retrieval on failure without automatic paid retries. Preserve fallback attribution, usage when returned, elapsed time and unknown costs.
- [x] Add replayable synthetic cases and an advisory comparison report. Keep live calls and claims of retrieval/aesthetic improvement separate from deterministic checks.

## Task 4: Skill workflows, packaging, and end-to-end verification

**Files:** modify `skills/incline/SKILL.md`, selected workflow references, `local/build-skill.mjs`, `README.md`, `plan.md`, and the spec status; add `skills/incline/references/prompts.md`, `skills/incline/references/workflows/prompt.md`, `skills/incline/references/production-planning.md`, curated synthetic example recipes, and evaluation notes. Regenerate bundled scripts/UI.

- [x] Add focused Prompt routing and progressive disclosure; Design remains owner of finished frontend work. Document curation, source gaps, retrieval, adaptation, testing and explicit personal reuse with working commands.
- [x] Teach effect-to-stage planning, representation choice, asset contracts, optional DAG/subagents, integration checks, and recovery linked to existing exploration. A prompt/plan-only request does not execute generation.
- [x] Supply three to five labelled agent-authored example recipes for retrieval/production tests, with no invented author/user testing claims. Include the supplied online motion source only with actually available prompt text or an explicit source gap.
- [x] Rebuild standalone scripts and UI; run full tests, lint, typecheck, skill validation and documentation links. Test the packaged CLI from a disposable project, not the repository's private data.
- [ ] Run a bounded independent behavioural review and final code review; fix material findings. Record limitations and human design evaluation still needed.
- [x] Commit completed changes locally; pushing and global skill replacement are separate actions.

## Progress and rulings

- Design approved for implementation. This plan makes the first delivery concrete; later worker routing, recovery selectors and autonomous execution remain deferred as the spec requires.
- Node supports the repository's declared runtime. Existing worktree is isolated and clean at implementation start (`43633d5`).
