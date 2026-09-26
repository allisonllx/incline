# Brainstorm

**Use for:** shaping an underspecified design, scene or interaction before writing a detailed prompt or production plan.
**Result:** a shared creative brief with user choices, proposed defaults and remaining uncertainties clearly separated. A request only to brainstorm ends with the brief and suggested next step.

Use this as support within Design or Prompt, or as the owner when the user asks to explore an idea first. This adapts the Superpowers brainstorming and planning approach: understand intent, ask focused questions, compare useful approaches, reflect the design, then make the work actionable. It requires no separate skill installation or browser questionnaire.

## Understand before decomposing

Read [shared evidence rules](../evidence.md). Reuse the conversation, current frontend, project brief and relevant saved evidence before asking questions. Inspect supplied references with available tools; use [reference interpretation](../design-critique.md) to form grounded hypotheses about their appeal. The user need not list every attractive detail. Label inaccessible references and uncertain interpretations honestly.

Identify the intended experience, who it serves, and what would make it successful. When purpose is missing and would change the design, ask about it before inventing features. Separate a decorative image, a playable visual study and a working frontend: the same scene can require very different work. If the request contains several independent experiences, agree which one to shape first while retaining their relationships.

Scale the conversation to the uncertainty. A clear brief or a specific correction can proceed directly. A vague but substantial effect needs creative choices before a detailed production graph. For a small prompt, missing minor details can be labeled adaptable defaults; ask only when competing interpretations would materially change what it produces. Existing choices and explicit delegation remain valid; do not restart intake on each iteration.

## Resolve consequential choices

Find the unresolved choice most likely to cause a different result or expensive rework. Ask one focused question at a time, preferably with two or three plausible choices, a short explanation of their consequences and a recommendation grounded in the project. Allow a different answer, a mixture, or rejection of all options. Do not turn the following dimensions into a mandatory questionnaire:

- **Look and material:** photographic, illustrated or stylized; clean or textured; the reference relationships that create that character.
- **Composition:** the focal feature, what must remain from the current design, framing, scale and visual density.
- **Light and depth:** flat graphic treatment, modeled depth, static lighting or light that responds to the interaction.
- **Behaviour:** what moves and why, the path and feel of movement, whether interaction is decorative or functional, and relevant input methods.
- **Context and scope:** where the effect lives, required devices, output form and practical constraints that affect feasibility.

Ask about the desired experience, not an implementation menu. SVG can have depth; a realistic scene need not be assembled from generated images. Translate creative choices into representation and tool decisions later. Do not ask the user to select a physics library or identify every layer. If hand input is already specified, clarify its ambiguous behaviour only, rather than asking for the input method again.

For example, after learning the intended use, “Should the aircraft window feel like a real cabin, a restrained illustration, or a playful object?” can resolve a major ambiguity. Whether opening it also changes the light may be the next consequential choice. A desk scene's static decoration versus individually interactive objects may matter more than whether each object has a separate image file.

## Show a decision when words are insufficient

Use [visual studies](../visual-studies.md) for a small comparison that answers the open question. Keep scene, content, viewport and known constraints comparable; vary the relevant treatment meaningfully. Show enough context to judge the choice without building several complete applications. A motion choice needs a playable study or actual motion reference: a still image cannot establish movement quality.

Carry known keep/avoid instructions into every option. Neutral labels, the current version and a “none or combine” path keep the comparison open. A combined choice may need a small integrated study; selecting two separate properties does not prove that they work together. If samples cannot be produced with available tools, describe alternatives and mark the missing visual or motion evidence.

Use tools within the user's existing authorization and budget. Do not silently install generators or incur new external-service costs. While a consequential user choice is pending, continue independent inspection or cheap feasibility work where useful; defer assets and implementation that depend on that answer. Time passing is not a selection.

## Reflect a shared brief

Write back a concise account the user can recognize and correct. Preserve their wording and qualifications; separate their decisions from your observations and proposed defaults. Use only relevant fields:

```text
Experience and intended use:
User choices and selected reference/study versions:
Qualities to preserve or avoid:
Look, composition and lighting:
Behaviour, inputs and fallback needs:
Scope and observable success criteria:
Agent-proposed defaults:
Unresolved choices and what they affect:
```

Invite correction before treating a consequential interpretation as settled. If the user has already supplied the choices or delegated them (“surprise me”), reflect that and proceed within scope without another ritual approval round. Delegated defaults remain agent choices, not learned user preferences. If a material question was asked, wait for its answer before dependent work; an early conditional outline is not the settled plan.

The brief is ready when the intended look, behaviour, preservation constraints and output are clear enough to avoid incompatible builds. Every pixel need not be decided. Revisit only affected decisions when the user changes direction.

## Turn the brief into work

Return the brief to [Design](design.md) for a build or [Prompt](prompt.md) for a generation brief. Use [production planning](../production-planning.md) for assets, dependencies, implementation and checks. Carry user decisions and assumptions into that plan so a component worker does not have to infer them again. Check the proposed stages against the intended experience before execution.

Keep the brief in the conversation unless a saved artifact is requested or the task already calls for one. When recording is active, link original reactions and exact chosen studies through the existing Feedback or exploration workflow; retain rejected attempts without inventing why they failed. Respect stop-recording and personal-library boundaries. Neither Jev nor a tag match can settle subjective creative choices for the user.
