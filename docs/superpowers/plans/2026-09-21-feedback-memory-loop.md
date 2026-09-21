# Feedback Memory and Discovery Improvement Implementation Plan

> **For agentic workers:** Use the available executing-plans skill to implement this plan task-by-task. Steps use checkbox syntax for tracking. Delegate only when the user authorizes it; planning alone does not dispatch agents.

**Goal:** Make recorded corrections affect the next design, support deliberately curated learning across projects, and remove unnecessary repetition from discovery.

**Architecture:** Preserve the append-only feedback archive and versioned insights. Add an explicit review checkpoint connecting newly recorded evidence to insight revisions and rendered-design checks. Personal insights and discovery changes are separate milestones with their own compatibility boundaries; implement and validate each independently.

**Tech Stack:** Existing Node ESM helpers, TypeScript taste/session logic, React local UI, node:test, esbuild skill packaging. No new model service or database dependency.

**Spec:** The agreed product decisions and acceptance criteria below; broader context in [roadmap](../../../plan.md).

## Global constraints and agreed decisions

- Keep Node runtime support at 22 or newer; development tests currently require Node 22.18+.
- Never rewrite or delete historical feedback, collections or insight revisions to implement this plan.
- Keep project evidence separate from curated personal evidence; no automatic repository scanning or promotion.
- User-confirmed general scope can support a personal preference without requiring multiple projects. Repetition alone cannot establish global scope or confidence.
- Recorded feedback is evidence; agent synthesis remains interpretation unless it faithfully restates a scoped user instruction.
- Existing batches may remain small. New batches group meaningful checkpoints, not arbitrary time windows; do not delay important capture until a long conversation ends.
- File count is not the primary problem. Read compact current findings first and retrieve relevant evidence, rather than routinely loading the archive.
- A source screenshot copied into a batch is distinct from a filename or URL mentioned in prose. Report absent evidence explicitly.
- No build, test suite or agent self-assessment certifies aesthetic satisfaction.
- A review receipt reports what the agent inspected; it is not proof that the inspection was competent.
- This is a plan, not authorization to silently publish updates or change historical classifications.

## Current evidence and gap

Layerwise has repeated spacing corrections, including the later CNN prediction question after transformer spacing feedback had already been recorded. Its first three insights still refer to earlier events. Recent CNN records preserve real screenshots and exact feedback, but insight refresh and pre-presentation application are not enforced by the workflow.

The user explicitly identifies spacing as a recurring concern across projects. The actionable lesson is to inspect relationships: text versus controls, paragraphs versus dividers, intra-group versus inter-group space, and related output regions. It is not a universal pixel value or instruction to increase every gap.

The user generally means acceptable enough to proceed by “okay push,” without claiming optimal aesthetic alignment. Bare publication permission remains distinct from explicit enthusiasm; qualifiers such as “archive this attempt” or “push despite the design” take precedence.

The current v2 discovery catalog includes density and a later density-boundary comparison, plus a bold/kinetic composition pair and a later motion comparison. Those overlap, but the broad kinetic composition does not isolate motion preference. Do not simply infer motion approval from that choice.

## Milestone A — Close the project feedback loop

### A1. Preserve permission and acceptance as distinct evidence

**Files:** modify `local/feedback.mjs`, `local/feedback.test.mjs`, `skills/incline/references/iteration-feedback.md`; update `local/insights.mjs` validation only if necessary for the additive event fields.

**Contract:** Existing v1 events remain valid. Add optional `disposition` to newly recorded events:

```json
{
  "publication": "authorized",
  "readiness": "acceptable",
  "aesthetic": "unknown",
  "basis": "The user clarified that this phrase usually means acceptable enough to proceed; no explicit aesthetic praise here."
}
```

Allowed publication values: `unknown`, `authorized`. Readiness: `unknown`, `acceptable`. Aesthetic: `unknown`, `positive`, `preferred`. `basis` is required when disposition is supplied. These are independent axes, not a numerical ranking. `preferred` requires an explicit comparison or statement; positive wording alone is not preference over alternatives. These fields preserve an agent classification and its rationale, not a machine-certified fact.

