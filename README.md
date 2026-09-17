# Incline

A local taste-calibration companion for coding agents. The agent starts a temporary browser experience, the user explores visual directions, and Incline saves contextual preference evidence back to the project before closing the server.

Start with your own description, collect reference images, Markdown design guides and links, or take optional visual comparisons. A collection can be saved without a quiz. References retain individual notes and distinguish open inspiration from a direction chosen for this project; nothing forces taste into one style label.

The current scope is website design. See [the roadmap](plan.md) for future poster, slide, and other visual-format support.

## Use the portable skill

The built `skills/incline/` folder is self-contained: `SKILL.md`, bundled Node scripts, supporting references, and static UI assets. It requires Node 22 or newer. No account, hosted service, API key, or dependency installation is needed to run the local collection experience. The optional public-reference helper needs internet access.

Ask your agent to use the skill at `skills/incline/SKILL.md`, or copy the **entire built folder**, including `assets/` and `scripts/`, into the agent's skill location. Typical project locations are `.cursor/skills/incline/` for [Cursor](https://prod.cursor.com/docs/skills) and `.claude/skills/incline/` for [Claude Code](https://code.claude.com/docs/en/skills). This Codex installation uses `~/.codex/skills/` for user skills. No agent configuration is automatically modified by building the package.

From a fresh clone, build the portable skill first (Node 22.18+):

```sh
git clone https://github.com/allisonllx/incline.git
cd incline
npm ci
npm run build:skill
```

The generated scripts and UI assets are not committed. After building, start a session with:

```sh
node skills/incline/scripts/incline.mjs --project /absolute/path/to/your/project
```

The process prints a JSON `ready` event with the localhost URL. Open that exact URL. After reviewing your collection or completing the optional comparisons, choose **Finish & return to agent**. The process writes the files, prints a `completed` event with their paths, and exits. An agent retaining the process can then read the profile and continue the design task.

Closing the tab early leaves a resumable draft. Restart against the same project to resume from Your collections. The server also stops after 30 idle minutes. A process lock prevents concurrent writers; stale locks whose process no longer exists are recovered automatically.

## Where taste lives

```text
<project>/.incline/
  state.json                 committed sessions and revision pointer
  profile.md                 readable collection for the agent
  profiles/<session-id>.md   individual contextual profiles
  revisions/<revision>.json  immutable previous collections
  draft.json                 unfinished work
  assets/<reference-id>.*     original images and Markdown design guides
```

The stable skill describes how to interpret taste; mutable evidence stays outside it. Nothing automatically overwrites an installed skill. Project contexts remain distinct, and new sessions do not delete earlier ones. Keep `.incline/` private unless deliberately sharing it. There is no global profile inference or cross-project syncing yet.

## Bring references from the conversation

Agents can prefill a collection with `node skills/incline/scripts/incline.mjs --project /absolute/project --input /absolute/context.json`. The JSON accepts `name`, `description`, `projectContext`, and `references`. Each reference contains either `file` (local image or Markdown path) or `url` (HTTP/S link), with optional `title` and `note`. File paths are relative to the JSON file when not absolute. Markdown files may also include an optional `sourceUrl` to retain their provenance. See the [skill](skills/incline/SKILL.md) for an example. Reusing `--input` creates another collection; resume without it.

The local editor accepts PNG, JPEG, WebP and GIF files up to 8 MB each, with 24 references per collection. Images are copied into `.incline/assets/` and can be enlarged without cropping. Reference links are stored without automatic fetching; the host agent reads them when interpreting the brief. The local editor also accepts UTF-8 `.md` / `.markdown` design guides up to 200 KB, through file upload or pasted text. Guides retain original text and optional source links, and are displayed as plain text without executing embedded HTML. A browser-only demo supports descriptions and links; image/guide storage and direct agent handoff require the local skill session.

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

## Wider visual exploration

The second catalog has twelve comparisons: six broad pairs cover twelve families with distinct compositions, followed by density, typography, colour, layout, an adaptive spacing boundary, and motion. Directions include Swiss grids, magazine layouts, brutalist posters, restrained split screens, full-bleed cinematic photography, terminals, art deco, playful cards, bento layouts, organic field notes, bold asymmetric type, and kinetic typography. A browsable gallery and larger previews expose the actual compositions. Existing eight-round sessions retain their original catalog and interpretation.

A/B is a relative choice, “both” welcomes both examples, “neither” rejects the examples, and “depends” retains uncertainty. Broad composition choices do not isolate one attribute. Explicit keep/explore selections and preservation notes are stored separately from provisional inference. Free-text explanations are preserved verbatim.

The [Fable gallery](https://fable-25.netlify.app/) informed the breadth of the exploration. Layouts are original; the ridge photograph is an original generated asset bundled locally. This catalog does not recreate Fable's interactive 3D experiences and is not an exhaustive or validated map of taste. Reduced-motion preferences disable animations.

## Development

Source development requires Node 22.18+ for native TypeScript test imports.

```sh
npm install
npm run build:skill
npm run incline -- --project /absolute/path/to/project
```

The frontend is shared with the earlier hosted demonstration. `npm run dev` runs that browser-only demonstration with localStorage; the portable skill uses the filesystem server instead. Local workflow changes do not require cloud deployment.

```sh
npm run typecheck
npm test
npm run lint
npm run build:skill
```

Tests cover inference semantics, catalog compatibility, project isolation, adaptation, revision, local token/origin enforcement, invalid payloads, drafts, immutable history, locking, completion and shutdown. The bundled package has also been smoke-tested through real HTTP: all entry assets load, a completed profile is written, the agent receives its event, and the process exits. App lint excludes untouched generated UI primitives. Browser checks cover collection creation, URL validation, image upload and enlargement, guide import/upload/paste and original-text preview, draft reload, optional comparisons, and completion after editing. Guide tests also cover source/notes preservation, authenticated plain-text retrieval, malformed files, and reopening the saved collection. Native skill discovery in individual third-party clients remains untested.

The server binds only to loopback on an available port. API calls require the temporary session token and same-origin requests. Browser payloads cannot choose file paths. Saved data is validated, revisions are written before current state changes, and unreadable saved data fails closed.
