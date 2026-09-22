# Reference interpretation and design critique

Use this when applying website references, improving a frontend, or responding to “this still does not look better.” The goal is a composition that serves the actual product and expresses the chosen direction. Do not substitute a recolour, a fashionable component kit, or a checklist score for that result.

## Establish what is known

Read the user's exact feedback, project evidence and explicit qualities to preserve. Separate user-endorsed qualities from visible observations and your interpretations. Inspect rendered references with available browser/image tools; text extraction cannot establish spacing, colour balance or composition. State which pages, viewports and interactions you actually inspected. If the original target or prior version is missing, record the gap instead of asserting a specific visual diagnosis.

There is no single canonical list of exactly eight design principles. Use the following eight lenses as a practical critique framework. They overlap; they are not eight independent metrics or fixed rules for every style.

| Lens | What to inspect and decide |
| --- | --- |
| Hierarchy and emphasis | Identify the first, second and third things a viewer should notice. Do size, weight, placement and contrast support that order? Which secondary elements currently compete with the primary task? |
| Whitespace | Compare spacing within a group, between groups and between sections. Space should clarify relationships and give important content room. Large empty gaps are not automatically elegant, and dense task interfaces need not resemble spacious portfolios. |
| Alignment | Find the recurring edges, baselines and column relationships. Make deviations intentional. Check labels, controls and content together rather than aligning each component in isolation. |
| Proximity and grouping | Related information should read as related before the user parses every label. Prefer clear spacing/group structure; use cards, rules and backgrounds when they clarify a boundary rather than wrapping everything in a box. |
| Contrast and legibility | Use type scale, weight, value and colour to distinguish roles. Keep secondary text readable and interactive states identifiable. Selective bold emphasis works only when surrounding content is quieter. Check accessibility with appropriate tools; aesthetic judgment is not a contrast measurement. |
| Balance and proportion | Compare the visual mass of type, images, panels and empty space. Consider deliberate asymmetry and focal-point placement. Adapt scale to the target's content and tasks; a portfolio headline is not a default dashboard heading. |
| Repetition and rhythm | Reuse spacing relationships, type roles and component treatments so the page feels connected. Vary emphasis where content warrants it. Repeating identical cards everywhere can flatten hierarchy rather than establish useful rhythm. |
| Unity and coherence | Can the composition be explained by a consistent visual concept? Do navigation, content, palette, type, imagery and interaction support it? Remove choices that compete with the concept or make the main task harder. |

## Extract relationships before ingredients

### Infer plausible appeal from the whole reference

“I like this website” is enough to start interpretation; the user need not enumerate its appealing details. Inspect the whole composition before narrowing to a mentioned feature: focal mass and negative space, typography relationships, imagery and drawing treatment, material/texture, recurring concept, and interactions or motion you actually observed. A named detail is a priority, not an exhaustive list. Explicit “only use this” and keep/avoid instructions remain binding.

Build a broad pool of distinct plausible explanations before narrowing to samples. Let meaningful differences and the task budget determine its size; two or three displayed samples are not a limit on hypotheses, and new evidence can introduce new possibilities later. Ground each explanation in an observed region or behaviour, explain the visual mechanism, and connect it to the target's task. Consider combinations: a technical drawing treatment against warm paper and expressive type may matter more than any ingredient alone. Use relevant prior findings within their scope; do not assume the reference's loudest colour or most obvious object is the reason for liking it. Distinguish observation (“the illustration occupies much of the opening view”) from hypothesis (“that focal presence may be part of the appeal”). Do not claim the user's motive or the original designer's intent as fact.

For example, a reference with an ASCII tree and large serif heading might appeal through the natural subject, its printed/technical character, or the relationship between a large organic focal mass and type. Inspect which explanations the source actually supports. If the user mentions the tree, preserve that priority while exploring its treatment and surrounding composition; do not reduce the brief to adding a small tree icon.

Within an authorized design task, use these hypotheses to make reversible experiments without asking the user to confirm every inference first. Make materially different explanations visible through [visual studies](visual-studies.md); explain briefly what each explores, then let the user react. A simple choice or “closer” is useful even without a rationale. Ask a focused question when missing evidence or scope prevents a useful experiment, not for an exhaustive inventory of likes. If the reference is inaccessible, mark the gap rather than inventing an inspection. Hypotheses may guide exploration while remaining provisional in memory; selection alone does not establish why the user preferred a composition.

### Map interpretation to a target change

For each useful reference, make a compact transfer note:

- **Evidence:** the user's stated attraction and what you actually observed, separately.
- **Mechanism and hypothesis:** how the treatment creates the effect, and why it might appeal in this context—for example, a large weight/scale contrast against quiet body copy creates emphasis, or a repeated interaction metaphor makes varied content feel connected. Keep inferred attraction distinct from confirmed preference.
- **Adaptation:** which relationship would help this product's content and primary task.
- **Boundary:** what should not transfer literally, and what remains unknown.

“Take purple from image A and green from image B” is not a rationale. A strong reference can contain many colours because they occupy distinct roles, proportions and contexts. A photograph's colours need not become UI theme colours. Likewise, liking a site's desktop metaphor does not authorize adding a fake operating system to an unrelated workflow.