- [x] Add validation tests accepting old records unchanged and the additive object; reject unknown keys and values.
- [x] Add fixture cases for bare “push,” this user's clarified use, “good enough,” “I love this direction,” and “archive this failed attempt.” Expected classifications belong in a behavioral evaluation fixture, not a keyword classifier.
- [x] Extend validation and documentation without changing old `kind: acceptance` events. At retrieval, treat historical acceptance labels through their wording and scope; absence of disposition means unknown, not enthusiastic approval.
- [x] Run `node --test local/feedback.test.mjs local/insights.test.mjs`; preserve old source hashes.
- [x] Include the compatibility change in the integrated feature commit (see delivery note below).

Example compatibility assertion using an existing feedback test fixture:

```js
assert.deepEqual(validateBatch(legacyBatch), legacyBatch);
assert.deepEqual(validateBatch(batchWithDisposition), batchWithDisposition);
```

**Done when:** publication permission can be recorded without overstating taste, and old archives still read byte-for-byte unchanged.

### A2. Record which new feedback has been considered

**Files:** create `local/reviews.mjs`, `local/reviews.test.mjs`; modify `local/insights-cli.mjs`; document in `skills/incline/references/insights.md`.

**Interfaces:**

```js
listPendingEvidence(project) // -> { pending: [{ batchId, eventId, recordHash }], warnings: [] }
saveReview(project, receipt) // -> { reviewPath, status: 'saved' | 'already-recorded' }
```

Store immutable receipts at `.incline/reviews/<receipt-id>.json`. Receipt fields: `id`, `recordedAt` (generated), `events` (exact batch/event/hash triples), `outcomes`. Each event must be covered by an outcome containing `eventRefs` (batch/event/hash triples, since event IDs can repeat across batches), `action` (`updated`, `no-change`, `deferred`), `reason`, and `insightRevisions` (exact IDs/revision numbers; required for `updated`). Preserve duplicates of the same user message as source records without counting them as independent support.

A deferred event stays pending. A changed record hash makes the event pending again. A new independent event remains pending even if another event from its batch was reviewed. A no-change rationale may explain that a request concerns scope or publishing rather than design taste. Do not invent a new insight for every event.

- [x] Create fixtures with two events in one batch, an existing insight and a second batch. Assert that reviewing one event does not cover its neighbor.
- [x] Assert that deferred or changed-source events remain pending, while updated/no-change outcomes cover only the referenced event/hash.
- [x] Implement targeted metadata reads and immutable receipt publication; validate all linked events and insight revisions before saving. Reuse safe-ID checks and atomic publication patterns. A conflicting receipt ID fails; identical replay is idempotent.
- [x] Expose `insights.mjs pending --project <dir>` and `insights.mjs review --input <receipt.json> --project <dir>` through the existing command. Read-only operations must not create folders.
- [x] Report legacy ad hoc feedback folders as warnings and leave them untouched; malformed known `record.json` files fail visibly. Do not silently claim a complete scan when unsupported evidence remains.
- [x] Run focused tests and commit.

Example pending behavior:

```js
assert.deepEqual((await listPendingEvidence(project)).pending.map(x => x.eventId), ['spacing', 'publish']);
await saveReview(project, spacingReview);
assert.deepEqual((await listPendingEvidence(project)).pending.map(x => x.eventId), ['publish']);
```

**Done when:** the agent can identify unreviewed corrections, including an explicit choice to defer, without treating every record as a new preference.

### A3. Connect review to the next rendered design

**Files:** modify `skills/incline/references/workflows/design.md`, `skills/incline/references/workflows/feedback.md`, `skills/incline/references/insights.md`, `skills/incline/references/design-critique.md`; create `docs/evaluations/feedback-loop.md`.

- [x] At the start of a design iteration, read applicable insights and check pending feedback. Review relevant events before presenting the result; unrelated pending events need not block a targeted edit.
- [x] At a meaningful checkpoint, save new evidence and revise affected insights, retain conflicting examples, or record no-change/deferred with a reason. Activation of recording covers routine project-local tentative curation; it never permits inventing explicit instructions or global promotion.
- [x] Turn applicable findings into concrete review questions. For spacing, inspect label/control gaps, text/button gaps, paragraph/divider gaps, group boundaries, output continuity, wrapping at a narrow viewport and any states the change affects.
- [x] Require an artifact/version and inspected viewport/state to accompany the agent's assessment. Existing feedback `observation`/`hypothesis` events can retain this assessment; do not label code-only inspection as rendered verification. If unavailable, state unverified rather than pass.
- [x] Evaluate a fresh-chat task with only project files supplied: port a lesson's design to a new lesson, preserving stable controls, useful dimension colours and contextual spacing. Record which requirements were actually inspected, missed, or later corrected by the user.
- [x] Include counterexamples: large gaps can also fail; dense content can be appropriate; “okay push” does not independently approve all details. Do not encode Layerwise's exact numbers as universal rules.
- [x] Update README and roadmap to distinguish available tooling from observed outcomes; commit.

