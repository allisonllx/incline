# Recoverable reference exploration

Use within Design when a substantial reference task has competing interpretations, or when resuming an exploration the user asked you to remember. Read [visual studies](visual-studies.md) for actual sample generation and rendered inspection. A clear correction or settled direction does not need a graph.

## Work from a broad pool

Inspect the reference as a whole and at relevant detail/state. Keep observations, mechanisms, and possible attraction separate. Build distinct, grounded hypotheses about subject, treatment, composition, interaction, and combinations where useful. These are possible explanations, not a checklist or confirmed preferences. The pool can grow as you learn; normally show only two or three coherent samples together.

Select samples for relevance, meaningful differences, and what seeing them can clarify. Keep the original available. Do not use several recolours of one assumption as the whole exploration. Named details receive priority without excluding surrounding relationships. Keep explicit constraints in every direction.

After feedback, check whether the attempt actually expressed its hypothesis. Choose an operation with a concise rationale: explore, refine, combine, park, return, reopen, or finish. “Nah” belongs to the shown sample; its cause stays unknown. A parked branch remains an option to revisit with new evidence. Return decisions change only named nodes, not every descendant. Parent links describe how an idea arose, not proof of what the user likes.

## Remember only within the requested scope

Use persistent exploration when recording is already active or the user asks to remember this exploration. Such a request authorizes the relevant checkpoints, not unrelated observation. A stop-recording request stops new feedback capture here too; do not copy user reactions into an alternative file to bypass it. Continue the requested design with current conversational context and ordinary task artifacts.

The graph links to the existing [feedback journal](iteration-feedback.md). Save exact reactions and snapshots there at meaningful checkpoints, then link them to the attempts they concern. Keep decisions based on interpretation labelled `inference`. Publication permission is not aesthetic acceptance; choosing a sample does not confirm its underlying explanation or approve the unseen implementation.

State is project-local under `.incline/studies/<id>/exploration/<revision>.json`. A revision is a complete immutable checkpoint. Local study files are hash-checked references, not an additional snapshot archive; preserve versioned source/render files and use the existing journal for copied snapshots. URLs alone are not saved visuals. Exploration does not update the profile, general knowledge index, or personal library. Curate a useful scoped finding through the existing Insights workflow when evidence warrants it.

## Read and resume

Run from the active project, or pass its absolute path:

```sh
node <skill-directory>/scripts/exploration.mjs list --project <project>
node <skill-directory>/scripts/exploration.mjs view --project <project> --id <study>
node <skill-directory>/scripts/exploration.mjs view --project <project> --id <study> --node <hypothesis> --limit 10
node <skill-directory>/scripts/exploration.mjs evidence --project <project> --id <study> --node <hypothesis>
node <skill-directory>/scripts/exploration.mjs read --project <project> --id <study>
node <skill-directory>/scripts/exploration.mjs read --project <project> --id <study> --revision 1
```

Reads create no files. Missing studies return null or an empty list; corrupt checkpoints fail visibly. `view` shows the brief, active/untested alternatives, parked summaries, recent decisions, and omitted counts. It preserves IDs for further reads and includes selected-node ancestry. `limit` accepts 1–50 and limits presentation, never the saved graph. Sources corrected through supersession are flagged for review; this is not a judgment that every dependent hypothesis is wrong.

Use `evidence` to resolve only relevant sources and reactions, then open the actual available images with the host image tool. Statuses are `available`, `unavailable`, or `changed`. Changed journal bytes are not presented as the original event. Missing assets warn without erasing the rest of a study. An integrity check does not mean an image was visually inspected.

A recorded `inspected` observation describes what the agent actually saw at that checkpoint, not whether the visual is still retained. If an inspected live page could not be captured, record an explicit unavailable source and the retention gap. On resume, treat that observation as a historical report; do not claim to have re-inspected the missing visual. Never relabel an agent observation as user-reported to work around missing assets.

## Save a checkpoint

```sh
node <skill-directory>/scripts/exploration.mjs save --project <project> --input <absolute-checkpoint.json>
```

The input below is a complete illustrative starting checkpoint based on a supplied description. Replace it with the task's actual evidence; do not save the example as user taste.

