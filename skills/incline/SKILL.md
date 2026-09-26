---
name: incline
description: Discover website design taste, shape visual ideas into creative briefs, apply references to frontend design, curate execution prompts, plan layered effects, and record iteration feedback. Use for design brainstorming, reference-led design, prompt curation, taste exploration, or feedback capture in the active project.
---

# Incline

One installable skill, six focused workflows. Choose by the requested outcome, load only the relevant workflow and supporting references, and continue the user's task. The browser collection UI is one workflow tool, not the default response to every design request.

## Start from the request and project

Use the active project, not the skill installation directory. Read [shared evidence and project state](references/evidence.md) once for project resolution, evidence interpretation and data boundaries. Reuse relevant saved context before asking the user to repeat it.

An explicit stop-recording request stops recording without deleting evidence. A specific edit or operation stays scoped to that operation. An existing draft is resumed only when collection work is requested; its presence must not divert a frontend task. If the desired outcome is already clear, route without an intake interview.

## Choose the owning workflow

| Requested outcome | Load | Expected result |
| --- | --- | --- |
| Explore taste, collect descriptions/images/links/guides, or resume a collection | [Collect](references/workflows/collect.md) | Contextual collection or resumable draft |
| Shape a vague visual idea, clarify the intended experience, or compare creative approaches before planning | [Brainstorm](references/workflows/brainstorm.md) | Shared creative brief with choices, defaults and open questions |
| Interpret references, compare design samples, critique or improve a frontend, or write a design brief | [Design](references/workflows/design.md) | Requested critique, visual study, brief or visually assessed change |
| Catch up on past feedback, record iterations, curate insights, or manage recording | [Feedback](references/workflows/feedback.md) | Project-local evidence and linked, revisable insights |
| Explicitly find, save or reuse personal collections | [Library](references/workflows/library.md) | Selected library snapshot or imported local draft |
| Curate execution prompts, find a relevant recipe, or write/adapt a generation brief | [Prompt](references/workflows/prompt.md) | Source-attributed prompt entry or execution brief |

Match the action, not an incidental word or file type: “improve this app using screenshots” is Design; “save these screenshots as references” is Collect. “Write a DESIGN.md” is Design; “import this DESIGN.md” is Collect. “Resume the frontend” is Design; “resume my unfinished collection” is Collect. Ask one focused routing question only when the distinction materially changes the work and cannot be inferred.

## Combine without restarting

Keep one owner for the requested deliverable. Load another workflow only for a necessary supporting action, then return with its concrete output: session/profile paths, journal record paths, or a library entry and provenance.

- “Improve this app and record my reactions”: Design owns the frontend; Feedback supports authorized recording.
- “Review earlier feedback, then continue the redesign”: Feedback catches up first; Design owns the resumed redesign.
- “Choose a saved collection and use it for this page”: Library handles selection/reuse; Design applies the chosen evidence. Listing alone does not authorize application.
- “Collect references, then build”: Collect saves the user's evidence; Design continues from the returned session when ready.
- “Build this effect using a saved prompt”: Design plans and owns the result; Prompt supports selected stages. A prompt-only request ends with its brief.
- “Build this scene; I'm unsure how it should look or move”: Design owns the build; Brainstorm resolves consequential choices before detailed production planning. “Help me shape the idea first” stays with Brainstorm until the requested brief is complete.

Do not repeatedly reopen routing, restart a quiz or load every module on each edit. Personal prompt lookup can run within an explicitly enabled project setting; other personal stores retain their explicit-operation scope. Do not start a background watcher or promote tentative interpretations to confirmed preferences.

## Runtime and installation

Node 22 or newer is required. The complete UI and scripts ship in this skill; no account or source build is required. Commands live under `<skill-directory>/scripts/`: `incline.mjs` for the local visual session, `feedback.mjs` for the journal, `insights.mjs` for linked findings, `exploration.mjs` for recoverable studies, `prompts.mjs` for prompt curation and evidence, and `prompt-routing.mjs` for optional advisory selection. Load the selected workflow for usage. The optional `getdesign.mjs` public guide helper, explicit [Jev insight review](references/jev-review.md), and explicit [prompt selection sends](references/prompts.md#optional-jev-shortlist-selection) require network access; ordinary storage, retrieval and previews remain local.

Install with `npx skills add allisonllx/incline --skill incline`, optionally with `--global`. These workflows are bundled reference modules, not separately installed skills. Existing commands and project data formats are unchanged. If a bundled module is missing, report the incomplete installation rather than inventing its instructions.