**Done when:** a new chat can retrieve an earlier correction, inspect its application in the new result, and keep the insight current. One successful trial is a functional validation, not proof of long-term learning.

### A4. Add an indexed, wiki-inspired knowledge layer

**Decision (2026-09-21):** Implement A4 first over the existing insight API; it does not depend on the planned disposition or review-receipt features. Try a small file-based retrieval index and generated topic views before introducing a database. Preserve the evidence archive and versioned insights as authoritative data. This extends the plan; it does not migrate existing records.

**Files:** create `local/knowledge.mjs`, `local/knowledge.test.mjs`; extend `local/insights-cli.mjs`; update `skills/incline/references/insights.md` and the design workflow.

**Storage and ownership:** Store rebuildable outputs under `.incline/knowledge/`: `index.json` for lookup, `index.md` for navigation and `topics/<safe-topic-id>.md` for readable current findings. JSON insight revisions remain authoritative. Topic views are deterministic projections of their findings, scope, qualifications, open questions and supporting/conflicting references; new synthesis must first be saved as an insight revision. Never independently edit generated Markdown into a second source of truth.

- [x] Define a versioned index containing current insight IDs/revisions, aspects, scopes, statuses, searchable finding text, source links and a source manifest. Keep full historical events and screenshots out of the index.
- [x] Implement explicit rebuild and read-only query commands. Start with normalized token matching and exact aspect/scope filters; return bounded results with match reasons and source revisions. Empty or weak matches must be visible, not silently replaced by unrelated preferences.
- [x] Generate topic views linking current findings and their exact supporting/conflicting evidence references. Include exceptions and uncertainty, and expose artifact availability through the existing evidence resolver. An image link is not proof the image was inspected.
- [x] Detect stale or missing projections against the authoritative source manifest. Report freshness and fall back to authoritative reads; do not return stale knowledge as current. Read-only queries must not create files. Publish rebuilds atomically and preserve the previous usable generation on failure.
- [x] Make the design workflow query relevant topics first, then open selected insights and original evidence as needed. Pending feedback review remains separate: an up-to-date index does not imply all feedback has been synthesized.
- [x] Test rebuild determinism, missing/stale index behavior, interrupted rebuild, unsafe topic IDs, superseded insights, source revision changes, conflicting scoped findings and bounded relevant results. Verify original feedback and insight files remain byte-for-byte unchanged.
- [x] Evaluate a fresh-chat spacing query against a synthetic archive containing relevant and distracting records. Compare files/bytes loaded and whether applicable findings, exceptions and evidence links are retrieved. Record these measurements before making efficiency claims.
- [x] Ensure repeated generated summaries never count as independent preference evidence. Keep project and explicitly imported personal knowledge scoped; never scan other projects automatically.

**Implementation (2026-09-22):** Delivered independently on `codex/knowledge-index`. The generated index and topic files live in immutable generations selected by an atomic `current.json` pointer. Query freshness uses revision metadata; source content and artifact checks remain targeted evidence operations. See [evaluation](../../evaluations/knowledge-retrieval.md) for synthetic response-size measurements, preservation checks and a fresh-context skill trial. At that checkpoint A1–A3, B and C were still pending.

**Done when:** an agent can navigate from a compact query result to current contextual findings and exact evidence without routinely loading the archive. A missing or corrupt generated layer is recoverable without losing knowledge. Consider SQLite or semantic search only after measured retrieval limitations justify them.

## Milestone B — Curated personal insights

Implement after A; this is a separate feature from saved reference collections and automatic library nudges.

**Files:** create `local/personal-insights.mjs` and `.test.mjs`; extend `local/insights-cli.mjs`, `local/options.mjs` and options tests; update `skills/incline/references/workflows/library.md`, `skills/incline/references/insights.md`, `skills/incline/references/evidence.md`.

