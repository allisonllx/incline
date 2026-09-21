<p align="center">
  <img src="public/favicon.svg" width="96" height="96" alt="Incline logo" />
</p>

<h1 align="center">incline</h1>

A local taste-calibration companion for coding agents. Explore and collect visual directions in a temporary browser session, or ask your agent to capture feedback as you iterate a frontend. Incline keeps contextual preference evidence in your project for the agent to use.

Start with your own description, collect reference images, Markdown design guides and links, or take optional visual comparisons. A collection can be saved without a quiz. References retain individual notes and distinguish open inspiration from a direction chosen for this project; nothing forces taste into one style label.

The current scope is website design. See [the roadmap](plan.md) for future poster, slide, and other visual-format support.

## Use the portable skill

Install for the current project:

```sh
npx skills add allisonllx/incline --skill incline
```

Or install for your user, available across projects:

```sh
npx skills add allisonllx/incline --skill incline --global
```

Choose your coding agent in the installer, then ask it: **“Use Incline to help design this website.”** The agent starts the temporary visual session and reads the result when you finish. You do not need to locate a script or enter your project's path. Node 22 or newer is required; the complete UI and bundled scripts are included, with no source build, account or service required. The optional public-reference helper needs internet access.

Installation scope controls where the agent finds the skill. It does **not** determine where your taste is saved. Both installation modes support project-only collections and an optional shared personal library. You can also copy the entire `skills/incline/` folder, including `assets/`, `scripts/` and `references/`, into your agent's skill location.

For manual use, run the installed `scripts/incline.mjs` with Node from your project. It detects the nearest repository root, or uses the current directory outside Git. `--project <directory>` overrides that choice; `--input <collection.json>` imports conversation context. `--library-dir <directory>` selects a different personal library, and `--local-only` disables personal-library access entirely.

The process prints a JSON `ready` event with the localhost URL. Open that exact URL. Choose **Finish & return to agent** to write the project collection, emit a `completed` event with its paths, and stop the server. The agent can then read the profile and continue the design task.

Closing the tab early leaves a resumable draft. Restart against the same project to resume from Your collections. The server also stops after 30 idle minutes. A process lock prevents concurrent writers; stale locks whose process no longer exists are recovered automatically.

## How Incline chooses a workflow

Incline remains one installable skill. Its [entry point](skills/incline/SKILL.md) selects a focused workflow based on what you want done, then loads supporting guidance only as needed:

| Workflow | Responsibility |
| --- | --- |
| [Collect](skills/incline/references/workflows/collect.md) | Explore directions, capture references and descriptions, import guides, and resume collections. |
| [Design](skills/incline/references/workflows/design.md) | Interpret references, critique or improve a frontend, and write a project design brief. |
| [Feedback](skills/incline/references/workflows/feedback.md) | Catch up on accessible history and record meaningful iteration checkpoints. |
| [Library](skills/incline/references/workflows/library.md) | Explicitly find, save and reuse personal collections. |

You can keep saying “Use Incline”; there are no extra skills to install or names to memorize. “Improve this screen using these references” enters Design, while “save these references” enters Collect. For “improve this screen and record my feedback,” Design owns the frontend work and Feedback supports it. Shared evidence rules have one home, and workflows hand off saved paths and context without restarting intake.

This reorganizes the agent instructions. The existing browser UI, commands, storage formats and installation stay the same. It does not add automatic library suggestions or an independent background observer.

## Ways to use Incline

After installing the skill, use these prompts in your coding agent with the intended project open. You can combine workflows: start with references, explore comparisons, build a frontend, and record feedback as you refine it. The agent handles the local commands; you do not need to supply script paths.

