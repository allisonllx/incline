# Reference Understanding and Recoverable Exploration Implementation Plan

> **For agentic workers:** Use the available executing-plans skill to implement this plan task-by-task. Steps use checkbox syntax for tracking. Planning does not authorize delegation, publication, a global installation update, or work in another project.

**Goal:** Help an agent discover plausible appeal in a sparsely described reference, explore meaningfully different adaptations, and recover from unsuccessful attempts with less explanatory work from the user.

**Architecture:** Keep the feedback journal, versioned insights, and knowledge index. Add a small project-local exploration record containing grounded hypotheses, their relationships, attempted designs, linked feedback, and recoverable decisions. Store immutable checkpoints and load a compact working view; the agent interprets evidence and chooses its next experiment, while local code validates structure and provenance.

**Tech Stack:** Existing Node ESM helpers, Node's filesystem and crypto modules, node:test, Markdown skill guidance, and esbuild skill packaging. No new database, model service, or UI dependency.

**Spec:** The agreed design, contracts, and acceptance criteria below, extending the [reference-transfer research](../../evaluations/reference-transfer-research.md) and [visual studies](../../../skills/incline/references/visual-studies.md). The user authorized implementation on 2026-09-22. The local runtime and packaged workflow are implemented; see the execution status below for validation and the separate real-trial boundary.

## Global constraints

- Keep Node runtime support at 22 or newer; development tests require Node 22.18+.
- Preserve existing feedback, collections, insights, and generated knowledge formats. Do not migrate the historical archive.
- Keep exploration local to the active project. Do not scan other projects, access the personal library, or promote preferences automatically.
- Persistent feedback-linked exploration requires active recording or an explicit request to remember the exploration. A stop-recording instruction also stops new feedback capture through this layer; it must not become an alternative recording channel. Ordinary requested design artifacts can still be produced.
- Store concise hypotheses, observations, decisions, and evidence references. Do not attempt to capture a model's private reasoning trace.
- All attraction hypotheses remain agent interpretations. Selection, silence, publication permission, or a successful build does not confirm an explanation of taste.
- A sample's rejection does not automatically invalidate its hypotheses, ancestors, descendants, or sibling samples.
- Parked branches and unsuccessful attempts remain recoverable. Normal operations never delete them.
- Explicit current constraints govern all experiments. A specific correction does not trigger a broad redesign or compulsory comparison.
- Count, cost, and elapsed-time limits constrain an exploration session; two or three displayed samples are a presentation default, not a cap on possible hypotheses.
- No fixed aesthetic score, numerical taste confidence, automatic Jev judgment, or simulated user preference decides the winner.
- Code checks establish integrity and behavior. Actual rendered artifacts and user reactions are required to assess design quality.

## Agreed design

### Two capabilities, assessed separately

**Reference understanding:** Inspect the whole reference and identify relationships: composition and focal mass, type hierarchy, spacing rhythm, imagery and drawing treatment, colour roles, material character, and concept/interaction consistency. Inspect relevant regions at readable scale and observed interaction states. Record what was actually available; screenshots cannot establish unseen motion. DOM inspection may help with measurements but cannot substitute for looking at the design.

From those observations, generate a broad, non-duplicative set of plausible appeal hypotheses. Include different levels of interpretation: literal subject, graphic treatment, composition, and combinations of qualities. These are prompts for exploration rather than a mandatory taxonomy. Named details receive priority without excluding the rest of the reference. Each hypothesis needs visible or supplied evidence, a mechanism, and an expected change in the target. Generic adjectives and unsupported guesses are insufficient.

**Recovery:** Choose a small set of informative visual studies, collect the user's reaction, and decide whether to refine an execution, reconsider an interpretation, explore a sibling, combine compatible ideas, or return to an earlier choice. A vague “nah” identifies an unsuccessful sample; it does not establish why. Repeated unproductive revisions should prompt a return to the interpretation, rather than indefinite cosmetic edits. An explicit correction can narrow affected branches within its stated scope.

