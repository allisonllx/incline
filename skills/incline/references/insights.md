# Project insights: a separate, revisable view

Use this when the user asks to summarize recurring findings, curate design memory, or apply previously recorded feedback. The agent authors insights; the command validates links and stores revisions. It does not infer preferences automatically. Original `.incline/feedback/` files remain unchanged. Cross-project synthesis and personal-library promotion require a separate explicit request and are not provided by this command.

## Read first, retrieve selectively

Run `node <skill-directory>/scripts/insights.mjs read --project <project>` for current findings. Use `--aspect spacing` or `--id control-spacing` to narrow the output. Empty storage returns an empty list without creating files. Superseded findings remain visible with their status; do not apply them as current instructions.

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

## Limits and boundaries

The insights layer is local and separate from collection state, drafts and library snapshots. It neither replaces the evidence archive nor rewrites `profile.md`. There is no browser insights editor, full-text retrieval engine or autonomous consolidation service. The first version supports exact aspect/ID filtering and targeted provenance retrieval. Older ad hoc feedback folders need explicit conversion before they can supply batch/event links; do not fabricate records to make a finding save.
