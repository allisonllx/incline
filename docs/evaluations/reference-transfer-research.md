# Reference transfer: source audit and experiment design

Inspected 2026-09-22. The source audit below led to an experimental skill-guidance integration, described under Implementation status. It is not a claim of aesthetic improvement. No external skill was installed. Sources were cloned into a temporary directory and inspected as research material; their commands and instructions were not activated.

## Finding

Incline already asks agents to inspect references, explain mechanisms, preserve useful qualities, form a design thesis, and compare rendered results. Two operational links need strengthening: generating grounded hypotheses about appeal when the user gives few details, and carrying that interpretation through a concrete visual target into implementation. A correct memory record and a successful build do not establish that either link worked.

There are four distinct failure points:

1. **Interpretation:** the agent requires an exhaustive brief, or never proposes plausible explanations of the reference's appeal beyond literal named ingredients.
2. **Selection:** the agent chooses secondary qualities and discards the feature the user cared about.
3. **Translation:** it identifies the feature but never specifies its role, scale, composition, asset, or behaviour in the target.
4. **Execution:** the implementation omits or weakens that specification, and review fails to notice.

An image comparison can help with execution. It cannot repair a brief that already discarded the intended quality. Nor does a close match establish that the design is good. The inspected extraction workflows help explain observed design mechanisms; they do not demonstrate that those mechanisms are what a particular user likes. Incline must connect tentative interpretations to visible experiments and subsequent reactions.

## Pinned sources and useful mechanisms

### Senlin: grounded extraction

Revision: `6dce223f2f5665d3636ca9a44ec3a7aa1322a9b8`.