| What you want to do | Suggested prompt | What happens |
| --- | --- | --- |
| **Discover a direction** | “Use Incline to help me explore a visual direction for my portfolio. I’m not sure what I like yet.” | Opens the visual session so you can browse examples and try optional comparisons. |
| **Start with an idea** | “Use Incline to capture this direction for my writing site: newspaper columns, warm paper colours, and handwritten accents. I don’t need a quiz.” | Starts a collection from your description and project context. You can save without answering comparisons. |
| **Collect references** | “Use Incline to collect these screenshots and links for this dashboard. I like the typography in the first and the density in the second; the third is just inspiration.” | Brings available references and your notes into a collection, preserving which qualities interest you. |
| **Apply an existing project direction** | “Use this project’s Incline collection and feedback to design the settings page. Keep the typography and spacing we already agreed on.” | Reads the saved evidence and uses it to guide the agent’s frontend work, retaining explicit preservation instructions. |
| **Record feedback while iterating** | “Use Incline while we iterate this frontend. Record my feedback and the versions I react to. Ask only when something important is ambiguous.” | The active agent saves meaningful feedback checkpoints and available artifact snapshots to the project-local journal. |
| **Introduce Incline halfway through** | “Use Incline from here. Review our earlier iterations, capture the feedback and decisions we’ve established, then keep track as we go.” | Catches up from accessible conversation history, marks missing context, and continues with live checkpoints. |
| **Resume unfinished work** | “Reopen my unfinished Incline collection for this project so I can continue adding references.” | Reopens the local session; use **Your collections** to resume the saved draft. |
| **Save a collection for other projects** | “Help me save this project’s ‘Editorial portfolio’ collection to my Incline personal library.” | Opens the save workflow for a separate reusable copy, including the collection’s original references and notes. |
| **Reuse a saved collection** | “Check my Incline personal library for collections that could fit this project. Let me choose one to adapt.” | Lets you choose a collection and copy it into a new project draft as inspiration, with the original context preserved. |
| **Bring a written design guide** | “Use Incline to collect this DESIGN.md as a reference. Keep its reading rhythm, but explore a different colour palette.” | Preserves the original guide and your qualifications alongside other references. |
| **Explore public design guides** | “Use Incline to look for editorial references in the public getdesign.md collection, then help me choose a guide to explore.” | Uses the optional public-catalog helper to find candidates and import a selected guide as inspiration. Internet access is required. |
| **Write a project design brief** | “Use our chosen Incline references and explicit feedback to write a project-specific DESIGN.md. Separate confirmed decisions from open questions.” | The agent synthesizes the evidence into an implementation guide with sources and qualities to preserve. |

For a visual collection session, choose **Finish & return to agent** when ready to continue building. Feedback recording works directly through the active agent and does not require opening the visual session.

### During an iteration

Once you have activated recording, ordinary feedback is enough—you do not need to mention Incline in every message:

- “Keep this typography. Make the cards less rounded.”
- “Restore the previous navigation; that was easier to scan.”
- “This version looks good for this dashboard.”
- “Pause here; I haven’t approved the mobile layout yet.”

To resume in a new conversation, say: **“Use Incline for this iteration. Read this project’s saved collection and feedback before we continue.”** To stop, say: **“Stop recording Incline feedback for this task.”** Existing records stay available.

### What to expect

Taste stays project-local unless you explicitly save a collection to the personal library. Global installation makes the skill available across projects; it does not merge their preferences. Personal-library exports currently include collections, not the separate iteration journal.

Catch-up depends on the history and artifacts your agent can access. Summarized conversations remain labeled summaries, unavailable screenshots remain gaps, and unchanged elements are not treated as approval. The skill guides the active agent; it does not independently watch chats or retrieve inaccessible conversations.

Automatic personal-library suggestions, a dedicated interface for mixing aspects from several collections, browser display of journal events, and automatic profile refinement are still [planned](plan.md). Today, ask explicitly to check the library and describe any particular qualities you want the agent to combine.

## Where taste lives

```text
<project>/.incline/
  state.json                 committed sessions and revision pointer
  profile.md                 readable collection for the agent
  profiles/<session-id>.md   individual contextual profiles
  revisions/<revision>.json  immutable previous collections
  draft.json                 unfinished work
  assets/<reference-id>.*     original images and Markdown design guides
  feedback/<batch-id>/        iteration evidence and available artifact snapshots
  insights/<id>/<revision>.json  versioned findings linked to evidence
  knowledge/                 rebuildable index and generated topic views
```

The stable skill describes how to interpret taste; mutable evidence stays outside it. Nothing automatically overwrites an installed skill. Project contexts remain distinct, and new sessions do not delete earlier ones. Keep `.incline/` private unless deliberately sharing it.

## Record frontend iteration feedback

Ask the agent: **“Use Incline while we iterate this frontend. Catch up on our earlier feedback, then keep track as we go.”** The skill now includes an agent-operated feedback journal. The agent captures accessible past feedback with source and coverage notes, then records meaningful checkpoints during the work. Exact quotes, historical summaries, observations and tentative interpretations stay distinct. Missing screenshots and unknown historical dates remain explicit gaps.

`node <skill-directory>/scripts/feedback.mjs record --project <project> --input <batch.json>` saves immutable batches and optional artifact snapshots under `.incline/feedback/`. `feedback.mjs read --project <project>` reads them and verifies snapshot hashes. Repeating the same batch is safe; corrections use a new batch. See [iteration feedback](skills/incline/references/iteration-feedback.md) for the schema and workflow.