### Exploration structure

Use a derivation graph presented as a tree with cross-links. A hypothesis may refine multiple prior hypotheses; one sample may explore multiple hypotheses. Parent links record origin, not logical proof or automatic rejection propagation. The graph must be acyclic; a return operation points to an existing node and does not add a reverse derivation edge.

Keep five kinds of information distinct:

| Information | Purpose |
| --- | --- |
| Observations | What was inspected or supplied, attached to a source and region/state |
| Hypotheses | Provisional explanations of appeal and expected target effects |
| Attempts | Exact rendered/source artifacts showing which hypotheses were explored |
| Feedback links | Original user evidence attached to the attempt it concerns |
| Decisions | Why the agent explored, refined, combined, parked, returned, reopened, or finished |

“Parked” is an allocation-of-effort status, not a claim that a preference is false. Keep the unsuccessful sample, its feedback, the agent's explanation, uncertainty, and a reason to revisit it. An unavailable asset remains an explicit evidence gap. A new interpretation gets a new ID and links to its predecessor instead of silently changing what an old attempt meant.

### Storage and retrieval

Add immutable snapshots under `.incline/studies/<study-id>/exploration/<revision>.json`, alongside the existing study artifacts. One revision represents a meaningful checkpoint, such as preparing a comparison or reconsidering it after feedback. Do not create a record per internal thought or minor visual tweak.

Store graph relationships and exact references to journal events; the journal remains the source of original reactions. Existing saved feedback snapshots remain authoritative for their bytes. Local study files are versioned task artifacts whose hashes are checked; do not treat an external URL as a retained screenshot. This first version does not copy artifacts through a second archive mechanism.

On resume, read the brief, constraints, active branch, immediate alternatives, selected attempt, and concise parked-branch summaries. Open the relevant node to retrieve its ancestors, attempts, feedback, and source images. Expose omitted counts when a view is limited. Do not load every screenshot or historical checkpoint, and do not merge exploration hypotheses into the general insight index.

The initial implementation offers `save`, `list`, `read`, `view`, and `evidence` operations. It does not choose designs autonomously. No deletion, automatic pruning, global graph, or graph editor is included.

### Why this approach

- Markdown-only study notes remain usable, but offer weaker guarantees that branches survive edits and can be resumed consistently.
- A versioned, validated file structure fits the current repository and permits a small working-view command. This is the chosen prototype.
- A graph database or autonomous search controller adds infrastructure before design benefit has been established. Reconsider only after the file-based trial exposes a concrete limitation.

TreeSeeker motivates preserving branch-specific evidence and returning from weak paths. Its results concern deep-search benchmarks, not personalized design. This adaptation uses a qualitative decision policy; it does not reproduce TreeSeeker's scoring formula or claim equivalent results. Source: [TreeSeeker, sections 3.1–3.4](https://arxiv.org/html/2606.11662v1).

## Data and API contracts

All identifiers match `^[a-zA-Z0-9_-]{1,80}$`. All arrays below are required, even when empty. Reject unknown fields, duplicate IDs, dangling references, cycles, invalid evidence combinations, and files larger than 1,000,000 bytes. A size limit is a resource safeguard, not a target number of ideas; exceeding it produces an explicit error without discarding data.

`ExplorationInput` contains:

```text
version: 1
id: study ID
expectedRevision: nonnegative safe integer
brief: { goal: string, scope: string, constraints: string[] }
artifacts: Artifact[]
observations: Observation[]
hypotheses: Hypothesis[]
attempts: Attempt[]
decisions: Decision[]
```

Every string describing content is non-empty and at most 4,000 characters; constraint/question lists contain non-empty strings. Empty lists express no known items. Machine hashes are 64 lowercase hexadecimal characters.

