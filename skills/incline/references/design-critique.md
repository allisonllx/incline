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

For each useful reference, make a compact transfer note:

- **Evidence:** the user's stated attraction and what you actually observed, separately.
- **Mechanism:** how the treatment creates the effect—for example, a large weight/scale contrast against quiet body copy creates emphasis, or a repeated interaction metaphor makes varied content feel connected.
- **Adaptation:** which relationship would help this product's content and primary task.
- **Boundary:** what should not transfer literally, and what remains unknown.

“Take purple from image A and green from image B” is not a rationale. A strong reference can contain many colours because they occupy distinct roles, proportions and contexts. A photograph's colours need not become UI theme colours. Likewise, liking a site's desktop metaphor does not authorize adding a fake operating system to an unrelated workflow.

Before changing the frontend, state a short design thesis: intended character, focal point, reading order and the few structural changes expected to help. Tie it to the user's brief. Do not force an extra approval ceremony when the user has already authorized the redesign. Ask a focused question only if a consequential choice is unresolved.

## Make colour serve the composition

Preserve an established palette when it is not the problem or the user asks to keep it. When colour changes are warranted, assign roles: background, surfaces, primary/secondary text, action emphasis and semantic states. Evaluate hue relationships together with saturation, lightness, occupied area and adjacency in the actual layout.

Multiple hues can be harmonious; a single hue can still be poorly composed. Do not turn one failed combination into a permanent ban or assume “professional” means monochrome. If references conflict, choose the relevant qualities deliberately and reconcile them within one visual system instead of giving every source equal prominence. Keep brand and semantic colours distinct where their meanings differ.

A useful diagnostic is whether grouping and hierarchy would still be understandable without the accent colour. This is not a requirement to make every design monochrome; it exposes when colour is compensating for weak structure.

## Diagnose and revise the target

Inspect the target's actual rendered state before claiming it needs particular fixes. Name the two or three most consequential problems, the evidence for them and the intended effect of each change. Prefer fixing composition, content hierarchy, grouping and typography before polishing shadows or adding decoration when those structural issues are present.

Express changes concretely: “separate the primary action from three equally weighted secondary actions,” “bring the label closer to its control than to the next group,” or “reduce the number of competing heading weights.” Avoid “make it cleaner” as the whole specification. Preserve useful density, identity and explicit user choices.

When direction remains uncertain, a small comparison varying the consequential treatment can be useful. Do not generate an obligatory set of alternatives or restart a full quiz for clear feedback. Original ideas remain welcome; references inform the reasoning rather than imposing replicas.

## Inspect the result, not just the code

Compare the before/after with the same content, viewport and state where possible. Check a representative narrow viewport and relevant interaction states, including keyboard focus and longer content when applicable. Inspect whether the primary task became clearer, the intended qualities survived, and the visual concept is coherent. Do not claim responsive or interaction validation for views you did not inspect.

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

Evaluate these on real outputs and user reactions over time. This guidance improves the process; it does not retrain the underlying model or guarantee taste alignment.