This runs through the active agent, without a browser or background watcher. It cannot retrieve inaccessible conversations itself. The journal supplements existing collections without rewriting them, inferring approval from silence, or exporting to the personal library. Browser display of journal events and automated profile refinement remain future work.

## Keep findings separate from the evidence archive

Ask: **“Use Incline to review this project's feedback and save a few useful insights. Link each finding to its original feedback, keep exceptions, and distinguish explicit instructions from tentative patterns.”**

Insights live separately in `.incline/insights/<id>/`, with immutable revisions. The agent can read compact current findings first, filter by aspect or ID, then retrieve the exact supporting or conflicting events when needed. The evidence command reports whether linked artifacts are saved, unavailable, missing or changed. Original feedback remains untouched.

The bundled `insights.mjs` supports `save --input <file>`, `read [--aspect <topic>] [--id <id>]`, and `evidence --id <id>`, each with `--project <directory>`. See [project insights](skills/incline/references/insights.md) for the schema and workflow. This is agent-authored curation, not automatic preference inference or a browser editor. Cross-project insights are not automatically promoted.

## Retrieve accumulated findings

Ask: **“Use Incline to find the spacing lessons relevant to this page. Keep their exceptions, inspect the supporting screenshots where available, and apply them before presenting the result.”**

Incline includes a small, wiki-inspired knowledge view over saved insights. Topic pages retain context, uncertainty and links to original feedback. They are generated from the versioned findings, so they do not become a second independently edited memory.

```sh
node <skill-directory>/scripts/insights.mjs rebuild --project <project>
node <skill-directory>/scripts/insights.mjs query --query "spacing controls" --limit 5 --project <project>
```

Rebuild writes a complete generation under `.incline/knowledge/` and returns its index and topic-page paths. Query is read-only, excludes superseded findings and reports freshness. Missing, stale or damaged indexes fall back to the authoritative insights. Matching uses words with optional exact aspect/scope filters; it does not provide semantic search. Original feedback, screenshots and insight revisions remain unchanged.

An up-to-date index does not mean recent feedback has been synthesized or a design has passed visual review. The agent still curates findings and opens selected evidence. No other projects are scanned, and nothing is automatically promoted to personal taste. See [project insights](skills/incline/references/insights.md) for commands and storage details.

## Experimental learning evaluator

A separate [Jev learning trial](experiments/jev-learning/README.md) adapts Beacon's capture/evaluate/review pattern to proposed design lessons. It runs against fixed synthetic examples, records recommendations without applying them, and leaves the portable skill independent of any API service. `npm run eval:jev` previews requests offline; live runs require an explicitly supplied TypeSafe API key. This is not a Beacon collector installation or automatic learning feature. The report includes the first live results and unresolved judgments.

## Optional Jev review of project insights

Ask: **“Use Jev to review the saved spacing insight against its linked feedback. Preview what will be sent, and keep the review separate from my taste profile.”** The portable skill includes `scripts/jev-review.mjs`. Its default operation is an offline preview for a selected insight; optional `--against` IDs add specific comparisons. An explicit send with the preview hash evaluates that exact text and saves an immutable review under `.incline/evaluations/jev/`.

The command uses `TYPESAFE_API_KEY` from the environment or the selected project's `.env`. It sends no screenshots and cannot judge the rendered design. Recommendations never update insights or promote personal taste automatically. Existing Incline commands remain usable without Jev. See [review workflow](skills/incline/references/jev-review.md) for commands, payload details and limitations.

## Reuse taste across projects

In **Your collections → This project**, choose **Save to personal library** on a collection you want to reuse. It saves a separate, immutable copy under `~/.incline/library/`, including original references and contextual evidence. Opening Incline or finishing a project does not automatically copy anything there.

In another project, open **Your collections → Personal library** and choose **Use in this project**. Incline copies the collection into a new draft, with fresh local asset files and source attribution. Review its context and earlier preferences before applying it. References previously marked “direction” become inspiration in the new draft; their original intent remains in the preserved source snapshot.

Project edits do not update the personal copy or other projects. Saving another personal copy creates a new snapshot. This supports several different styles without averaging them into one profile, and does not scan or require access to other repositories. Existing project-only collections can be copied through the same explicit action; their original files and revision history stay intact.

The personal library is only read when opened or used and is created only when saving a copy. The agent's existing filesystem permissions still apply; if access is denied, Incline reports the required library location and preserves existing data. Global installation grants no additional filesystem permission. See [personal-library workflow](skills/incline/references/personal-library.md) for storage and agent details.