```json
{
  "version": 1,
  "id": "opening-study",
  "expectedRevision": 0,
  "brief": {
    "goal": "Explore the supplied reference for the opening section",
    "scope": "This project's opening section",
    "constraints": ["Keep the existing navigation"]
  },
  "artifacts": [{
    "id": "reference-description",
    "role": "reference",
    "source": {"kind": "unavailable", "reason": "Only the supplied description is available"}
  }],
  "observations": [{
    "id": "reported-tree",
    "artifactId": "reference-description",
    "basis": "user-reported",
    "region": "Opening section",
    "state": "Description only",
    "description": "The supplied description mentions a tree beside prominent typography"
  }],
  "hypotheses": [{
    "id": "focal-contrast",
    "parentIds": [],
    "observationIds": ["reported-tree"],
    "claim": "The contrast between organic imagery and type may be appealing",
    "expectedChange": "Explore an organic focal shape beside a strong heading",
    "openQuestions": ["Does visual inspection support this relationship?"]
  }],
  "attempts": [],
  "decisions": []
}
```

On update, read the latest checkpoint, remove the returned `revision`, `recordedAt`, and `requestHash` envelope fields, and set `expectedRevision` to that revision number. Preserve earlier rows and append the new ones. Existing attempts may gain feedback links; their hypotheses and artifact IDs cannot be rewritten. Identical retries return `already-saved`, including after another revision exists. Conflicting or stale requests fail; reread and reconcile without overwriting.

### Record shapes

All IDs use letters, digits, underscores, or hyphens, at most 80 characters. Content strings are non-empty and at most 4,000 characters. Required arrays may be empty unless noted. Checkpoints are limited to 1,000,000 bytes; this is a storage safeguard, not a desired number of hypotheses.

- **Artifact:** `{id, role, locator?, source}`. Role is `reference`, `original`, `sample`, or `implementation`. Source is exactly one of `{kind: "study-file", path, sha256}`, `{kind: "feedback", batchId, artifactId, recordHash}`, or `{kind: "unavailable", reason}`. File paths are relative to this study's directory, without traversal or symlinks. Hashes are SHA-256 of exact bytes. New sources must resolve and match; do not invent hashes or label a visual inspected unless you actually inspected it. Existing journal snapshots retain their 8 MB per-artifact bound.
- **Observation:** `{id, artifactId, basis, region, state, description, supersedesId?}`. Basis is `inspected` or `user-reported`. Include the actual viewport/state in `state`. Keep described evidence separate from visual inspection.
- **Hypothesis:** `{id, parentIds, observationIds, claim, expectedChange, openQuestions, supersedesId?}`. Link at least one observation. Multiple parents are allowed; cycles are not. All attraction claims remain inference.
- **Feedback link:** `{batchId, eventId, recordHash}` pointing to original journal evidence. Pin the exact record bytes; do not count the same event again because several branches refer to it.
- **Attempt:** `{id, hypothesisIds, artifactIds, feedbackLinks}` with at least one hypothesis and artifact. Use a new attempt/artifact ID for a revised design so the previous reaction still has an exact target.
- **Decision:** `{id, action, nodeIds, attemptIds, returnToIds, explanation, uncertainty, revisitWhen, basis, feedbackLinks}`. Use non-empty content for the explanation, uncertainty, and condition for reconsideration. Actions and basis are described below. Arrays refer to existing rows.

`explore`, `refine`, `combine`, and `reopen` activate the named nodes; `combine` requires at least two. `park` preserves and parks its targets. `return` parks `nodeIds` and activates a non-empty, disjoint `returnToIds`; other actions use an empty return list. `finish` closes the session without deciding aesthetic truth. Further exploration needs an explicit `reopen` decision. Stop when the user selects/stops, a scoped task is resolved, or the stated budget is spent.

Decision basis is `inference` or `user-instruction`. The latter requires a linked user directed-edit or reversion event. A rejection or preference can inform an inferred decision without becoming a direct instruction. The validator checks evidence types and integrity; the agent remains responsible for faithful interpretation.

Corrections append new observations/hypotheses with `supersedesId` pointing to the latest row being corrected. Refinements use `parentIds` instead. Superseded content remains available by ID and in old attempts; it is not offered as a fresh alternative. Changing the goal, scope, or constraints starts a new study. Leave the old one intact and identify the related prior study in the new brief when useful.