**Storage:** default `~/.incline/personal-insights/`, independent of `~/.incline/library/` so existing library readers retain their contract. Project-local commands remain the default. Explicit `--personal-dir` selects an alternate directory; `--local-only` disallows personal operations. Do not silently reinterpret existing `--library-dir`.

**Interfaces:**

```js
savePersonalInsight(directory, selection) // -> { id, revision, snapshotPath }
listPersonalInsights(directory) // -> summaries without repository scans
importPersonalInsight(directory, id, project) // -> project-local tentative draft and provenance receipt
```

`selection` contains a human-reviewed finding, scope, exceptions, status, source insight revisions and selected evidence bundles. Store immutable copies of selected events and relevant artifacts with hashes, original context and source IDs. Do not depend on absolute paths into another checkout remaining valid. Copy only the evidence selected for this finding; preserve missing-asset status. Failed publication must leave existing snapshots intact.

- [x] First support saving a single scoped insight. Extend to a synthesis from multiple explicitly selected sources using the same evidence-bundle contract, rather than scanning all repos.
- [x] Test that saving requires an explicit operation, does not alter source insights, and retains a portable source record when the original checkout is unavailable.
- [x] Test multiple contexts and contradictory evidence without merging them into one aesthetic. Reject references to unavailable source revisions unless the user chooses to proceed with an explicit gap recorded in the snapshot.
- [x] Implement selection preview showing the finding, scope, exceptions and exactly what will be copied. Existing explicit user approval of that concrete selection suffices; no repeated generic permission prompts.
- [x] On import, retain source attribution and review relevance to the current brief. Project-specific instructions take precedence within scope. Imported hypotheses do not become explicit instructions.
- [x] Use a first pilot based on the user's stated recurring spacing concern. Keep exact gap values contextual, and treat the interpretation of “okay push” as a communication preference rather than a visual style preference.
- [x] Validate snapshot independence, rejected paths/symlinks, incomplete copies, source/hash corruption, local-only mode and project edits leaving personal versions unchanged. Include the completed milestone in the integrated feature commit.

**Done when:** chosen findings travel between projects with their exceptions and evidence, without automatically learning a universal style from project-local corrections.

Automatic suggestions remain a later, separate opt-in feature: a remembered setting, project-level dismissal and respect for existing project direction. This milestone does not automatically enable them.

## Milestone C — Discovery overlap and optional follow-ups

This can be delivered independently after its visual audit. Existing catalog versions 1 and 2 remain unchanged.

**Files:** modify `lib/taste.ts`, `lib/catalog.test.ts`, `lib/taste.test.ts`, `local/sessions.mjs`, relevant session creation/progression in `app/page.tsx` and `components/incline/use-session-store.ts`; inspect actual rendering in `components/incline/specimen.tsx`. Update `skills/incline/references/workflows/collect.md` and README.

- [x] Render v2 density, spacing-boundary, bold/kinetic and motion pairs at the same viewport. Check the actual differences, including reduced-motion behavior. Save an evaluation note distinguishing observed overlap from assumed overlap.
- [x] Introduce catalog version 3 for new sessions. Keep the six broad composition pairs and density/type/colour/layout as the main sequence; treat spacing and motion probes as optional follow-ups rather than mandatory closing rounds.
- [x] Add a persisted v3 `followUps` selection, initially empty, containing only `spacing` and/or `motion`. Offer “Explore spacing,” “Explore motion,” or “Finish here.” Explain the isolated question before launching a probe. “Both” and “depends” never force narrowing; a directional answer may suggest a follow-up but never silently select one.
- [x] Generate v3 follow-up IDs deterministically from the selection and preceding answers. Preserve the existing adaptive airy/compact distinction. Keep one ordered question plan for rendering, validation, completion, export and resume; update dependent-answer invalidation when preceding answers or selections change.
- [x] When motion is suppressed, show that the comparison cannot currently demonstrate motion and allow skipping. Do not infer a still preference from an inaccessible animation.
- [x] Add compatibility fixtures for v1/v2 round ordering and exports, v3 completion without probes, optional probe resume, backtracking, and “both/depends” remaining valid endpoints. Test malformed selections and prevent hidden answered rounds from contributing to findings.
- [x] Update `sessionStyles`, catalog-version validation, new-session defaults and import defaults wherever necessary; search all catalog-version callers before implementation. Rebuild the packaged UI and runtime, then inspect the resulting flow in the browser.
- [x] Commit with a clear note that existing saved answers keep their original meaning.

