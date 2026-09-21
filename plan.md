# Incline roadmap

## Current scope: website design

Keep the first release focused on discovering preferences for website generation. A coding agent launches a temporary local visual session, the user compares designs, and Incline saves the resulting evidence in the project's `.incline/` directory for the agent to use. The skill contains stable instructions; the profile holds evolving preferences.

Taste is a collection of possibilities, not a single style label. Preserve project context, explicit likes and dislikes, conditional choices, and appetite for exploration. A preference for one design does not make the alternative universally undesirable.

## Product direction: discovery and curation

Incline should help people discover, collect, and articulate taste that their agents can use. The built-in examples are prompts for exploration, never an exhaustive taxonomy. Directions such as magazine cutouts, old newspapers, handwritten letters, and glassmorphism must be expressible without matching a predefined label.

The local prototype now supports description-led collections, original image uploads, Markdown design-guide upload/paste, links, optional notes, per-reference inspiration/direction intent, and saving without a quiz. Agents can prefill from conversation context with `--input`. Public getdesign.md retrieval is implemented; targeted generated comparisons and additional reference providers remain future work.

## Implemented: personal library and standard installation

The skill supports both project installation and global installation through `npx skills add allisonllx/incline --skill incline`, optionally with `--global`. The complete runtime is included in the skill directory. The agent launches it from the active project; the launcher detects the nearest repository root, with an explicit project override available.

Installation and data scope are independent. Project collections, drafts, revisions and chosen direction remain in `<project>/.incline/`. Users explicitly save immutable personal copies to `~/.incline/library/`, or a configured library location, and explicitly reuse them as new project drafts. Original references, notes and comparisons retain their context; inherited direction references start as inspiration. Imports preserve the source snapshot and an asset ID mapping. Editing a project copy never changes the library or another project.

Existing project-only data remains readable and can be copied with the same explicit action. Original files and revision history stay in their source project; saving a personal copy does not migrate the full revision history or remove anything. There is no automatic global promotion or averaging of styles.

The personal library is accessed only by library operations, and created only when saving. `--local-only` disables access. The active agent needs filesystem access to the current project and chosen library; no scanning of other repositories is required. Installation does not grant filesystem permission or guarantee a one-time approval across clients.

Distribution checks cover complete installed assets and standalone launch. Integration tests cover copying between projects, independent edits, old quiz-only sessions, preserved originals, immutable snapshots, permissions, invalid or corrupted inputs and failed-import rollback.

A standalone short terminal command remains optional future work. A skill installation does not publish an npm package or create a global `incline` executable; do not advertise `npx incline` without owning and releasing the package.

