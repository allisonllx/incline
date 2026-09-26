# Plan an effect into production stages

Use within Design when the requested experience needs generated assets, layered scenes, interaction, motion, or coordinated components. A short edit can proceed directly. A request only for a plan or prompt ends with that artifact.

## Work backward from the experience

Describe what the user should see and control, which parts change, and which reference relationships make the effect distinctive. Inspect references before reducing them to tags. Keep uncertain interpretations provisional and explicit keep/avoid instructions attached to the brief. The user need not identify every asset or technique.

Choose a representation for each part:

- Use HTML/CSS for live layout, text, controls and ordinary geometry; SVG for suitable vector detail.
- Use generated images or existing assets when material, texture, illustration or scene complexity warrants them. A fixed decorative scene may work best as one image.
- Separate layers when they must move, reveal or change independently. Camera changes, parallax and changing reflections may justify canvas or 3D instead of flat cutouts.
- Separate input sensing, interaction state, movement dynamics and rendering. A hand tracker supplies observations; application code maps them into the experience.

Test the most uncertain mechanism cheaply before expensive polish. A placeholder may establish movement or layout, but does not verify real camera input or visual fidelity. The order depends on the risk; assets need not always come first.

## Make dependencies explicit

For a substantial task, create a small plan with stages and dependencies. Each stage specifies its purpose, owner, required input versions, concrete outputs, relevant constraints and checks. Use a checklist when a graph adds little. Saved prompt recipes may contain a stage DAG; these are adaptable instructions, not an executable scheduler.

Agree shared visual and technical requirements before splitting work: composition, type and palette roles, spacing, camera/perspective, scale, lighting, framing, alpha/masks, anchors, depth order, interaction state and component boundaries. Decide which shadows are baked into assets and which must change live.

Delegate independent stages only when the host offers subagents and the task permits their tools and cost. Give each a bounded brief, selected source evidence and separate output files or an isolated checkout. Keep coupled art-direction choices with one owner. A listing of tools or models is not proof that the host can dispatch them. Run sequentially when delegation is unavailable or unnecessary.

If a required tool or upstream input is unavailable, mark only the affected branch blocked and state the missing prerequisite. Continue independent scene, layout or pointer/keyboard work where useful. Do not silently install tools or present a placeholder as verified real input. Report the camera or other real-input gap explicitly until it is tested.

The lead agent reviews intermediate outputs against their contracts and owns integration. A node becomes ready when required inputs satisfy the checks its work needs; an output file alone does not imply success. Changes to an input version require rechecking affected dependants. Preserve failed attempts, reuse unaffected outputs, and avoid repeatedly generating until an agreeable result appears.

## Use prompt recipes selectively

Follow [prompt operations](prompts.md) for a bounded local query and inspect the full selected prompt plus available source/result evidence. If the user enabled a selected personal prompt library for this project, respect that scope; otherwise use project entries or explicitly requested library operations. A no-match result proceeds with original authoring.

An asset recipe, gesture recipe and lighting recipe can serve different stages. Adapt their mechanism to the shared direction; do not combine source palettes or include every retrieved technique. Ordinary implementation needs no separate generation prompt. Keep originals intact and save adaptations as new revisions or entries with parent provenance.

## Integrate and review

Inspect the assembled result at relevant viewports and states: hierarchy, spacing, typography, lighting consistency, seams, occlusion, interaction response, fallbacks and accessibility. Compare with the supplied or selected reference treatment, including qualities that can disappear during implementation. State missing visual or motion evidence explicitly.

When recording is active, connect exact prompt revisions, inputs, stage/plan identities, outputs and original reactions through prompt run evidence. Use the [exploration graph](exploration.md) for competing interpretations and recoverable attempts. Execution dependencies and taste hypotheses have different meanings: failed tracking does not reject the visual idea. User response, agent inspection and technical tests remain separate evidence.

## Illustrative workflows

For a hand-controlled aircraft shade, establish a scene and shared openness state, prototype bounded travel with simple layers, then prepare compatible visuals and hand-input mapping in parallel if appropriate. Integrate them before refining light, shadow and motion. Include lost-tracking and ordinary input alternatives. Interpret window versus shade from context; this is an example, not a fixed product requirement.

For a realistic desk, settle the camera and light before generating independent objects. Use one coherent scene if nothing needs to move; otherwise preserve compatible scale, cutouts and contact shadows across layers. A functional laptop screen needs live frontend content. Plausible individual assets still need review together.