**Done when:** the user can finish without repeated-feeling probes, and any follow-up has a visibly distinct purpose. A broad composition preference is never substituted for an isolated motion answer.

## Delivery checks for each milestone

- [x] Run focused node:test cases before and after the implementation; use failures that demonstrate the actual behavior being added.
- [x] Run `npm test`, `npm run lint`, `npm run typecheck` after integration changes.
- [x] Rebuild changed executable bundles with `node local/build-skill.mjs`; use `npm run build:skill` for UI changes. Include generated deliverables and source together.
- [x] Validate source and installed skill links/frontmatter. Stage installation in a temporary directory and verify project evidence hashes remain unchanged; preserve local installation customizations.
- [x] Keep anonymized or synthetic evaluation fixtures in Git, never the user's personal feedback or screenshots without explicit sharing authorization.
- [x] Update the roadmap with completed scope, limitations and pending empirical evaluation. Push only when requested.

## Validation horizons

**Immediate:** schema compatibility, archive preservation, exact links, review coverage, conflict handling, correct classification boundaries and versioned quiz behavior.

**Next few iterations:** whether the agent retrieves and applies prior spacing/interaction constraints without needing the same correction; whether follow-ups feel useful; whether curated personal findings fit the new context.

**Longitudinal:** whether designs fit the user's intent with fewer repeated corrections while retaining room for different styles. Record exposure and relevant opportunities, not raw correction counts alone. Do not promise aesthetic improvement merely from passing the immediate checks.

## Recommended execution order

Following the user’s approval to try the indexed knowledge layer first, implement A4 independently over the existing insight revisions. Then A1 → A2 → A3. Then B and C as separate deliverables; neither depends on a long-term aesthetic benchmark being complete. Defer autonomous consolidation, semantic retrieval, large replay systems and medium expansion until the basic memory loop works in repeated real tasks.

## A1–A3 implementation update

Implemented additive contextual dispositions, immutable per-event review receipts and pending/review commands, plus design/feedback workflow checkpoints and contextual rendered-review guidance. The phrase “okay push” has no built-in classification; the earlier clarification belongs to this user only. Original evidence is preserved.

Automated compatibility and coverage checks are in `local/reviews.test.mjs`. The A3 fresh-context synthetic rendered transfer trial is now complete; instruction changes and one trial are not evidence of long-term aesthetic alignment. B and C are implemented as described below. No automatic personal promotion or background process was added.

## Final implementation and delivery — 2026-09-22

Milestones A1–A4, B and C are implemented. B supplies explicit compact preview/save/list/import with immutable portable selected evidence and tentative project drafts. The contextual spacing pilot uses synthetic sources and counterexamples; actual personal evidence was not promoted by this implementation request. C defaults new sessions to catalog v3 while retaining versionless/v1/v2 interpretation, offers optional probes and excludes skipped motion from taste evidence.

The fresh-context transfer trial completed with rendered checks, updated insights and exact review receipts; see [evaluation](../../evaluations/feedback-loop.md). The v2 visual audit and v3 browser flow, reduced motion, narrow viewport, resume and versionless-session regression are recorded in [discovery evaluation](../../evaluations/discovery-follow-ups.md). Ongoing real-user alignment and correction burden remain longitudinal questions, not unfinished implementation.

Delivery checks include the full test suite, lint, type checking, skill frontmatter/relative links, rebuilt UI and CLI bundles, and a staged standalone install. That installed runtime passed v3 draft/resume/finish while preserving existing synthetic evidence; its bundled personal CLI passed preview/save/list/import and local-only checks. Independent reviews identified and verified fixes for historical version fallback and duplicate artifact references producing unreadable snapshots.

Delivery note: A1–A3 were still uncommitted at the start of this continuation, and A/B share the insight runtime bundle. The implementation is recorded as one integrated feature commit rather than manufacturing intermediate commits with mismatched packaged runtime. Keep the feature branch local; pushing, merging and updating the user's global installation are separate actions.
