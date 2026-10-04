# Reusable design snapshots

**Goal:** Capture an observed project milestone as a portable reference, preserving visuals, user reactions and uncertainty alongside an agent-authored DESIGN.md.

**Architecture:** Add an immutable snapshot store and packaged agent CLI. Keep project captures, imported references and personal copies separate from existing collection and insight formats. Guide prose is rendered from structured observations; it does not infer user taste. No browser survey or autonomous watcher is introduced.

## Boundaries

- Each capture gets its own ID, manifest, DESIGN.md and selected retained files. The root DESIGN.md is untouched.
- Observations identify rendered versus source-derived evidence. Reactions retain the existing journal event format and optional rating. Qualifications and reuse hypotheses remain separate.
- Record actual Git identity when available, artifact state/viewport descriptions, explicit missing captures and hashes. A commit is provenance, not a visual snapshot.
- Explicit capture is a scoped operation. Automatic capture requires active recording and a stated satisfaction assessment supported by original reactions; no rating threshold or keyword classifier decides that assessment.
- Personal publication is explicit unless a project opted into automatic publication to the exact selected design-library directory. Local-only forbids personal operations. A later stop-recording instruction blocks automatic capture/publication.
- Import is an independent contextual reference with a relevance note. It never replaces design rules or promotes source-project preferences.

## Implementation

- [x] Capture and verify snapshots: strict bounded input, typed artifacts, deterministic guide, immutable publication, idempotent retries, integrity verification and local query. Tests cover mixed reactions, gaps, source/rendered distinctions, collisions, corruption, path safety and concurrent writes.
- [x] Reuse: explicit personal publication, selected-library query, self-contained import with provenance/relevance, and scoped auto-save settings. Tests delete original source files before reuse, verify opt-in and stopped-recording boundaries, and preserve local success if personal publication fails.
- [x] Package the CLI and connect Design/Feedback/Library guidance, including a concrete JSON example and README prompts. Test disposable two-project CLI flows and installed bundle behavior.
- [x] Run existing tests, lint, type checking, build and skill validation; review the final change and record limits. Runtime checks establish retention and scope, not accurate aesthetic interpretation or successful taste transfer.

## Verification and limits — 2026-10-04

- Full existing and new suite: 218 passing tests (`node --test --test-reporter=dot lib/*.test.ts local/*.test.mjs`). New coverage includes exact reactions/qualifications, copies surviving source removal, partial personal-save failure, independent import context, unsafe paths/corruption, concurrent retries, scoped opt-in/revocation and Git dirty-state provenance.
- The 16 snapshot tests also passed with `DESIGN_SNAPSHOT_CLI` pointing at the built portable script. The command flow covers a nested working directory, capture, personal query/publication, settings, import into another project, retained reads and partial-failure JSON/exit status.
- `npm run lint`, `npm run typecheck`, `npm run build:skill`, skill-creator `quick_validate.py`, local Markdown target checks and `git diff --check` passed. The production skill build emitted Node's existing `module.register()` deprecation warning but succeeded.
- Independent code review found a consent race while waiting for the store lock. Three regressions failed before the fix and passed afterward. Guards now recheck scope after lock acquisition and before publication. The reviewer repeated the original reproduction and confirmed that revoked consent prevents the personal copy.
- Independent instruction walkthrough covered “push” alone, qualified desktop satisfaction, an explicit local save while recording is stopped, and importing into a different project context. These were reviewed scenarios, not real-user satisfaction trials.

No existing collections, feedback, insights, prompts or project root DESIGN.md require migration. The skill bundle is built in this checkout; this change does not install it globally or push it to a remote.

The agent still chooses and inspects evidence, authors observations and assesses reaction scope. Runtime checks do not establish accurate aesthetic interpretation, playable motion, successful style transfer or reduced correction burden. Automatic capture is an active-agent workflow, not a background watcher; personal lookup remains within requested scope. A real design-project trial is the next validation step.
