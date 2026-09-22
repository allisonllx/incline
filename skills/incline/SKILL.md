---
name: incline
description: Discover and collect website design taste, apply references to frontend design, record iteration feedback, and explicitly reuse personal collections. Use for reference-led design work, taste exploration, or feedback capture in the active project.
---

# Incline

One installable skill, four focused workflows. Choose by the requested outcome, load only the relevant workflow and supporting references, and continue the user's task. The browser collection UI is one workflow tool, not the default response to every design request.

## Start from the request and project

Use the active project, not the skill installation directory. Read [shared evidence and project state](references/evidence.md) once for project resolution, evidence interpretation and data boundaries. Reuse relevant saved context before asking the user to repeat it.

An explicit stop-recording request stops recording without deleting evidence. A specific edit or operation stays scoped to that operation. An existing draft is resumed only when collection work is requested; its presence must not divert a frontend task. If the desired outcome is already clear, route without an intake interview.

## Choose the owning workflow

| Requested outcome | Load | Expected result |
| --- | --- | --- |
| Explore taste, collect descriptions/images/links/guides, or resume a collection | [Collect](references/workflows/collect.md) | Contextual collection or resumable draft |
| Interpret references, compare design samples, critique or improve a frontend, or write a design brief | [Design](references/workflows/design.md) | Requested critique, visual study, brief or visually assessed change |
| Catch up on past feedback, record iterations, curate insights, or manage recording | [Feedback](references/workflows/feedback.md) | Project-local evidence and linked, revisable insights |
| Explicitly find, save or reuse personal collections | [Library](references/workflows/library.md) | Selected library snapshot or imported local draft |

Match the action, not an incidental word or file type: “improve this app using screenshots” is Design; “save these screenshots as references” is Collect. “Write a DESIGN.md” is Design; “import this DESIGN.md” is Collect. “Resume the frontend” is Design; “resume my unfinished collection” is Collect. Ask one focused routing question only when the distinction materially changes the work and cannot be inferred.

## Combine without restarting

Keep one owner for the requested deliverable. Load another workflow only for a necessary supporting action, then return with its concrete output: session/profile paths, journal record paths, or a library entry and provenance.

- “Improve this app and record my reactions”: Design owns the frontend; Feedback supports authorized recording.
- “Review earlier feedback, then continue the redesign”: Feedback catches up first; Design owns the resumed redesign.
- “Choose a saved collection and use it for this page”: Library handles selection/reuse; Design applies the chosen evidence. Listing alone does not authorize application.
- “Collect references, then build”: Collect saves the user's evidence; Design continues from the returned session when ready.

Do not repeatedly reopen routing, restart a quiz or load every module on each edit. Do not start a background watcher, automatically consult the personal library, or promote tentative interpretations to confirmed preferences.

## Runtime and installation

Node 22 or newer is required. The complete UI and scripts ship in this skill; no account or source build is required. Commands live under `<skill-directory>/scripts/`: `incline.mjs` for the local visual session, `feedback.mjs` for the journal, `insights.mjs` for linked findings, and optional `getdesign.mjs` for public guide retrieval. Load the selected workflow for usage. The optional public guide helper and explicitly requested [Jev review](references/jev-review.md) require network access; the rest of the workflow remains local.

Install with `npx skills add allisonllx/incline --skill incline`, optionally with `--global`. These workflows are bundled reference modules, not separately installed skills. Existing commands and project data formats are unchanged. If a bundled module is missing, report the incomplete installation rather than inventing its instructions.
