# Project insights: a separate, revisable view

Use this when the user asks to summarize recurring findings, curate design memory, or apply previously recorded feedback. The agent authors insights; the command validates links and stores revisions. It does not infer preferences automatically. Original `.incline/feedback/` files remain unchanged. Cross-project synthesis and personal insight saving require a separate explicit request; use the personal operations below. Project commands never access personal storage.

## Read first, retrieve selectively

Start with `node <skill-directory>/scripts/insights.mjs query --query "spacing controls" --project <project>` to find relevant current findings without loading the feedback archive. Optional `--aspect spacing` and `--scope "exact scope text"` restrict matches; `--limit 5` bounds results (1–20). Matching uses normalized words, not semantic understanding; empty or weak matches are not evidence that a preference is absent. Try the actual topic vocabulary or use a direct read when needed. Results retain qualifications, questions, source references and match reasons; superseded findings are excluded.

The query reports index freshness and falls back to authoritative insights when the index is missing, stale or corrupt. It never creates files. A current index means the saved insight revisions match its source manifest, not that all recent feedback has been reviewed or the linked screenshots inspected. Freshness uses latest revision file metadata; this is not a forensic source-content audit. Run the evidence command below to inspect original sources.

Run `node <skill-directory>/scripts/insights.mjs read --project <project>` for an unranked view of current saved findings. Use `--aspect spacing` or `--id control-spacing` to narrow the output. Empty storage returns an empty list without creating files. Superseded findings remain visible with their status; do not apply them as current instructions.

Before relying on a finding for a consequential design choice, run `node <skill-directory>/scripts/insights.mjs evidence --project <project> --id <id>`. This opens only its linked batch/events, including coverage limitations and artifact references. It reports changed source records and snapshot availability: `snapshot-saved`, `snapshot-missing`, `snapshot-changed`, `external-reference-only`, or `unavailable`. Open saved images with the host's image tool when visual interpretation matters. A verified file may be code rather than a rendered screenshot; inspect its type. Filenames mentioned in prose alone are not retrievable artifacts.

A compact read does not audit sources. If evidence changed, a link is broken, or a screenshot is absent, state the limitation and revisit the finding rather than presenting it as verified. Do not silently ignore unreadable data or substitute a newer render for an earlier one.

## Write a finding

Use `node <skill-directory>/scripts/insights.mjs save --project <project> --input <insight.json>`:

```json
{
  "id": "control-spacing",
  "aspect": "spacing",
  "finding": "Give controls room from explanatory text without separating related content excessively.",
  "scope": "This project's lesson controls; other interfaces untested.",
  "status": "tentative",
  "qualifications": ["The user also rejected an excessively large output gap."],
  "openQuestions": ["Does this carry into other app types?"],
  "supportingEvidence": [{"batchId": "actual-batch-id", "eventId": "actual-event-id"}],
  "conflictingEvidence": [],
  "expectedRevision": 0
}
```

Replace example IDs with real records. Each finding needs supporting evidence. Links resolve only within the selected project, using safe batch/event IDs. `scope` states the actual context; a broad string does not establish a universal preference. Keep findings concise and selectively useful, not one paraphrase per event. Read relevant original events before writing; summaries and agent hypotheses remain weaker evidence than explicit user instructions. List meaningful counterexamples under `conflictingEvidence`, even when they merely qualify the finding. Preserve unresolved questions.

Statuses:
- `tentative`: an agent interpretation or recurring pattern, not user-confirmed taste.
- `explicit`: a faithful, scoped restatement of an actual user instruction. Requires a linked directed edit or reversion from user evidence. The validator checks provenance type, not whether your wording faithfully represents it; do not use one instruction to justify a broader inference. Approval to try a design or push code is insufficient.
- `superseded`: retained for history but no longer applied. Explain the replacement or reason in qualifications, with relevant evidence.

For updates, read the current revision and submit its number as `expectedRevision`. New insights use zero. Each successful save creates a new immutable numbered revision under `.incline/insights/<id>/`; older versions remain. Conflicting concurrent or stale edits fail so an agent must reread and reconcile. If a save's outcome is uncertain, read the latest revision before retrying. Corrections to the original event still use the feedback journal's append-only correction procedure.