## Bring references from the conversation

Agents can prefill a collection with `node skills/incline/scripts/incline.mjs --project /absolute/project --input /absolute/context.json`. The JSON accepts `name`, `description`, `projectContext`, and `references`. Each reference contains either `file` (local image or Markdown path) or `url` (HTTP/S link), with optional `title` and `note`. File paths are relative to the JSON file when not absolute. Markdown files may also include an optional `sourceUrl` to retain their provenance. See the [Collect workflow](skills/incline/references/workflows/collect.md) for an example. Reusing `--input` creates another collection; resume without it.

The local editor accepts PNG, JPEG, WebP and GIF files up to 8 MB each, with 24 references per collection. Images are copied into `.incline/assets/` and can be enlarged without cropping. Dragging from another browser tab also works when it supplies an embedded image or an image URL that permits browser access. Some sites block direct copying; Incline shows an error with instructions to save the image and upload the file instead. Google Images may supply a thumbnail, so open the full-size source image first when resolution matters. Reference links are stored without automatic fetching; the host agent reads them when interpreting the brief. The local editor also accepts UTF-8 `.md` / `.markdown` design guides up to 200 KB, through file upload or pasted text. Guides retain original text and optional source links, and are displayed as plain text without executing embedded HTML. A browser-only demo supports descriptions and links; image/guide storage and direct agent handoff require the local skill session.

Wait for **Draft saved** before closing early. **Finish & return to agent** saves the current collection and returns the file paths to the waiting agent. The agent can inspect the original evidence and propose a brief for correction; there is no separate model or automatic image interpretation inside the app. Earlier quiz profiles remain readable.

## Optional design libraries and project guides

Design-library links, such as DesignMD, use the same reference flow. Original guide files are inspiration until the user chooses how to apply them; per-reference notes take precedence over broad source instructions. The agent can use the selected evidence to write a project-specific `DESIGN.md`. That synthesis is separate from preserving the user's broader taste collection and is not automatically generated by the local server.

The portable skill includes an optional helper for [getdesign.md's public GitHub collection](https://github.com/VoltAgent/awesome-design-md):

```sh
node skills/incline/scripts/getdesign.mjs list "editorial"
node skills/incline/scripts/getdesign.mjs fetch wired --project /absolute/project
```

Search filters public guide names and descriptions. Fetch prints an `inputPath` that can be passed to `incline.mjs --project /absolute/project --input <inputPath>`. It saves the original guide, license and pinned source provenance under `.incline/sources/getdesign/` and prepares an inspiration reference. Add actual user notes to the import JSON before opening the collection. Optional `--revision <commit>` fetches exactly the version returned by a prior search. Fetch does not update the chosen project design or save taste preferences.

Only the MIT-licensed public repository is used; no MCP, account or key is needed for this retrieval route, and the website's larger paid catalog is not included. Public GitHub rate limits apply. The helper reports unavailable files and preserves existing evidence. See the [skill's guide workflow](skills/incline/references/design-guides.md) for combining references and extending existing collections.

**DesignMD access update, 2026-09-17:** the user reports that requesting a key returns a message saying anonymous free key issuance is closed, existing personal keys still work, and new access goes through a trial/paid flow. Do not present DesignMD MCP as freely available to new users. The earlier pricing screenshot's free tool labels do not establish that a new free key can be obtained; trial terms and current checkout pricing remain unverified. The integration stays optional and is not installed or required. Links, user-provided guide files and original design guides work independently. See [guide workflows and access notes](skills/incline/references/design-guides.md).

## Improve a design using references

Try: **“Use Incline to study these references. Explain the hierarchy, spacing, typography and visual concept that make them work, then adapt the relevant qualities to my app. Inspect the actual before and after; don’t just copy their colours.”**

Incline now includes [reference interpretation and design critique](skills/incline/references/design-critique.md): eight practical lenses covering hierarchy, whitespace, alignment, proximity, contrast, balance, repetition and unity. The agent connects observed treatments to their effect, assigns palette roles and proportions, and checks the rendered result against the product's task and your explicit preferences. These are decision aids, not an automatic aesthetic score or a rule that every interface should be minimal. User feedback and reference collections stay separate from general design guidance.

## Wider visual exploration