The [entry workflow](https://github.com/senlindesign/taste-skill/blob/6dce223f2f5665d3636ca9a44ec3a7aa1322a9b8/SKILL.md) separates browser capture, measurements, patterns, design trade-offs, and output review. It distinguishes recurring choices across pages from local decoration. This is useful for URL references, but its output is extracted guidance, not an implemented adaptation.

The [trade-off prompt](https://github.com/senlindesign/taste-skill/blob/6dce223f2f5665d3636ca9a44ec3a7aa1322a9b8/references/step3-taste.md) requires a trigger, decision, reason, evidence, and plausible alternative. Borrow the evidence structure; label inferred reasons as hypotheses. Observing a page does not reveal its author's actual intent or prove that a user endorses a feature.

Inspecting the [extractor](https://github.com/senlindesign/taste-skill/blob/6dce223f2f5665d3636ca9a44ec3a7aa1322a9b8/references/extract.js#L109-L121) exposed an important precision limit: colour area sums element rectangle areas, including nested and below-fold elements. It is not a measurement of visible, non-overlapping screenshot pixels. Do not use that number as calibrated colour coverage. The entry workflow's under-5% colour rule also cannot establish whether a small accent is brand-defining.

The [evaluation definitions](https://github.com/senlindesign/taste-skill/blob/6dce223f2f5665d3636ca9a44ec3a7aa1322a9b8/evals/evals.json) check output structure, specificity, and expected signals for named sites. These are useful extraction checks, but do not demonstrate that a downstream redesign improves user preference.

**Decision:** borrow selective screenshot/DOM grounding and explicit trade-offs. Do not add a mandatory exhaustive extraction stage to every edit or import its aesthetic heuristics as user preferences.

### Impeccable: preserve the composition through execution

Revision: `83c2c735777c68e30ea536ab9cc97f7843456945`.

The [new-work workflow](https://github.com/pbakaus/impeccable/blob/83c2c735777c68e30ea536ab9cc97f7843456945/skill/reference/new-work.md) records the intended first viewport and a direction contract, then inspects actual captures. It distinguishes a build guided by a visual mockup from one designed directly in code. A rendered target and an explicit composition are stronger handoffs than style adjectives.

The [visualization workflow](https://github.com/pbakaus/impeccable/blob/83c2c735777c68e30ea536ab9cc97f7843456945/skill/reference/visualize.md) connects a selected composition to regions and the assets needed to realise them, while retaining semantic text and controls. This addresses the tendency to replace a demanding illustration with an easy decorative approximation. Its approval and variation procedures should be adapted to the user's existing authorization rather than imposed on every correction.

The [comparison implementation](https://github.com/pbakaus/impeccable/blob/83c2c735777c68e30ea536ab9cc97f7843456945/crates/comp-verbs/src/comp_diff.rs#L53-L126) computes weighted structure, colour, detail, and horizontal-band measurements. Region types affect weights; thresholds produce labels such as match, drift, and missing. It also produces paired crops and visual comparison artifacts. This is executable fidelity machinery, not just exhortation. Its scores are heuristic measures of reproduction, not validated measures of taste. Use such comparison against a chosen target mockup, not against an inspiration site whose content and layout deliberately differ.

The [craft guidance](https://github.com/pbakaus/impeccable/blob/83c2c735777c68e30ea536ab9cc97f7843456945/skill/reference/craft-floor.md) also contains categorical aesthetic rules and model-specific defaults. Those are the author's priors. They should not overrule the project's reference or the user's preferences.

**Decision:** strongest workflow to adapt for a first experiment: explicit composition, appropriate assets, and region-level rendered review. The full CLI, detectors, random concept selection, and all default prohibitions are not prerequisites for testing that mechanism.

### Leon: visual targets before implementation

Revision: `5217fb45be2c0b302f29c9cd31cbd3237501c684`.

The [image-to-code prompt](https://github.com/Leonxlnx/taste-skill/blob/5217fb45be2c0b302f29c9cd31cbd3237501c684/skills/image-to-code-skill/SKILL.md) requires generated section images followed by detailed analysis and implementation. It is strongly biased toward image generation, low visual density, and generous spacing; it is also a substantial 1,228-line prompt. Its useful mechanism is making a visible target before code. Mandatory generation of many images, prohibiting crops, and giving generated imagery primary authority are poor defaults for reference adaptation.

The [redesign prompt](https://github.com/Leonxlnx/taste-skill/blob/5217fb45be2c0b302f29c9cd31cbd3237501c684/skills/redesign-skill/SKILL.md) includes rules favouring a single accent and more whitespace, with a font swap first in its suggested priority order. Such choices may help particular pages but cannot serve as universal taste guidance.

**Decision:** test a visual study when composition or imagery is uncertain. Permit either a small coded composition or an image mockup, depending on the feature. Do not install overlapping prompts as an undifferentiated stack.

## Changes worth testing in Incline

Keep the existing project evidence, feedback journal, insights, and knowledge index. This experiment needs an execution change, not a storage migration. Use an ordinary task folder for the study and artifacts; use existing feedback mechanisms only for actual reactions.

Add a small, explicit bridge to the Design workflow for substantial reference-led changes:

| Decision | Required evidence |
| --- | --- |
| What might appeal in the reference? | Actual user statement, observed region/relationship, and plausible explanations grounded in it; distinguish these. A broad expression of liking is sufficient input. |
| Which uncertainty is worth exploring? | Competing interpretations that would visibly change the target; use samples to explore them without requiring an exhaustive user explanation. |
| What should it do in this project? | A specific visual or interaction role and the qualities to preserve. |
| What will visibly change? | A composition, focal scale, asset treatment, reading order, or behaviour that can be inspected. |
| What will yield to that change? | Existing competing element to simplify or replace, where authorized; unresolved scope stays explicit. |
| Did it survive implementation? | Reference detail, chosen study, and rendered target viewed together at comparable sizes. |

A liked feature should not silently disappear because it is harder to implement. Conversely, liking a feature is not automatic authorization to copy it literally. Named qualities prioritise interpretation without excluding the rest of the composition, unless the user's instruction expressly narrows it. Within the requested task, provisional hypotheses can guide reversible visual experiments without becoming confirmed memory. When meaning remains consequentially ambiguous, use a visual comparison or focused question; do not require the user to first produce the analysis. Clear small edits bypass this process.

Keep three judgments separate: feature transfer, overall design quality, and fitness for the target's task. The original may win. Merely increasing the amount of change is not success. Automated checks can verify presence, geometry, overflow, and functionality; the user's aesthetic judgment stays separate.

## Controlled trial protocol

Use a real failed reference-transfer case and freeze the starting code, supplied references, content snapshot, user brief, model/settings, tools, and resource budget. Supply identical relevant prior feedback to all conditions when isolating execution, and record that choice.

- **A:** agent with the brief and references, without Incline's Design workflow.
- **B:** the same inputs with Incline's Design workflow at `28da52ba263b9f8c90b826a610990b7ef1dfd04b`, before the experimental visual-study guidance.
- **C:** B plus grounded appeal hypotheses, the explicit transfer bridge, a small visual study, and comparison against that study. Record the exact experimental files/revision used.

Include sparse-brief cases: a reference with only “I like this,” and one with a single named feature. Keep each case's brief identical across conditions; do not give C a richer explanation of attraction. Check whether interpretations cite observed relationships, whether samples express meaningful differences, and how much additional explanation the user had to supply. User preference and explanation burden are separate outcomes. These bundled conditions do not isolate which added mechanism caused a difference; a later ablation can do that if the workflow shows promise.

Use fresh contexts so one condition cannot borrow another's solution. A full external skill can later be a separate condition; C must not be called an Impeccable benchmark because it adapts selected mechanisms. Do not install globally for this experiment: project-scoped prompt loading is sufficient; scope any required tools to the trial.

Render the same content, viewport, and relevant states. Include the untouched original in the review. Hide condition labels, vary presentation order, and ask which output the user prefers, whether the intended quality transferred, and what became worse. Allow ties, rejection of all candidates, and no discernible difference. Record cost and time, including image generation. Repeated runs are needed before generalising beyond a promising example.

Pairwise comparison here is evaluation, not DPO or model training. A trial ends with a user-observed result; it does not infer aesthetic acceptance from permission to push.

## Work completed and limitations

- Inspected upstream prompts plus relevant extractor/comparison code at the pinned revisions above. No upstream benchmark suite or full skill execution was run.
- Compared them with Incline's current router, Design workflow, critique guide, design-guide handling, and existing feedback-loop evaluation.
- Replayed one historical portfolio CSS trial and its parent in isolated temporary copies; inspected both desktop opening views at 1280×720 and opened the live reference. This was a diagnostic replay, not conditions A/B/C above.
- The two replay copies used the same current cached content because the old generated content was not committed, and the currently installed dependencies. The live reference may have changed since the original feedback. No mobile, interaction, or aesthetic acceptance claim follows from this replay.
- Local case evidence and detailed user history remain in ignored research notes, not this public evaluation document.
- The installed Incline copy differs from this branch in retrieval/review guidance and contextual spacing checks. Its central mechanism-transfer guidance is present. The exact skill bytes used by the historical attempt were not established; do not treat it as a controlled test of this branch.

Recommended next deliverable: one representative reference-led composition and its rendered implementation, compared with the original. Establish a visible improvement before integrating more machinery or claiming better taste.

## Implementation status

The Design workflow now asks the agent to infer plausible appeal from the whole reference and routes consequential competing interpretations to [visual studies](../../skills/incline/references/visual-studies.md). The new guidance includes a compact study-note template, comparable hypothesis-led samples, reference-led and current-identity-led samples when dominance is the uncertainty, an optional coherent combination, user selection or explicit delegation, versioned artifacts, and rendered review against the chosen sample. A user can select without explaining every reason; the underlying hypotheses stay provisional. The existing journal records authorized reactions and snapshots; no runtime, profile schema, index, or global installation changed.

The user specifically requested samples that explore different dominant features before choosing what to build. That workflow requirement does not establish a preference for any one direction. A narrow edit or a settled direction does not require a fresh set of alternatives.

Structural validation checks skill validity and local reference links. Existing feedback tests cover snapshot preservation and evidence semantics. Neither validates the quality of generated samples. The following are behavioral acceptance cases for the real trial, not automated aesthetic tests:

| Situation | Expected observable behavior |
| --- | --- |
| Bare URL or screenshot with “I like this” | Inspect the whole reference; propose a few distinct, grounded explanations of appeal and show relevant adaptations without requiring detailed likes first. |
| User mentions the tree but does not exclude other qualities | Prioritise the tree and explore its treatment, focal scale, and surrounding relationships; do not reduce transfer to a literal icon. |
| Two plausible explanations imply different designs | Show the consequential difference in comparable samples; label the explanations as hypotheses rather than inventing a user motive. |
| User says one sample is closer but gives no reason | Continue from the contextual choice without demanding an explanation or confirming every property as a preference. |
| User likes a reference motif but the current design is distinctive | Show genuinely different, comparably finished compositions; keep the original available. |
| Explicit instruction to retain current navigation and palette | Both samples preserve those constraints; the new feature does not grant permission to remove them. |
| Agent thinks the new motif will compete | Explore a scoped replacement or simplification; explain a real constraint instead of silently dropping the feature. |
| “Build B” | Record a build instruction when authorized, with no inferred aesthetic endorsement. |
| “I prefer B, with A's illustration” | Preserve exact versions and qualifications; resolve any consequential ambiguity in the combined composition. |
| “Keep the original” or “neither” | Respect that outcome; do not force a winner or infer universal dislike of either style. |
| User requests a choice but has not answered | Keep selection pending; do not implement the agent's preferred candidate. |
| User delegates selection | Continue using the brief; identify the selection as an agent decision. |
| User chooses a study, then changes their mind | Preserve earlier evidence and append the new scoped instruction. |
| The implementation weakens the chosen focal treatment | Identify and fix the departure or resolve the trade-off; a passing build is insufficient. |
| Rendering unavailable, or decision depends on unseen motion | Report the visual evidence gap; do not imply the samples demonstrate the missing quality. |
| User asks only to fix a label/control gap | Make the targeted edit without a study or new quiz. |

The complete A/B/C generation trial and user preference evaluation remain pending. The historical replay above is a separate diagnostic, not a successful execution of the new workflow.