A new event can reinforce, narrow or contradict a finding. Update only affected findings when authorized; do not accumulate unsupported conclusions by repeatedly summarizing old summaries. More repetitions do not automatically mean stronger confidence. Store no numerical confidence score. Inspect original event IDs to avoid counting the same user message recorded twice as independent evidence.

## Rebuild the knowledge view

After saving or revising insights, run `node <skill-directory>/scripts/insights.mjs rebuild --project <project>`. This explicitly writes only generated knowledge under `.incline/knowledge/`. It does not infer new findings, rewrite feedback or copy anything to a personal library. It returns paths to a machine-readable index, a readable navigation page and topic pages. Each topic presents saved findings with their scopes, uncertainty and exact evidence references.

An atomic `current.json` pointer selects a complete immutable generation under `generations/<id>/`, containing `index.json`, `index.md` and `topics/`. Use returned paths instead of guessing a generation. A failed rebuild leaves the preceding generation usable. These are recoverable projections: save any new interpretation as a versioned insight first, then rebuild. Do not edit generated topic pages independently or count their repetitions as new user evidence. Old generations may remain on disk; automatic cleanup is not provided.

Generated pages link the original records, but artifact availability is checked live through `evidence --id`. Read linked images with the host image tool when relevant; a link or hash check is not visual inspection. Only the selected project's saved insights are indexed; there is no scan of other projects or personal storage.

## Limits and boundaries

The insights layer is local and separate from collection state, drafts and library snapshots. It neither replaces the evidence archive nor rewrites `profile.md`. There is no browser insights editor, semantic search or autonomous consolidation service. Retrieval supports a rebuildable word index, exact aspect/scope filters, direct ID reads and targeted provenance retrieval. Older ad hoc feedback folders need explicit conversion before they can supply batch/event links; do not fabricate records to make a finding save.

## Optional second opinion

Use [Jev review](jev-review.md) for an explicitly requested external assessment of selected insights and their linked evidence. It provides an offline preview and stores advisory results separately without modifying findings. It is not required for curation or retrieval.

## Review new evidence

Run `node <skill-directory>/scripts/insights.mjs pending --project <project>`. It returns exact `batchId`, `eventId`, `recordHash` triples plus warnings for unsupported legacy folders. It reads record metadata, not screenshot contents, and creates no files. Malformed known records fail visibly. Open relevant original events and artifacts before deciding an outcome.

Save an immutable receipt with `node <skill-directory>/scripts/insights.mjs review --project <project> --input <receipt.json>`:

```json
{
  "id": "lesson-checkpoint-1",
  "events": [{"batchId":"actual-batch","eventId":"actual-event","recordHash":"COPY_THE_HASH_FROM_PENDING"}],
  "outcomes": [{
    "eventRefs": [{"batchId":"actual-batch","eventId":"actual-event","recordHash":"COPY_THE_HASH_FROM_PENDING"}],
    "action": "updated",
    "reason": "Narrowed the spacing finding to adjacent lesson controls and retained the large-gap counterexample.",
    "insightRevisions": [{"id":"control-spacing","revision":2}]
  }]
}
```

Every selected event must appear exactly once across outcomes. `updated` requires saved exact insight revisions whose supporting/conflicting links cover each event and its source hash. Save the insight first. `no-change` explains why no finding needs revision (for example publication permission, a duplicate source or already-covered feedback). `deferred` explains what remains unresolved. Both may use an empty `insightRevisions` array; any supplied revisions must exist.

Receipts live in `.incline/reviews/<id>.json`, with a generated timestamp. Replaying identical input is idempotent; reusing an ID for different input fails. Updated/no-change covers only the selected event/hash. New events and changed hashes remain pending; deferred alone never clears an event and does not revoke an earlier completed review. To correct a completed judgment, append evidence and revise the finding rather than rewriting receipts. Review decisions describe work considered, not aesthetic correctness. No automatic preference inference, archive migration, screenshot inspection or external evaluation happens here.

## Explicit personal insight snapshots

Use only when the user asks to save or reuse chosen findings across projects. Personal insights default to `~/.incline/personal-insights/`, independently of the reference collection library at `~/.incline/library/`. `--personal-dir <directory>` changes only this store. `--local-only` disables personal operations; ordinary project commands remain available. No operation scans other repositories: each source checkout and revision must be explicitly selected.

