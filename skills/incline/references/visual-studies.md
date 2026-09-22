# Visual studies for reference transfer

Use within Design when the user wants samples or a substantial change needs a visible composition before implementation. This is agent-generated exploration of the actual project, separate from the discovery quiz. No extra skill, image service, or storage migration is required.

## Establish the decision

Inspect the current design and the whole reference, then relevant details. Use the critique guide's [appeal hypotheses](design-critique.md#infer-plausible-appeal-from-the-whole-reference) when the brief is sparse. Distinguish what the user said, what you observed, and what might explain the appeal. The agent proposes plausible directions; the user need not supply a design analysis before seeing them.

Map each central quality to its intended target role and a visible change. Name the current features worth preserving, explicit keep instructions, and elements that may yield to the new focal point. Do not silently omit a central feature because it is difficult or may compete with existing decoration. Explore simplifying or replacing competing elements within the authorized scope. Where a keep instruction rules that out, show a compatible treatment or explain the conflict.

## Make comparable samples

Keep the scope small: a representative screen or section with enough surrounding content to judge composition. Use the same real copy, content, viewport, and relevant state across candidates. Give each comparable care and visual completeness; do not make one an attractive mockup and another an unfinished wireframe.

Choose samples around the uncertainty that changes the design. If the appeal itself is unclear, show two or three coherent adaptations of the strongest grounded hypotheses—for example, one exploring a graphic treatment and another its focal composition. Say what each tests without claiming to know the user's reason. Do not make one candidate per minor detail or combine every hypothesis into an overloaded result. Keep shared qualities where they support each composition; this is design exploration, not an experiment that isolates a causal preference.

For a conflict between a new feature and the existing identity, normally show two directions:

- **Reference feature leads:** give the introduced quality a clear focal role; simplify competing features where allowed. Preserve the product's task and explicit constraints.
- **Current identity leads:** retain the established focal hierarchy and adapt the new quality to a supporting role. Make the adaptation visible and explain its smaller role.

Add a **combined direction** only when it has a coherent hierarchy and differs meaningfully from the other two. Combining every motif or averaging their colours is not a distinct design idea. Feature dominance is a useful axis when it is the unresolved decision, not a mandatory template for every reference. Keep the unchanged original available as a baseline; a refinement sample is not the original.

Use stable neutral IDs such as A and B with short descriptions of the actual trade-off. Do not present one as the correct, safe, or premium answer, or manufacture a weak option to steer the choice. Differences should express composition, focal treatment, imagery, or interaction—not merely recolours. Do not increase whitespace by default.

Choose the medium that exposes the uncertainty: a small coded composition for layout or behaviour, an image mockup for art direction, or suitable assets within a coded study. Show motion when motion is the deciding quality; a still does not demonstrate it. Use image generation only when useful and available, preserve its provenance, and do not install or require a service just to follow this workflow. A reference's distinctive asset needs an appropriate sourced, generated, or authored treatment; generic shapes are not proof the treatment transferred. Keep core text and controls semantic in the implementation.

Render and inspect the samples before presenting them. Display them inline or in a local preview at readable size, with the same framing and a brief explanation of what changes and what stays. A prose description or invisible file path is not a displayed design. If previews cannot be rendered or shown, report the limitation and clarify the consequential decision; do not claim a visual comparison occurred.

## Select and remember in context

When the user wants to choose, ask which direction or specific parts should carry forward. A choice or “this is closer” is sufficient; an explanation is optional. Allow the original, neither, a tie, or a qualified combination. Wait for their answer before implementing a candidate; silence or elapsed time is not a selection. If they already selected a direction, apply it. If they explicitly delegate the choice, proceed using the brief and record that it was the agent's decision, not a discovered user preference.

Keep the exact sample version and the user's qualifications. “A's illustration, B's layout” defines a new combination, not acceptance of both complete samples. Make an updated study if that combination leaves a consequential composition unresolved; otherwise implement the specified combination without another ceremony. Choosing a study directs the build; it does not approve the unseen final implementation or authorize publication.

Preserve the study notes and available visual/source files in a task-specific folder, normally `<project>/.incline/studies/<study-id>/`. This is an agent-managed task artifact, not a new canonical profile or a folder the index automatically discovers. Use new versioned filenames when revising samples so a selected view remains recoverable. State viewport/state and distinguish screenshots, image mockups, source files, and unavailable assets. A URL or commit alone is not a saved visual.

When recording is active or the user asks to remember the choice, use [Feedback](workflows/feedback.md). A request to remember this choice authorizes that checkpoint, not unrelated ongoing observation. Link the exact options compared, chosen version, and relevant original/reference detail through the existing artifact snapshot mechanism. Keep explicit stop-recording instructions in force. Group the comparison and its reaction in one meaningful batch rather than creating a folder for each candidate or visual tweak.

- “Build B” is a `directed-edit`; aesthetic disposition stays unknown unless the wording expresses preference.
- “I prefer B to A; keep A's illustration” is contextual `positive` evidence plus the stated build instruction, faithfully recorded with qualifications. An optional `preferred` disposition needs that explicit comparison.
- An agent's delegated selection or explanation is a `hypothesis` with `evidence: inference`, never an invented user reaction.
- The losing option is not automatically disliked. A composition choice does not establish separate preferences for its colour, spacing, or every token. Reasons remain unknown when none were given.

Use current linked insights and the selected task artifact on resume. Update a scoped finding only when useful, through the existing insights workflow; do not create one per option. No automatic global preference, library promotion, confidence score, or rewriting of earlier choices. If the user changes their mind, preserve the old version and append the correction.

## Build and check the chosen direction

Carry forward the selected sample's composition, focal scale, asset treatment, reading order, and stated exceptions. Compare the original, the chosen study, and the rendered implementation at comparable sizes. Inspect important regions at readable scale; a full-page thumbnail can hide a missing or weakened focal element. Adapt to narrow viewports and real interaction states without silently replacing the chosen concept.

Judge separately: did the intended quality transfer, is the whole composition coherent, and does it serve the task? Fix material departures within scope. Explain an implementation constraint and resolve any consequential trade-off instead of substituting an easier visual treatment unnoticed. A pixel-similarity score can help reproduce a chosen mockup; it cannot judge inspiration transfer across different content or establish aesthetic preference. Keep the original as a valid winner and distinguish your assessment from the user's reaction.

## Compact study note

Use only the fields needed for the task. This Markdown note supports the existing journal; it is not a required JSON schema.

```markdown
# Study: <id> / <surface>
Scope and explicit keep instructions:
Current version and inspected viewport/state:
Reference/detail path or locator; missing evidence:
User's stated attraction:
Observed relationships and supporting regions:
Plausible appeal hypotheses; what each sample explores:
Unresolved questions (not a required user questionnaire):

| Quality and evidence | Intended role | Visible change | What stays / yields |
| --- | --- | --- | --- |

Original: <version and visual path>
A: <trade-off, version, visual/source paths>
B: <trade-off, version, visual/source paths>
Optional combined direction: <distinct rationale and paths>

Choice: <pending, actual user words + source, or explicitly delegated>
Selected version/parts and qualifications:
Linked feedback record, if authorized:

Implementation version and inspected views:
Transfer / coherence / task fit observations:
Remaining differences and unverified states:
Actual user reaction, if any:
```