Before changing the frontend, state a short design thesis: intended character, focal point, reading order and the few structural changes expected to help. Tie it to the user's brief. Connect each central reference quality to a visible target change and name what stays or yields. If a distinctive new feature conflicts with the existing identity, use [visual studies](visual-studies.md) to make that trade-off visible rather than silently dropping the feature or stripping the current design. Do not force an extra approval ceremony when the direction is already settled; resolve consequential open choices through a focused question or comparison.

## Make colour serve the composition

Preserve an established palette when it is not the problem or the user asks to keep it. When colour changes are warranted, assign roles: background, surfaces, primary/secondary text, action emphasis and semantic states. Evaluate hue relationships together with saturation, lightness, occupied area and adjacency in the actual layout.

Multiple hues can be harmonious; a single hue can still be poorly composed. Do not turn one failed combination into a permanent ban or assume “professional” means monochrome. If references conflict, choose the relevant qualities deliberately and reconcile them within one visual system instead of giving every source equal prominence. Keep brand and semantic colours distinct where their meanings differ.

A useful diagnostic is whether grouping and hierarchy would still be understandable without the accent colour. This is not a requirement to make every design monochrome; it exposes when colour is compensating for weak structure.

## Diagnose and revise the target

Inspect the target's actual rendered state before claiming it needs particular fixes. Name the two or three most consequential problems, the evidence for them and the intended effect of each change. Prefer fixing composition, content hierarchy, grouping and typography before polishing shadows or adding decoration when those structural issues are present.

Express changes concretely: “separate the primary action from three equally weighted secondary actions,” “bring the label closer to its control than to the next group,” or “reduce the number of competing heading weights.” Avoid “make it cleaner” as the whole specification. Preserve useful density, identity and explicit user choices.

When the user requests alternatives or direction remains uncertain, follow [visual studies](visual-studies.md) for comparable samples, contextual selection, and a recoverable visual target. Do not generate an obligatory set of alternatives or restart a full quiz for clear feedback. Original ideas remain welcome; references inform the reasoning rather than imposing replicas.

## Inspect the result, not just the code

Compare the before/after with the same content, viewport and state where possible. Include the chosen study and its qualifications when one exists; inspect the focal treatment at readable scale so a minor style pass cannot stand in for an agreed composition. Check a representative narrow viewport and relevant interaction states, including keyboard focus and longer content when applicable. Inspect whether the primary task became clearer, the intended qualities survived, and the visual concept is coherent. Do not claim responsive or interaction validation for views you did not inspect.

For contextual spacing, inspect label/control and text/button gaps, paragraph/divider separation, within-group versus between-group spacing, and continuity between related outputs. Check wrapping at a narrow viewport and changed interaction states. Large gaps can fail as readily as cramped ones; dense content can serve the task. Preserve stable controls and meaningful dimension colours when applicable. Do not universalize one project's pixel values.

Identify the exact artifact/version and each viewport/state inspected. Record a concise assessment with observed improvement, remaining weakness and unverified conditions. A successful build proves neither visual improvement nor user satisfaction. If a recolour leaves the composition weak, keep investigating the structure rather than declaring success. If tools cannot render the app, state that visual quality remains unverified.

Save actual user reactions to the relevant artifact/version using the feedback workflow. Keep your assessment as interpretation. Explicit approval of the whole result does not confirm every individual token; silence and unchanged elements do not become positive preference evidence.

## Behavioural evaluation cases

These are realistic review scenarios, not claims of automated aesthetic validation:

- **Mixed reference colours:** user admires two references, gives no palette instruction. Expected: identify endorsed qualities, explain roles/proportions and choose a coherent adaptation. Failure: combine their most salient colours by default.
- **Palette reverted, result still disliked:** expected: inspect the target and reassess hierarchy, spacing and composition. Failure: claim the colour fix resolved the design complaint.
- **Expressive portfolio → dense product app:** expected: translate deliberate emphasis or conceptual unity while protecting task density and navigation. Failure: transplant a giant hero or desktop gimmick without a product reason.
- **Bold typography reference:** expected: create a deliberate scale/weight relationship with restrained supporting content. Failure: make every label bold or oversized.
- **Colourful but well-organized target:** expected: assess the relationships and preserve effective colour. Failure: force neutral minimalism because another user liked a restrained reference.
- **Unavailable old screenshot:** expected: distinguish the user's reported dissatisfaction from a directly observed diagnosis. Failure: invent details or pretend to have compared versions.
- **Bare reference plus “I like this”:** expected: inspect the full reference, propose evidence-grounded explanations of appeal, and test consequential differences visually within the requested task. Failure: require a detailed list of likes, produce only generic adjectives, or copy the most salient colour.
- **User mentions one detail:** expected: prioritise it while considering its treatment and surrounding relationships. Failure: treat unmentioned qualities as excluded or transfer a tiny literal object while losing its focal role.
- **User picks the closer sample without explaining why:** expected: continue from that sample, keeping the cause of preference provisional. Failure: demand a rationale or promote every sampled property to confirmed taste.
- **New motif versus existing identity:** expected: compare a direction led by the introduced feature with one led by the current identity, preserving explicit constraints and comparable quality. Failure: omit the new feature without exposing the trade-off, or offer two recolours of the same composition.
- **Qualified sample choice:** expected: retain the exact versions and selected parts, implement the choice, and inspect its rendered outcome. Failure: infer a global preference, call an unchosen option disliked, or treat sample selection as final implementation acceptance.

Evaluate these on real outputs and user reactions over time. This guidance improves the process; it does not retrain the underlying model or guarantee taste alignment.
