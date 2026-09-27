# Optional overall-vibe checkpoints

Use during an active Incline Design task after a substantial visual result has been shown. This is a lightweight conversational invitation, not a mandatory survey, design-selection gate or background reminder. It helps capture positive and mixed reactions as well as corrections.

## Choose a useful moment

Offer a checkpoint after the first substantial preview, then selectively after a major change of direction or the integrated result. Do not ask after every generated asset, small edit or task completion. A coherent scene or meaningful component is a better subject than every layer in a production plan.

Skip the invitation when the user already reacted to this version, is choosing between samples, asked for a specific correction, or wants to stop. Do not request a number to complete otherwise useful feedback. Never ask the user to rate an unseen result, a broken preview or code as though it were the rendered design.

Use the host's optional-input interface when suitable, or ask conversationally. Keep both parts optional and accept a rating alone, a comment alone, both, or neither. For example:

> Optional: how much do you like the overall vibe of this version for this project?
>
> **1 — Not for me · 2 — Not quite · 3 — Mixed · 4 — Like it · 5 — Love it · Skip**
>
> Any comments on what feels right or off are welcome. Your rating or comments can help Incline better understand what resonates with you here; neither is required.

Adapt the wording to the actual artifact and context. Do not preselect or suggest a score. Do not imply that a complete explanation is expected, or that a number reveals the user's thought process. If the user has already provided a different scale or a different question, retain those terms instead of silently converting them to this example.

This invitation does not block authorized work. If the user skips, ignores it, or moves on, continue without a rating or invented reaction. Do not repeat the invitation for the same version or on the next minor edit. Respect a request for fewer or no rating prompts without stopping separately authorized feedback recording. A material design-selection question still follows its own waiting rules; an unanswered optional rating is not an answer to that question.

## Interpret only what was expressed

- The rating describes the user's overall reaction to this version in this project. It is not a technical quality score, approval to publish, or endorsement of every component.
- Comments add partial detail. A positive rating with one criticism still preserves both. Neither a criticism nor a compliment explains the whole rating, and unmentioned properties and strengths of preference remain unknown.
- A high score does not automatically create `acceptance`, an explicit instruction or a global taste preference. A low score without explanation does not tell you which feature to remove. Do not guess scores from “push,” silence, sample selection or your own inspection.
- Keep the actual question and scale: liking the vibe, matching the brief, and readiness to ship are different judgments. A change in score across versions may be informative in context, but does not identify its cause. Do not average across projects or convert ratings into confidence or an optimization target.

Use volunteered comments to guide the next change. Ask a focused follow-up only when an unresolved ambiguity materially affects that change; do not require a diagnosis after a low score. Consult the existing reference and exploration evidence when deciding what else to try.

## Preserve the response and its target

Recording still follows [Feedback](workflows/feedback.md): invoking Incline or answering an optional question does not automatically activate persistent recording. Save when recording is active or the user explicitly asks to remember this checkpoint. Respect stopped recording. Existing records and personal-library boundaries are unchanged.

Use the journal's `reaction` kind for a response that need not be classified as positive, negative or accepted. Preserve the exact response in `text` (or label a faithful summary), its source and the project/version context. Link the exact shown artifact using the existing snapshot mechanism before it is replaced; a missing screenshot or motion capture is an explicit gap, never a reason to attach a newer version.

When a numeric response and its complete scale are known, the event may include `rating`:

```json
{
  "id": "v2-overall-reaction",
  "kind": "reaction",
  "evidence": "verbatim",
  "text": "4 — love the tree, but the heading still feels cramped",
  "source": "User reply to the V2 preview",
  "occurredAt": null,
  "context": "Overall portfolio V2; comment covers only some qualities. Other properties and reasons remain unknown.",
  "artifactIds": ["v2-shown"],
  "rating": {
    "value": 4,
    "min": 1,
    "max": 5,
    "question": "How much do you like the overall vibe of this version for this project?",
    "minLabel": "Not for me",
    "maxLabel": "Love it"
  }
}
```

Include the referenced artifact in the surrounding [feedback batch](iteration-feedback.md#batch-format), with a saved `path` or a `locator` and `missingReason`. Store the actual question and endpoint labels, not the example if different wording was used. If intermediate labels differ from the example, retain the full offered scale in `context`. If the scale or number is ambiguous, omit `rating`, retain the original wording and explain the uncertainty; do not coerce or invent values. A comment-only response omits `rating`. A skipped or unanswered invitation creates no rating event and is not zero.

Group a rating and its comment in one reaction rather than counting them as independent support. A separate explicit instruction from the same reply can have a linked `directed-edit` event, without treating the repeated source as another vote. Curated findings should preserve the overall scope, qualifications and gaps. If a prompt run is involved, link its exact revision/run and this journal event in context; do not force the number into a positive/negative/accepted run status. Optional Jev review does not become automatic because a rating exists.