New sessions use catalog v3: six broad pairs cover twelve families with distinct compositions, followed by density, typography, colour and layout. After those ten comparisons, you can finish or explore an optional adaptive spacing boundary and/or isolated motion comparison. Reduced-motion users can skip motion without generating a preference. Directions include Swiss grids, magazine layouts, brutalist posters, restrained split screens, full-bleed cinematic photography, terminals, art deco, playful cards, bento layouts, organic field notes, bold asymmetric type, and kinetic typography. A browsable gallery and larger previews expose the actual compositions. Existing v1 eight-round and v2 twelve-round sessions retain their original catalogs and interpretation.

A/B is a relative choice, “both” welcomes both examples, “neither” rejects the examples, and “depends” retains uncertainty. Broad composition choices do not isolate one attribute. Explicit keep/explore selections and preservation notes are stored separately from provisional inference. Free-text explanations are preserved verbatim.

The [Fable gallery](https://fable-25.netlify.app/) informed the breadth of the exploration. Layouts are original; the ridge photograph is an original generated asset bundled locally. This catalog does not recreate Fable's interactive 3D experiences and is not an exhaustive or validated map of taste. Reduced-motion preferences disable animations.

## Development

Source development requires Node 22.18+ for native TypeScript test imports.

```sh
git clone https://github.com/allisonllx/incline.git
cd incline
npm ci
npm run build:skill
npm run incline
```

Generated runtime scripts and static UI assets are committed under `skills/incline/` so standard skill installs are immediately runnable. Rebuild them after changing the source and include the regenerated files in the same change. No `node_modules` or user taste data belongs in the skill package.

The frontend is shared with the earlier hosted demonstration. `npm run dev` runs that browser-only demonstration with localStorage; the portable skill uses the filesystem server instead. Local workflow changes do not require cloud deployment.

```sh
npm run typecheck
npm test
npm run lint
npm run build:skill
```

Tests cover inference semantics, catalog compatibility, project isolation, adaptation, revision, local token/origin enforcement, invalid payloads, drafts, immutable history, locking, completion and shutdown. The bundled package has also been smoke-tested through real HTTP: all entry assets load, a completed profile is written, the agent receives its event, and the process exits. App lint excludes untouched generated UI primitives. Browser checks cover collection creation, URL validation, image upload and enlargement, guide import/upload/paste and original-text preview, draft reload, optional comparisons, and completion after editing. Guide tests also cover source/notes preservation, authenticated plain-text retrieval, malformed files, and reopening the saved collection. Project and global installation through the skills CLI were verified against this GitHub repository for Codex, including all bundled files and the two-project reuse flow. Interactive discovery in other coding-agent clients remains untested.

The server binds only to loopback on an available port. API calls require the temporary session token and same-origin requests. Browser payloads cannot choose file paths. Saved data is validated, revisions are written before current state changes, and unreadable saved data fails closed.

## Icon credits

The arrow mark and interface icons are based on [Lucide](https://lucide.dev/), including icons derived from Feather. The [ISC and MIT license notices](public/lucide-LICENSE.txt) are included in this repository and the portable skill package.

## Project feedback review loop

The agent can now connect recorded corrections to versioned findings through per-event review receipts. Before an iteration it queries relevant insights and checks pending feedback; at checkpoints it updates scoped findings or records why no change is needed or why review is deferred. New feedback and changed source hashes remain visible. Optional contextual disposition separates publication permission, readiness and aesthetic approval without assigning universal meanings to phrases.

Suggested prompt: “Use Incline to review pending feedback before this edit. Apply relevant findings, inspect the rendered result at the affected states and viewports, then record what changed and what remains unverified.”

The original archive stays unchanged. This is agent-assisted project-local memory, not a background learner or a guarantee of better taste. Curated personal insights and optional discovery follow-ups are available; automatic personal-library suggestions remain planned. See [feedback-loop evaluation](docs/evaluations/feedback-loop.md) for validation boundaries.

## Reuse selected findings across projects

Ask: “Preview a reusable spacing insight from these selected project findings, keeping their exceptions and source evidence.” Once the concrete selection is reviewed, Incline can save it in `~/.incline/personal-insights/`. This is separate from the reference collection library. Saved revisions contain only the selected events and linked artifacts, so they remain usable if the original checkout moves or disappears.

For another project: “List my saved personal insights and import this one as a tentative draft; explain how it fits this brief.” Imports retain their provenance and require contextual review. Existing project instructions take precedence. Nothing scans your other repositories or promotes local findings automatically; `--local-only` disables shared operations. See the [personal insight commands](skills/incline/references/insights.md#explicit-personal-insight-snapshots).

For discovery: “Help me explore a direction; let me finish after the main comparisons unless I choose a spacing or motion follow-up.” Existing sessions keep their previous questions. See the [discovery evaluation](docs/evaluations/discovery-follow-ups.md).
