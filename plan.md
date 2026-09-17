# Incline roadmap

## Current scope: website design

Keep the first release focused on discovering preferences for website generation. A coding agent launches a temporary local visual session, the user compares designs, and Incline saves the resulting evidence in the project's `.incline/` directory for the agent to use. The skill contains stable instructions; the profile holds evolving preferences.

Taste is a collection of possibilities, not a single style label. Preserve project context, explicit likes and dislikes, conditional choices, and appetite for exploration. A preference for one design does not make the alternative universally undesirable.

## Product direction: discovery and curation

Incline should help people discover, collect, and articulate taste that their agents can use. The built-in examples are prompts for exploration, never an exhaustive taxonomy. Directions such as magazine cutouts, old newspapers, handwritten letters, and glassmorphism must be expressible without matching a predefined label.

The local prototype now supports description-led collections, original image uploads, Markdown design-guide upload/paste, links, optional notes, per-reference inspiration/direction intent, and saving without a quiz. Agents can prefill from conversation context with `--input`. Targeted generated comparisons and external reference providers remain future work.

### Two entry points, one collection

- **I have something in mind:** one entry for descriptions, images, design guides and source links. Accept mixed styles and custom project context, and preserve original references alongside the user's explanations. When the user already described it to the agent, carry that description into the local session rather than requiring them to repeat it. Describing a direction and bringing references share one editor, so they should not appear as separate homepage destinations.
- **Help me discover:** offer visual comparisons when the user wants exploration. Allow “none of these,” a custom direction, and a route into references; do not require every user to complete the whole catalog before saving something useful.

These routes can be combined and revisited. Users who already have a direction should be able to save it directly, then answer targeted comparisons only where clarification would help.

### Preserve why something was collected

A saved reference records interest, not approval of every element. Offer lightweight optional notes for what appeals, what to avoid, and where it fits. Let users keep a reference simply because it is intriguing without making them explain it immediately. Support comments about a specific aspect or region: “the torn paper edges and layered photos; keep the text readable.”

Distinguish inspiration to explore from a direction chosen for this project and from an explicit preference to preserve. Keep several collections side by side without averaging them into one aesthetic. A new project brief can differ from earlier collections without rewriting them.

The agent-facing output should connect each proposed design instruction to its source evidence and context. Inferences remain editable and provisional. Future targeted comparisons should clarify ambiguity in the user's references while leaving room to discover unfamiliar options.

### Optional reference providers

Start with descriptions, user-provided images, and links so the core workflow needs no paid reference service. Mobbin can be an optional source through the user's existing agent connection: the agent retrieves relevant examples and Incline captures the user's reactions and selected references. Do not require a Mobbin account or build a competing reference library as part of the core product.

As checked on 2026-09-17, [Mobbin's official MCP page](https://mobbin.com/mcp) says MCP access is included in paid plans (Pro and Team), with unlimited usage during beta and possible AI credits later. Recheck access and billing when implementing an integration; none is implemented or installed by this roadmap.

### Design guides and DesignMD

Implemented: users can upload or paste a Markdown design guide, retain an optional source link, and annotate the parts that fit. Agents can import `.md` / `.markdown` files through `--input`, including `sourceUrl`. The original text is retained as reference material and stays separate from user instructions and interpretations.

The skill explains how an agent can synthesize selected evidence into a project-specific `DESIGN.md`; Incline does not automatically generate or overwrite that guide. Broader taste evidence remains in `.incline/` and can support different directions for other projects.

Implemented optional source: [getdesign.md's public VoltAgent repository](https://github.com/VoltAgent/awesome-design-md). The portable `getdesign.mjs` helper lists/searches public entries and retrieves a selected guide with an exact source revision, original license and provenance. The prepared import enters the existing collection flow as inspiration. No MCP or account is required for this public route; network access and public GitHub quotas apply. The paid website catalog is outside this integration. Original designs and user-supplied references remain part of the same workflow, and retrieved guide text does not substitute for observing the user's reaction to actual visuals.

DesignMD can provide an optional source of guides and examples for users with access. On 2026-09-17 the user reported that key retrieval says anonymous free key issuance is closed, existing personal keys still work, and new access is available through a trial/paid flow. This supersedes the assumption that new users can obtain free access from the advertised free tool tier. Do not make DesignMD onboarding a dependency or promise a free integration for new users. Trial terms, current checkout pricing and authenticated access remain unverified. Recheck the [provider's access terms](https://www.designmd.co/mcp) before integration; keep ordinary links, user-provided files and original guides sufficient. No provider is installed or called by the current local workflow.

## Future expansion: posters and slides

These are planned extensions, not part of the current implementation.

- **Posters:** compare composition, hierarchy, type scale, image treatment, density, and how clearly a message reads at different sizes.
- **Slides:** compare storytelling structure, information density, chart treatment, text/image balance, and consistency across a sequence, using complete slides and short decks.
- **Other visual formats:** consider documents, social graphics, and other media once the first extensions are useful.

Add a medium alongside project context so that a bold poster preference need not affect a restrained product website. Keep shared preferences as explicit or well-supported hypotheses, and store medium-specific evidence separately. A user may welcome several directions within the same medium.

## Suggested sequence

1. Validate the website workflow across coding agents, including launching, resuming, saving, and returning to the original task.
2. Implemented: descriptions, reference images and links, and contextual collections that can be saved without completing the quiz. Existing quiz profiles are preserved; validate the resulting briefs in real design tasks.
3. Use collected evidence to guide optional follow-up comparisons. Add external reference providers only when needed, keeping the standalone workflow complete.
4. Add a versioned medium field and separate comparison catalogs while preserving existing website profiles.
5. Pilot posters with varied real compositions; then pilot slides with both individual slides and sequences.
6. Let agents select the relevant medium and project evidence, with optional personal preferences shared across projects only when the user chooses.

## Preserve what already works

Retain the original choices, references, explanations, and profile revisions. Record criticism about the specific feature or context it concerns; silence is not proof of approval. Protect explicit “keep” preferences when adding new evidence, represent conflicts as conditional or unresolved, and check prior preferences before promoting a new general rule. Future evaluation should test both useful adaptation and regression across projects and media.
