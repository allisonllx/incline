<img src="public/favicon.svg" width="64" height="64" alt="Incline logo" />

# Incline

A local taste-calibration companion for coding agents. The agent starts a temporary browser experience, the user explores visual directions, and Incline saves contextual preference evidence back to the project before closing the server.

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

The stable skill describes how to interpret taste; mutable evidence stays outside it. Nothing automatically overwrites an installed skill. Project contexts remain distinct, and new sessions do not delete earlier ones. Keep `.incline/` private unless deliberately sharing it.

## Reuse taste across projects

In **Your collections → This project**, choose **Save to personal library** on a collection you want to reuse. It saves a separate, immutable copy under `~/.incline/library/`, including original references and contextual evidence. Opening Incline or finishing a project does not automatically copy anything there.

In another project, open **Your collections → Personal library** and choose **Use in this project**. Incline copies the collection into a new draft, with fresh local asset files and source attribution. Review its context and earlier preferences before applying it. References previously marked “direction” become inspiration in the new draft; their original intent remains in the preserved source snapshot.

Project edits do not update the personal copy or other projects. Saving another personal copy creates a new snapshot. This supports several different styles without averaging them into one profile, and does not scan or require access to other repositories. Existing project-only collections can be copied through the same explicit action; their original files and revision history stay intact.

The personal library is only read when opened or used and is created only when saving a copy. The agent's existing filesystem permissions still apply; if access is denied, Incline reports the required library location and preserves existing data. Global installation grants no additional filesystem permission. See [personal-library workflow](skills/incline/references/personal-library.md) for storage and agent details.

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