Research: [skills CLI source and installation options](https://github.com/vercel-labs/skills) document `add`, `--skill` and `--global`. [CodeDB's MCP setup](https://github.com/justrach/codedb/blob/main/docs/mcp.md) separates central per-project indexes under `~/.codedb/projects/<hash>/` from active-root selection through workspace roots, an explicit project argument and the working directory. This is a useful precedent for central storage with explicit project context, not permission bypass.

## Planned: saved-collection suggestions for new projects

Make the nudge automatic when enabled, while keeping reuse an explicit choice. Offer a remembered, user-level preference: **“Suggest my saved collections when starting new projects.”** This is planned behaviour; the current runtime accesses the library only through explicit library operations. Enabling suggestions permits checking the configured personal library, not scanning other repositories or automatically saving project evidence there. Respect `--local-only` and allow the preference to be turned off.

- **Existing project profile:** use its selected direction first; do not repeatedly prompt about personal collections. Manual library access remains available.
- **New project with saved collections and suggestions enabled:** offer “Start from a saved taste collection, mix a few, or explore something new?” Show collection context so the user can judge relevance. An empty or unavailable library should not block starting the project.
- **Explicit selection:** copy selected collections and original assets into a project-local draft as inspiration, retaining source attribution, notes and context. Confirm which qualities should guide this project before treating inherited preferences as its chosen direction.
- **Modular reuse:** allow deliberate selection of aspects, such as typography from one collection and spacing from another. Preserve the source of each selected quality and surface conflicts; do not average entire profiles into one style or assume every quality was endorsed.
- **Skip:** remember dismissal for this project and continue with a fresh direction without repeated nudges. Keep manual reuse available later.

Project edits must remain independent of library snapshots and source projects. Validation should cover the remembered preference being enabled and disabled, existing project profiles, project-level dismissal, empty/unavailable libraries, `--local-only`, mixed-source attribution and independent edits after reuse. Update the skill's library-access instructions alongside implementation so agents follow the same preference and project context.

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

## Implemented guidance: reference interpretation and visual critique

The skill now routes reference-led frontend improvement through a critique guide: explain transferable visual relationships, diagnose the target, assign colour roles and proportions, and inspect the rendered before/after. Eight practical lenses cover hierarchy, whitespace, alignment, proximity, contrast, balance, repetition and unity. Behavioural scenarios cover naive palette mixing, unsuccessful recolours, over-literal portfolio transfers and unavailable evidence. These are guidance and evaluation cases, not measured proof of improved aesthetic output; validation with actual frontend iterations and user feedback remains necessary.

## Implemented structure: one router, four workflow modules

`SKILL.md` now routes by requested outcome into Collect, Design, Feedback or Library. The modules share evidence semantics through `references/evidence.md` and reuse the existing runtime. Mixed requests retain one owner for the deliverable, with supporting workflows returning paths and context instead of restarting intake. This remains one installable skill with bundled references; there are no new commands or storage migrations.

Review routing against real tasks: improve-with-references versus save-references; write versus import a design guide; resume a frontend versus resume a collection; catch-up then redesign; record without opening the visual UI; library lookup without importing; and local-only work without shared-library access. Document/link validation does not prove agents reliably follow these routes. Cross-agent workflow validation remains part of the next milestone.

## Next milestone: feedback and explainable taste refinement

These are planned capabilities, not claims about the current runtime. Prioritize saved design feedback, competing interpretations and checks against confirmed preferences before autonomous profile evolution. A taste profile remains an incomplete, contextual record with room for unknown and unfamiliar directions.

### Implemented foundation: agent-operated iteration journal

The portable skill now supports retrospective catch-up from accessible conversation history and live feedback checkpoints through `scripts/feedback.mjs`. Project-local immutable batches preserve evidence type, source, context, coverage gaps, known event times and recording times, with optional copied artifact snapshots and integrity hashes. Retries are idempotent; conflicting corrections append new records. The agent reads this journal alongside the existing collection. It does not independently observe chats, infer approval from unchanged elements, rewrite profiles, or export feedback to the personal library. Browser presentation, automatic version comparison and explainable profile updates remain future work. See the iteration-feedback reference for the executable workflow.

### Make design feedback part of the saved evidence

After generation, associate the actual result and the user's reaction with the relevant project, collection and collection revision. Preserve a stable artifact version or visual snapshot where available, rather than relying only on a URL whose appearance may later change. Record the exact feedback, when it was given, the aspect it concerns and any explicit scope. Keep original events and link later corrections instead of overwriting the history.

For example, the user's “damn I like it” about Sidenote should preserve that successful result alongside its collection. It is evidence of overall approval in that context, not proof that every individual detail was endorsed. A later “make the headings smaller” concerns heading size; it must not erase the successful example, imply that everything else was disliked, or establish a universal preference for small headings. Silence about other aspects remains unknown. This is a future capture requirement; adding this example to the roadmap does not itself update a taste profile.

Retain the path to the result: designs and comparisons actually shown, reactions, revisions, alternatives explored and explicit qualities to preserve. A final summary such as “likes editorial design” is not a replacement for that evidence. Keep feedback project-local unless the user explicitly chooses to save a personal copy.

### Make profile updates explainable and resistant to regression

Separate direct user statements, observed choices, agent interpretations and unresolved questions. Each proposed preference should point to its supporting and conflicting evidence, source artifact and project context. Show what would change, why, and where the proposed rule applies. Keep the installed skill instructions stable while versioned taste evidence evolves outside the skill package.

Maintain several plausible explanations when a choice is ambiguous. Choosing a newspaper-style design could reflect typography, density, nostalgia or a combination; a single choice does not establish which. Inferences should remain provisional rather than becoming instructions through repetition by the agent.

Before applying an inferred update, check existing explicit “keep” instructions and relevant confirmed examples across contexts. Preserve alternatives such as expressive portfolios and restrained dashboards. A new explicit instruction takes precedence within its stated scope; an agent hypothesis must not silently override it. Explain conflicts and use a focused clarification when their resolution would materially change the design. Preserve earlier versions and the evidence for superseding a preference so changes remain understandable and reversible.

### Build automated evaluations for that behaviour

Add scenarios that evaluate the agent's interpretation and application of evidence, alongside the existing storage and API tests:

- Likes expressive portfolios but restrained dashboards: apply the relevant context without merging them into one style.
- Approves typography, then requests tighter spacing: change spacing while preserving the explicit typography instruction.
- Approves a result, then asks for smaller headings: retain overall approval and record a correction to that aspect.
- Selects one complex composition over another without explanation: retain competing interpretations and avoid claiming an isolated font or colour preference.
- Imports a personal collection into a new project: retain provenance and review inherited context without treating every old preference as newly approved.
- Gives a newer, explicitly scoped correction: supersede the conflicting instruction within that scope while preserving its historical source and other contexts.
- Does not mention an earlier preference: do not infer rejection, expiry or reaffirmation from silence.

Compare proposed interpretations with the current profile and check individual preservation requirements, not just an aggregate score that can conceal regressions. Where enough feedback exists, reserve some confirmed examples from the update process for evaluation; do not claim independent validation when the same evidence was used to construct and assess the update. Include cases where the correct behaviour is to remain uncertain or ask a targeted question. These evaluations can catch reasoning and preservation errors; neither automated scores nor an agent's aesthetic judgment certify that a design matches the user's taste.

### Validate the complete workflow across agents

Project/global installation and the standalone runtime have been checked for Codex, including temporary two-project reuse, draft resume and completion. Explicit personal-library reuse is already implemented; it is no longer a future feature to add after testing.

Remaining work is hands-on validation of the full agent experience in clean projects with Codex, Cursor and Claude Code: native skill discovery, launch from the active project, opening the visual session, resume, completion, reading the resulting brief and applying it to a generated design. Include local and global installation, available filesystem permissions, project-only mode, selected collection reuse and independence of project edits. Test the new feedback-capture flow when it exists. Do not equate a successful CLI installation or HTTP test with proof that every agent completes the entire workflow correctly.

### Introduce targeted follow-up comparisons

Use a few relevant compositions to clarify a specific uncertainty rather than requiring another complete quiz. For the newspaper example, keep typography similar while varying layout, then explore whether the preference carries into a different project context. Label comparisons that vary several qualities so the agent does not overstate what they isolate.

Retain “both,” “neither,” “depends,” free-text direction and the option to stop. Include suitable unfamiliar directions so the system does not repeatedly show only variations of its current best guess. Optimize for useful clarification with reasonable user effort, not for quiz completion, agreement with the current profile or making a profile appear comprehensive.

### Learn how to explore: the Dream-RSI connection

The user linked [Max For AI's Dream-RSI post](https://x.com/MaxForAI/status/2100111071726174279). The [project's own description](https://dream-rsi.com/) explains replaying already evaluated discovery branches to improve exploration policies. Its authors also report that summarized directional advice narrowed exploration and underperformed in their experiments. This motivates testing how Incline selects comparisons and balances further exploration with refinement; it does not establish that the same method already works for subjective design taste.

Keep exploration strategy separate from taste evidence. Recorded interactions could help compare candidate question-selection or interpretation strategies, alongside the current strategy as a baseline. Preserve multiple hypotheses and inspect where alternative strategies would require feedback that was never collected.

Replay can use only observed evidence. It cannot recover the user's response to an unseen design, an unasked question or a different ordering of interactions. Predicted or simulated reactions must remain labeled hypotheses and must never become user evidence. Better scores on historical feedback do not guarantee better future designs or prevent all regressions; evaluate new strategies with real user feedback before adopting them broadly. A large autonomous replay system is a later research option, not a dependency for the first feedback milestone.

## Later: preferences that change over time

Introduce feedback-event timestamps and source context when building feedback capture. Track when a preference was explicitly reaffirmed or superseded; merely reading or applying a stored preference must not count as reaffirmation. Preserve the existing session creation time and original statements.

Distinguish changes in project context, a temporary experiment, repeated changes in comparable situations and an explicit statement such as “I don't like this anymore.” A single contrasting choice is insufficient to infer a lasting change. New explicit instructions govern their stated scope, while historical evidence remains available for understanding earlier work.

Older evidence may become less certain as a guide to current taste without being deleted or rewritten. Do not silently expire explicit preservation instructions or interpret a long absence of interaction as dislike. When a conflict matters, offer a lightweight scope clarification such as “For this project,” “Exploring something new,” or “Update my usual preference.” Personal-library updates remain an explicit choice.

Automated detection of long-term taste changes is lower priority. Collect the necessary temporal evidence now, then evaluate any ageing or change-detection policy against real longitudinal usage. Avoid an arbitrary universal expiry period, repeated compulsory quizzes, or a single global taste score that erases multiple active directions. Extend regression scenarios to verify both preservation and justified change: freezing outdated preferences forever can also produce the wrong result.

## Future expansion: posters and slides

These are planned extensions, not part of the current implementation.

- **Posters:** compare composition, hierarchy, type scale, image treatment, density, and how clearly a message reads at different sizes.
- **Slides:** compare storytelling structure, information density, chart treatment, text/image balance, and consistency across a sequence, using complete slides and short decks.
- **Other visual formats:** consider documents, social graphics, and other media once the first extensions are useful.

Add a medium alongside project context so that a bold poster preference need not affect a restrained product website. Keep shared preferences as explicit or well-supported hypotheses, and store medium-specific evidence separately. A user may welcome several directions within the same medium.

## Implemented: indexed project knowledge (2026-09-22)

The insights command now supports explicit `rebuild` and read-only `query` operations. Rebuild generates contextual topic pages and a compact index under `.incline/knowledge/`; existing feedback and versioned insights remain authoritative and unchanged. Queries retain exceptions and evidence links, report lexical match strength and freshness, and fall back to saved insights when projections are missing, stale or corrupt. No personal-project scanning, automatic synthesis or database migration is included.

See [retrieval evaluation](docs/evaluations/knowledge-retrieval.md) for synthetic results and remaining real-iteration validation. A4 was delivered first following the user's approval; disposition fields, review receipts, personal insights and quiz revisions remain planned.

## Experimental: Jev learning evaluation (2026-09-22)

A separate observation-only [trial](experiments/jev-learning/README.md) tests the Beacon-inspired learning pipeline against 12 synthetic cases. Jev evaluates candidate support, scope, relationship to existing insights and missing visual evidence. A fixed policy logs review recommendations; it cannot write insights or promote personal preferences. First live results matched 10 of 12 provisional case label sets, offered no unsupported candidate and deferred two useful candidates. These are feasibility results, not calibrated accuracy or design-quality evidence. The portable skill now provides explicit selected-insight reviews with an offline payload preview, hash-bound send and separate immutable evaluation records. A Beacon collector/import adapter and validation on real user feedback remain future work.

## Immediate implementation priorities (2026-09-21)

The first implementation now provides a rebuildable file-based knowledge index and generated topic views over authoritative versioned insights. Raw feedback and screenshots are preserved; database migration remains deferred until measured query limitations justify it. See milestone A4 in the detailed plan.


See the [Feedback Memory and Discovery Improvement implementation plan](docs/superpowers/plans/2026-09-21-feedback-memory-loop.md). This supersedes the older suggested order for the next work:

1. Close the project feedback loop: qualified acceptance/publication signals, explicit insight-review checkpoints, and relevant rendered checks before presenting a design—especially recurring spacing issues.
2. Add deliberately curated personal insights with contextual exceptions and portable evidence. Keep this separate from automatic saved-collection nudges.
3. Audit overlapping quiz comparisons and make isolated spacing/motion probes optional in a new catalog version, preserving old sessions.

Validate recording and memory behavior immediately, and evaluate taste alignment across real iterations over time. Longitudinal validation should not block these concrete improvements. Existing small feedback folders remain an archive; new records can group meaningful checkpoints without rewriting history.

## Suggested sequence

1. Validate the complete workflow across coding agents, building on the implemented standard installation and explicit personal-library reuse.
   Add opt-in saved-collection suggestions for new projects, remembered project dismissal and explicit modular reuse as described above.
2. Save generated results and aspect-specific feedback with artifact versions, source context and timestamps. Keep direct user statements separate from agent hypotheses.
3. Add explainable, versioned profile updates with competing interpretations, preservation checks and automated behavioural evaluations across contexts.
4. Introduce targeted follow-up comparisons, including unfamiliar directions. Evaluate question-selection strategies against recorded evidence and real user feedback; defer a large autonomous replay system.
5. Evaluate long-term preference changes once longitudinal evidence is sufficient, retaining explicit scope, history and user control. This is lower priority than the feedback and regression work above.
6. Add a versioned medium field and separate comparison catalogs while preserving existing website profiles. Pilot posters, then slides, using evidence relevant to each project's medium and context. Additional reference providers remain optional and should be added only when needed.

## Preserve what already works

Retain the original choices, references, explanations, and profile revisions. Record criticism about the specific feature or context it concerns; silence is not proof of approval. Protect explicit “keep” preferences when adding new evidence, represent conflicts as conditional or unresolved, and check prior preferences before promoting a new general rule. Future evaluation should test both useful adaptation and regression across projects and media.

## Implemented foundation: separate project insights

The `insights.mjs` command stores scoped findings separately from the provenance journal. Current findings retain supporting/conflicting batch-event links, qualifications, open questions and tentative/explicit/superseded status. Immutable revisions and optimistic revision checks prevent lost updates. Agents read compact findings first and resolve only relevant evidence; retrieval checks source changes and artifact availability. This does not yet provide an insights UI, autonomous consolidation, semantic search or cross-project promotion.