Prepare a concrete selection with its finding, scope, exceptions, status, exact source revisions and exact supporting/conflicting events. `reviewed: true` records the user's review of that selection; never set it as a substitute for review. Existing explicit approval of the concrete selection is sufficient. Multiple sources use the same schema and retain their own context and evidence roles; do not collapse incompatible contexts into a universal aesthetic. The source `sha256` is optional for pinning previously inspected revision bytes.

```json
{
  "id": "contextual-spacing",
  "expectedRevision": 0,
  "reviewed": true,
  "aspect": "spacing",
  "finding": "Review spacing against hierarchy and density in each layout.",
  "scope": "A contextual hypothesis to assess against each new brief",
  "exceptions": [
    "Exact gap values remain specific to their layout.",
    "Publication permission alone does not establish visual taste; interpret wording and user-specific clarifications in context."
  ],
  "status": "tentative",
  "sources": [{
    "project": "/absolute/path/to/explicitly-selected-project",
    "id": "control-spacing",
    "revision": 1,
    "label": "Selected project",
    "context": "Adjacent controls in a dense analytical interface",
    "evidence": [{"batchId":"actual-batch", "eventId":"actual-event", "role":"supporting"}]
  }]
}
```

This is a schema example, not evidence of the user's preferences. The implementation's spacing pilot uses synthetic fixtures only. Replace source IDs with reviewed real records only when that evidence is explicitly in scope. An available source must select at least one linked event. Select meaningful conflicting events with `role: "conflicting"`; original roles are enforced. If a source revision is unavailable, the user may explicitly choose to proceed with `gapReason` explaining the missing source and `evidence: []`. Corrupt sources cannot be waived as gaps.

```sh
node <skill-directory>/scripts/insights.mjs personal-preview --input <selection.json>
node <skill-directory>/scripts/insights.mjs personal-save --input <selection.json>
node <skill-directory>/scripts/insights.mjs personal-list
node <skill-directory>/scripts/insights.mjs personal-import --id contextual-spacing --revision 1 --relevance "How this might relate to the current brief, with limits" --project <project>
```

Preview may use `reviewed: false` before approval; set it to `true` only once the concrete selection is reviewed. Preview is read-only and shows the exact finding, source contexts, selected events, availability and copied asset sizes without printing encoded asset bytes. Add its returned `selectionHash` to the reviewed input when saving to reject changes since preview. Save also works directly when the user already approved that exact selection. New IDs use `expectedRevision: 0`; updates use the latest revision number. List is read-only and never opens source repositories.

Each immutable `<id>/<revision>.json` file is a hash-checked envelope containing source attribution, selected original events, record hashes, coverage limitations and relevant artifact bytes encoded as base64 with SHA-256. It copies only selected events and their linked artifacts; original absolute paths are attribution only. Missing snapshots stay explicitly missing; no remote locators are downloaded. Source and destination symlinks and unsafe IDs/asset paths are rejected. Files are bounded (8 MB per asset, 32 MB total selected asset bytes, 48 MB saved envelope). Publication uses an exclusive atomic link so competing or failed saves cannot replace a prior revision. Unreadable or changed source evidence and corrupt personal copies fail visibly.

Import copies a self-contained snapshot into `.incline/drafts/personal/<id>/<revision>.json`, alongside a provenance receipt and required current-brief relevance note. It always sets the draft to `tentative`, even if the source was explicit, and requires project review. Current project instructions take precedence within scope. Imports never enter active insight retrieval, rewrite a profile, or authorize design changes automatically. Existing imported draft files are preserved rather than overwritten. Project draft edits cannot change personal revisions, and imports remain usable after the original checkout disappears. Automatic suggestions, global scanning and promotion remain out of scope.

To inspect an imported image reference, read the saved draft or personal revision from its returned path, verify the envelope and artifact SHA-256 values (the personal reader performs these checks), decode the chosen artifact's `contentBase64` into a temporary local file, and open that file with the host image tool. Keep its original source/event IDs and context beside the interpretation. The preview and import CLI responses omit encoded bytes to keep output bounded; the immutable files retain them. Missing artifacts have no bytes to decode and remain a stated evidence gap.