```text
Artifact = { id, role, locator?, source }
  role: reference | original | sample | implementation
  source is exactly one of:
    { kind: study-file, path, sha256 }
    { kind: feedback, batchId, artifactId, recordHash }
    { kind: unavailable, reason }
  study-file paths are relative to the enclosing study directory.

Observation = { id, artifactId, basis, region, state, description, supersedesId? }
  basis: inspected | user-reported

Hypothesis = {
  id, parentIds: ID[], observationIds: ID[], claim,
  expectedChange, openQuestions: string[], supersedesId?
}
  observationIds must contain at least one existing observation.
  Every hypothesis is inference; there is no confirmed/preferred flag.

FeedbackLink = { batchId, eventId, recordHash }

Attempt = { id, hypothesisIds: ID[], artifactIds: ID[], feedbackLinks: FeedbackLink[] }
  hypothesisIds and artifactIds are non-empty.

Decision = {
  id, action, nodeIds: ID[], attemptIds: ID[], returnToIds: ID[],
  explanation, uncertainty, revisitWhen, basis, feedbackLinks: FeedbackLink[]
}
  action: explore | refine | combine | park | return | reopen | finish
  basis: inference | user-instruction
  return requires non-empty returnToIds; other actions require an empty list.
  combine requires at least two nodeIds.
  user-instruction requires a resolvable user directed-edit or reversion event.
```

User preference or rejection can inform an agent decision without becoming a direct instruction: use `basis: inference` and link the actual positive/negative event. The validator can verify event types and links, not whether prose faithfully interprets them.

Snapshots add `revision`, `recordedAt`, and `requestHash`. Existing rows and their order remain unchanged across revisions; new rows append. The only permitted enrichment of an existing attempt is appending feedback links. Changing the brief requires a new study, and changing a hypothesis or artifact requires a new ID. This makes old interpretations and failures recoverable without mutating the journal.

Keep one explicit `supersedesId` optional field on observations and hypotheses for corrections. It must refer to a prior row of the same type; reject competing direct replacements unless the latest replacement is the one superseded. Normal derivation uses parent links and does not supersede its sources. The working view flags superseded content and points to its replacement without changing old attempts or silently making the replacement inherit their outcomes. Correcting a source observation flags dependent interpretations for agent review; it does not automatically decide which interpretation is wrong. This avoids repeatedly resurfacing a known recording error as an unexplored alternative.

Public functions to implement:

```text
validateExploration(input, previous = null) -> validated ExplorationInput
saveExploration(project, input) -> { status: saved | already-saved, revision, revisionPath }
readExploration(project, { id, revision? }) -> snapshot | null
listExplorations(project) -> { studies: [{ id, revision, goal }] }
explorationView(snapshot, { nodeId?, limit = 10 } = {}) -> working view
explorationEvidence(project, { id, nodeId }) -> { artifacts, feedback, warnings }
```

The working view returns `{ id, revision, brief, nodes, alternatives, parked, decisions, omitted }`. Node summaries include IDs, claims, source links, search state, any replacement ID, and a `needsReview` flag for corrected supporting observations. With `nodeId`, include that node, ancestors, associated attempts, and relevant decisions; without it, show the active frontier and untested alternatives. Results have deterministic ordering by latest relevant decision and then ID, not an invented taste ranking. `limit` accepts 1–50 and reports omitted counts; full `read` remains available.

An `explore`, `refine`, `combine`, or `reopen` decision activates its target nodes. `park` parks its targets. `return` parks its `nodeIds` and activates `returnToIds`; those sets must be disjoint and it has no automatic effect on other descendants. `finish` closes the current exploration session while retaining its working state. A subsequent explicit `reopen` resumes it before further exploration decisions. None of these transitions confirms or rejects a taste claim.

## File responsibilities

| File | Change and responsibility |
| --- | --- |
| `skills/incline/references/design-critique.md` | Broader evidence-grounded hypothesis generation and reference inspection |
| `skills/incline/references/visual-studies.md` | Small displayed sets, meaningful alternatives, recovery decisions, and scope |
| `local/exploration-model.mjs` | New pure schema, derivation validation, append-only rules, and working projection |
| `local/exploration-model.test.mjs` | New semantic and graph regression tests |
| `local/exploration-store.mjs` | New immutable checkpoint publication and targeted retrieval |
| `local/exploration-files.mjs`, `local/exploration-evidence.mjs` | Bounded filesystem reads, hashes, journal resolution, and newly attached evidence checks |
| `local/exploration-store.test.mjs` | New persistence, integrity, concurrency, and evidence tests |
| `local/exploration-cli.mjs` | New command adapter using existing project resolution |
| `local/exploration-cli.test.mjs` | New source/bundled command and read-only behavior tests |
| `local/build-skill.mjs` | Add the exploration entry point |
| `skills/incline/scripts/exploration.mjs` | Generated portable bundle; never hand-edit |
| `skills/incline/references/exploration.md` | New usage and interpretation guide, loaded only for exploration |
| `skills/incline/references/workflows/design.md` | Route reference exploration and resume to the new guide |
| `skills/incline/references/iteration-feedback.md` | Link outcomes to attempts without reclassifying their meaning |
| `README.md`, `plan.md` | Usage, planned/implemented status, and validation limits |
| `docs/evaluations/reference-transfer-research.md` | Preserve the earlier experiment; link this distinct extension |
| `docs/evaluations/reference-exploration.md` | New behavior cases, controlled trials, and aggregate outcomes |

## Task 1: Strengthen reference understanding and exploration policy

**Consumes:** the existing critique and visual-study guidance, plus the agreed design above.
**Produces:** a clear workflow that can be followed manually before the new CLI exists.

- [x] Amend `design-critique.md`: inspect whole composition, readable details, and available behavior; separate observation from mechanism and attraction hypothesis. Replace the two-or-three-hypothesis default with a broad candidate pool whose size depends on meaningful differences and task budget. Retain the two-or-three default only for samples displayed together.
- [x] Amend `visual-studies.md`: describe `explore`, `refine`, `combine`, `park`, `return`, `reopen`, and `finish` using the transitions above. Choose samples for plausibility, meaningful diversity, relevance, and what their comparison can clarify. Keep uncertain but grounded alternatives available; do not always select cosmetic variations of the first idea.
- [x] Add the recovery check: first inspect whether the sample actually expressed its proposed hypothesis; then decide whether execution, interpretation, project fit, or an unknown cause warrants the next experiment. Record a short explanation. Do not automatically regenerate a rejected sample or ask for a detailed rationale.
- [x] Add explicit stop conditions: user chooses or stops; a clear small edit resolves the task; or the stated time/sample budget is reached. Budget exhaustion yields a progress report with preserved alternatives, never manufactured acceptance.
- [x] Review the guidance against these cases: bare “I like this”; one named tree detail; multiple interacting qualities; missing motion evidence; vague rejection; explicit exclusion; a selected sample; and delegated choice. Expected behavior is specified in the evaluation table below.
- [x] Validate skill structure and local links. No tests that merely assert exact Markdown wording. Commit this task as `docs: define reference exploration and recovery policy` when implementing.

## Task 2: Preserve a validated exploration graph and its history

**Files:** create `local/exploration-model.mjs`, `local/exploration-model.test.mjs`, `local/exploration-store.mjs`, and `local/exploration-store.test.mjs`.
**Consumes:** the schema and transition rules above.
**Produces:** `validateExploration`, the basic `explorationView` projection, `saveExploration`, and `readExploration` with the stated signatures.

- [x] Start with tests for acyclic multi-parent derivation, a multi-hypothesis sample, valid return decisions, and preservation after parking. Define a reusable complete fixture in the model test module; the store tests can build their own smaller snapshot to avoid importing a test module. Its shape is:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExploration, explorationView } from './exploration-model.mjs';

const seed = () => ({
  version: 1, id: 'portfolio-study', expectedRevision: 0,
  brief: { goal: 'Explore this reference', scope: 'Opening section', constraints: ['Keep navigation'] },
  artifacts: [{ id: 'ref', role: 'reference', source: { kind: 'unavailable', reason: 'Synthetic fixture has no screenshot' } }],
  observations: [{ id: 'o1', artifactId: 'ref', basis: 'user-reported', region: 'Opening section', state: 'Static description', description: 'The supplied description mentions a tree and prominent typography.' }],
  hypotheses: [
    { id: 'natural', parentIds: [], observationIds: ['o1'], claim: 'Natural imagery may appeal', expectedChange: 'Explore an organic focal illustration', openQuestions: ['Subject or treatment?'] },
    { id: 'contrast', parentIds: [], observationIds: ['o1'], claim: 'Type and imagery contrast may appeal', expectedChange: 'Explore contrasting visual masses', openQuestions: ['Is the relationship transferable?'] },
  ],
  attempts: [], decisions: [],
});

test('parking preserves hypotheses and leaves siblings available', () => {
  const before = seed();
  const after = structuredClone(before);
  after.expectedRevision = 1;
  after.decisions.push({
    id: 'park-natural', action: 'park', nodeIds: ['natural'],
    attemptIds: [], returnToIds: [], basis: 'inference', feedbackLinks: [],
    explanation: 'Explore another grounded possibility first',
    uncertainty: 'No user reaction establishes a cause',
    revisitWhen: 'New evidence makes natural imagery relevant',
  });
  const valid = validateExploration(after, {
    ...before, revision: 1, recordedAt: '2026-09-22T00:00:00.000Z',
    requestHash: '0'.repeat(64),
  });
  assert.deepEqual(valid.hypotheses, before.hypotheses);
  const view = explorationView({
    ...valid, revision: 2, recordedAt: '2026-09-22T00:01:00.000Z',
    requestHash: '1'.repeat(64),
  });
  assert.ok(view.parked.some(node => node.id === 'natural'));
  assert.ok(view.alternatives.some(node => node.id === 'contrast'));
});
```

- [x] Run `node --test local/exploration-model.test.mjs` to confirm missing behavior fails. Implement exact-field validation and derivation-cycle detection using a visiting/visited DFS; inspect parent references before traversing. Validate all ID links by type. Enforce prior-row preservation, corrections through `supersedesId`, and append-only attempt feedback. Implement the basic decision projection needed by the test. Add tests that a removal, rewritten claim, dangling ID, duplicate ID, cycle, competing correction, and false `user-instruction` basis fail. Evidence-dependent instruction checks belong to the store; the model checks required links and the store resolves them.
- [x] Write persistence tests: first save creates revision 1; parking creates revision 2 without changing revision 1; two writers using the same expected revision cannot overwrite each other; identical retries return `already-saved`; corrupted latest state never becomes an empty study. Verify no feedback/insight/profile file changes.
- [x] Implement immutable publication following `local/insights.mjs`: validate, check expected revision, write a private temporary file, publish via an exclusive atomic link, clean up the temporary file. Hash a canonical serialization of the request for retries. Check the expected next revision for a matching request hash before rejecting a retry, including if a later revision now exists. A conflicting request stays a stale-revision error.
- [x] Reject path traversal and symlinked study/storage paths; check directories and revision filenames before reads and writes. Missing studies return null; malformed, oversized, unsupported-version, and unexpected filesystem errors remain visible. No silent repair or deletion command.
- [x] Run the model/store suites and existing feedback/insights tests. Commit as `feat: preserve reference exploration checkpoints` after these pass.

## Task 3: Resume selectively and verify linked evidence

**Files:** extend the model/store modules and tests; create the CLI/tests; modify the build entry points and generate the portable script.
**Consumes:** immutable snapshots and the existing feedback record format.
**Produces:** `listExplorations`, `explorationView`, `explorationEvidence`, and the following commands:

```sh
node local/exploration-cli.mjs save --project /absolute/project --input /absolute/checkpoint.json
node local/exploration-cli.mjs list --project /absolute/project
node local/exploration-cli.mjs read --project /absolute/project --id portfolio-study
node local/exploration-cli.mjs read --project /absolute/project --id portfolio-study --revision 1
node local/exploration-cli.mjs view --project /absolute/project --id portfolio-study --limit 10
node local/exploration-cli.mjs view --project /absolute/project --id portfolio-study --node natural
node local/exploration-cli.mjs evidence --project /absolute/project --id portfolio-study --node natural
```

- [x] Complete `explorationView` with selective node/ancestor views and bounded summaries. Include exact IDs and omitted counts; a rejected or parked attempt must not make unrelated alternatives disappear. Superseded nodes remain available by ID but do not appear as fresh alternatives. Add an exact return/reopen regression, a correction regression, and a multi-parent sample test. A limit truncates presentation only, never persisted state.
- [x] Implement targeted evidence loading by safe batch/event/artifact IDs. Reuse the record format and integrity rules in `local/feedback.mjs` and `local/insights.mjs`; do not turn a screenshot locator into downloaded content. At save, resolve newly linked journal evidence and pin hashes. Require user-instruction links to point to user directed-edit/reversion events; all agent judgments remain inference.
- [x] Verify newly supplied local artifact paths and hashes at save; require a complete source or an explicit unavailable entry. At evidence retrieval, check file and record hashes, source presence, and allowed paths. Return per-source statuses `available`, `unavailable`, or `changed`, with explanations and warnings. A broken old asset must not hide the rest of the study or prevent a new correction checkpoint. Reject traversal/symlink escapes without reading the target. Inspect only selected node artifacts and ancestors, not every project's media.
- [x] Add integration tests that modify/remove a saved study image, change a journal record, and supply a missing event; assert explicit warnings on reads and rejection of invalid new links on save. Confirm an unrelated screenshot is not needed to open a node. Use small byte fixtures; these tests verify provenance, not image aesthetics.
- [x] Build a strict CLI adapter around `resolveOptions` from `local/options.mjs`. Accept only command-specific flags: `save` takes input; `read` accepts revision; `view` accepts node/limit; `evidence` requires node. Reject repeated flags, invalid revisions/limits, and library/personal-directory flags. All read operations are side-effect free, including on an empty project.
- [x] Add an `exploration` entry to `local/build-skill.mjs`. Allow the CLI test path override `INCLINE_EXPLORATION_TEST_CLI`; test source and bundled entry points using the same suite:

```sh
node --test local/exploration-model.test.mjs local/exploration-store.test.mjs local/exploration-cli.test.mjs
node local/build-skill.mjs
INCLINE_EXPLORATION_TEST_CLI=skills/incline/scripts/exploration.mjs node --test local/exploration-cli.test.mjs
```

- [x] Verify standalone execution from a temporary project uses that project for state. Commit as `feat: resume exploration with linked evidence`.

## Task 4: Connect the exploration record to the agent workflow

**Files:** create `skills/incline/references/exploration.md`; update Design, visual studies, iteration feedback, README, and roadmap.
**Consumes:** the commands from Task 3 and current Feedback/Insights workflows.
**Produces:** an end-to-end instruction path with one owner for the frontend task.

- [x] Document the command contracts, a complete minimal input based on Task 2's fixture, storage paths, and missing-evidence behavior. Explain that command success validates a record, not its hypotheses.
- [x] On a substantial uncertain reference task, inspect references, retrieve applicable existing insights, and read a relevant study if one exists. Use the candidate pool to choose a small diverse sample set. On a clear edit or settled direction, proceed without starting a graph.
- [x] At an authorized memory checkpoint, preserve sample/reference visuals and link original feedback using the existing journal. Save the new exploration revision; retain unresolved reasons for dislike. When recording is off, continue the task without persisting user reactions through the graph. A stop-recording instruction must be tested as a workflow case.
- [x] Before the next attempt, inspect fidelity to the previous hypothesis and choose a named operation with a concise rationale. On return, retrieve the earlier interpretation and relevant alternatives. Do not treat rejected samples as automatic negative evidence for every property or repeat a parked approach without explaining what changed.
- [x] After a choice, build and inspect the exact selected direction using the existing visual-study procedure. Curate a scoped insight only when useful and supported; the exploration graph must not promote itself into a profile. Publication permission remains separate.
- [x] Add the suggested prompt: “Use Incline to explore this reference for my app. You can try different interpretations; keep track of the attempts so we can return to other directions if one doesn't work. Show me a few distinct samples at a time.” Explain that this authorizes remembering this exploration, not unrelated observation.
- [x] Validate skill structure, links, bundled usage, and the behavior cases below. Commit as `docs: integrate recoverable reference exploration`.

## Task 5: Check behavior before assessing taste

**Files:** create `docs/evaluations/reference-exploration.md`; link it from the prior research document without replacing its A/B/C protocol.
**Consumes:** the implemented workflow and source/bundled tool results.
**Produces:** a reproducible behavior report separating synthetic fixtures from real user evidence.

| Case | Expected observable behavior |
| --- | --- |
| Bare reference + “I like this” | Inspect it; generate grounded possibilities without demanding a detailed list |
| Only the tree is named | Prioritise it and its surrounding relationships; unmentioned details remain available |
| Several plausible causes of appeal | Preserve distinct explanations and combinations; avoid premature commitment |
| Three displayed samples | The stored candidate pool may be larger and can grow after new evidence |
| “Nah” with no explanation | Attach rejection to the sample; leave the cause and broader hypotheses uncertain |
| Poor sample execution | Identify the missing intended treatment before deciding the hypothesis failed |
| “No nature imagery for this app” | Apply the explicit constraint to relevant branches; do not reject all typography/texture ideas |
| Return from a branch | Preserve its attempts and feedback, activate a prior alternative, and explain the change |
| Later useful evidence | Reopen a parked branch with a reason; old failures remain accessible |
| User selects parts from two samples | Preserve both parent links and qualifications; no forced single-parent tree |
| Another task resumes the same project | Read the compact state, then targeted originals; do not create a new project identity |
| Missing or changed screenshot | Surface the gap; never claim the old visual was inspected |
| Stop recording | Continue requested design work without persisting new feedback through another layer |
| User selects, stops, or budget expires | End exploration appropriately; do not invent acceptance |

- [x] Run synthetic scripted feedback through the deterministic record/CLI cases. Label it synthetic in every report; do not write it into real project preference memory.
- [x] Run the agent workflow against the sparse-brief and rejection cases. Preserve the actual prompts, available artifacts, model/settings, loaded skill revision/hash, and observed actions. Evaluate whether samples were rendered and whether returns changed an interpretation, rather than checking only prose compliance.
- [x] Run `npm test` once after integration because the package adds a new portable entry point and persistence subsystem. Run skill validation and `git diff --check`. Correct failures before starting the real trial. Documentation-only follow-ups do not require repeating unrelated runtime suites.
- [x] Report passed behaviors and remaining gaps. No “taste improved” conclusion follows from this task. Commit as `test: document reference exploration behavior checks`.

## Task 6: Evaluate understanding and recovery on actual designs

**Files:** update `docs/evaluations/reference-exploration.md` with sanitized results. Keep private screenshots, exact reactions, and project history inside the chosen project's local study folder.
**Consumes:** successful behavior checks, available original/reference artifacts, and a concrete frontend task.
**Produces:** a rendered comparison and an honest decision about further investment.

- [ ] Start with one representative portfolio section and a sparse brief. A second case should differ in product constraints, such as a dense application with established semantic colours. Fix reference captures, starting code, content, viewports, relevant states, available feedback, model/settings, and time/tool budget. Record unavailable historical evidence rather than reconstructing supposed reactions.
- [ ] **Understanding comparison:** compare a frozen pre-experiment workflow with the enhanced inspection/hypothesis workflow, using identical sparse inputs and equivalent resources. Record evidence coverage, distinctness of hypotheses, unsupported assumptions, actual visual differences, and the user's preference. This compares a workflow bundle; do not attribute any improvement solely to one prompt sentence.
- [ ] **Recovery comparison:** start both conditions from the same real attempt and the same actual corrective feedback. One receives ordinary journal/study history; the other receives the same evidence organized into branches plus return guidance. Use fresh contexts through an authorized evaluation runner, identical resources, and equal access to the original material; do not create user-owned tasks implicitly. If no real rejection occurs, report recovery as untested; synthetic rejection can test behavior only.
- [ ] Render at matched viewports and comparable finish. Include the original, vary display order, and hide condition labels while asking for preference. Allow ties, neither, and “no meaningful difference.” A selection is enough; optional reasons help diagnosis but are not a prerequisite.
- [ ] Record the amount of additional explanation requested, repeated corrections, attempts, elapsed time, and tool/model cost when available. Record unavailable measurements as unavailable. Keep task usability, preservation of constraints, feature transfer, and aesthetic preference separate; do not collapse them into one score.
- [ ] Compare actual generated outcomes after a return. A return is useful only if it explores a materially different interpretation or fixes a substantiated execution problem; a new branch ID alone does not count. Check for oscillation and repeated rejected approaches.
- [ ] Stop at the agreed case budget or user selection. If results are mixed, preserve the evidence and identify whether the bottleneck is inspection, hypothesis diversity, execution, or recovery. Do not keep sampling until a favorable result appears.
- [ ] Publish only authorized, sanitized findings. One promising case warrants another trial, not a general improvement claim. Expand to more projects only if users find better alignment with acceptable effort and cost; if memory works but design does not improve, improve reference understanding or execution before adding search machinery.

## Completion and deferred scope

The implementation is complete when local checkpoints, selective resume, artifact/evidence integrity, and workflow cases pass, and the guidance is packaged. The evaluation is complete only when real compared artifacts and actual user reactions have been recorded with their limitations. Report those statuses separately.

Defer automatic DOM extraction, screenshot-scoring engines, a graph UI, automatic personal preference promotion, a learned branch-ranking policy, and numeric confidence until a measured need justifies them. Keep the existing visual tools and manual reference inspection usable throughout.

This plan does not claim that hypothesis provenance will improve taste. Its testable proposition is that grounded breadth plus recoverable exploration may reduce premature commitment and repeated correction while producing designs the user prefers.

## Execution status — 2026-09-22

Tasks 1–4 are implemented on `codex/reference-exploration`. The unchanged baseline passed 112 tests; integration passes 160 (48 new), with an additional 3/3 checks against the standalone bundle. Skill validation and targeted lint pass. Task 5 records the passed fresh-context synthetic workflow run, including four inspected samples, scoped recovery, and unchanged memory after recording stopped; Task 6 requires actual compared artifacts and real user reactions and is not claimed complete. See the [evaluation report](../../evaluations/reference-exploration.md).

Implementation details: filesystem and evidence resolution are split into internal helpers to keep publication and projection focused; cycle detection uses iterative topological traversal to handle deep histories without recursion limits. Explicitly decision-linked attempts are included in targeted evidence without expanding unrelated sibling histories. Newly attached feedback links are checked per row, even if the same event was linked elsewhere. Past visual inspection and retained asset availability remain separate: an unavailable capture is an explicit gap, not a reason to attribute the observation to the user.

Local commits group the work by deliverable: `1444e85` contains the runtime, tests, and generated bundle; `af70143` contains interpretation/recovery policy, workflow integration, and usage. The evaluation/status update is a separate documentation commit. This combines the adjacent checkpoint/resume runtime tasks into one tested unit instead of exposing a partially connected command. The real design trial remains open; no other project was modified and no global skill update or publication was performed.
