# Shared library and skill installation implementation plan

> For agentic workers: execute inline with the executing-plans workflow, verifying each task before continuing.

**Goal:** One runnable skill supports project or global installation, plus explicit reuse of personal collections between independent projects.

**Architecture:** Project state remains authoritative and backwards compatible. A lazy personal-library store contains immutable collection snapshots and copied original assets. Explicit save and use actions copy evidence between stores; installation location never determines data scope. The portable launcher detects the current repository and retains overrides.

**Tech stack:** Existing Node 22.18+, filesystem, React, TypeScript, Vite and Node tests; no new runtime dependencies.

**Spec:** The approved conversation and `plan.md` section “Implemented: personal library and standard installation”.

## Constraints

- No automatic export of existing private collections or reads of other repository source trees.
- Preserve project originals and revision history. Reuse creates a new incomplete draft with source attribution; source snapshots remain unchanged.
- A reference marked direction in its source becomes inspiration in a new project until reviewed.
- Shared operations use the existing localhost token and origin checks. Browser input cannot choose filesystem paths.
- Default personal storage is `~/.incline/library`; `--library-dir` overrides it and `--local-only` disables it. No personal store is created merely by launching or listing.
- Ship complete generated runtime files in the skill directory, with a clean-install check. Keep development dependencies outside it.

## Task 1: Explicit shared snapshot round trip

Files: `local/library.mjs`, `local/sessions.mjs`, `local/server.mjs`, `local/library.test.mjs`, `lib/taste.ts`.

Interfaces: the library module lists and publishes immutable snapshots, prepares independent imports, and stages their assets and receipts. The server commits the resulting draft through its existing project write queue. Existing session validation is shared in `local/sessions.mjs`.

- [x] Write an HTTP integration test that uploads a guide to project A, saves a personal snapshot, imports it into project B, edits B and verifies A and the shared original are unchanged.
- [x] Run `node --test local/library.test.mjs`; expect the new routes to be unavailable.
- [x] Implement immutable per-ID directories with temporary staging plus atomic rename, bounded validated reads, original assets and a readable evidence file. GET `/api/library` lists snapshots, POST `/api/library/save` snapshots an explicitly supplied session, POST `/api/library/use` creates a reviewed-later draft under the current project's write queue.
- [x] Verify token/origin enforcement, local-only mode, invalid IDs, missing or corrupted assets, simultaneous saves and older quiz-only collections. Failed imports must not change draft/state. Permission errors name the library location and preserve originals.

## Task 2: Project detection and complete distribution

Files: `local/options.mjs`, `local/cli.mjs`, `local/options.test.mjs`, `.gitignore`, skill generated files, README and skill instructions.

Interfaces: `resolveOptions(args, cwd)` returns `{project, libraryDirectory}`; null disables the personal library. Detect nearest `.git` directory/file, otherwise use cwd; explicit project overrides detection. Validate flags before starting the server.

- [x] Test nested checkout, worktree marker, explicit non-Git project, library overrides and malformed arguments through option resolution and a bundled launch smoke test.
- [x] Implement defaults and update help. Keep current absolute-path invocation supported.
- [x] Include built scripts/UI in Git and document `npx skills add allisonllx/incline --skill incline` with optional `--global` independently of library scope.
- [x] Verify a skills CLI installation includes the runtime and launches without dependency installation or a source build.

## Task 3: User-facing personal collections

Files: `components/incline/personal-library.tsx`, `components/incline/use-session-store.ts`, `app/page.tsx`, `app/globals.css`.

Interfaces: connection exposes personal-library availability; the new component receives `onImport(session)` to open a newly imported draft. Saving a personal copy is an explicit separate button on project collections, never part of ordinary Finish.

- [x] Add “This project” and “Personal library” views under Your collections. List personal entries only when that view is opened.
- [x] Show save-copy and use-in-project controls, busy/errors, original context and snapshot attribution. Existing collections and quiz-only sessions remain usable.
- [x] Label reuse as a project draft and keep original reference notes editable without changing the library.

## Task 4: Validate and deliver

- [x] Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build:skill`, and `git diff --check`.
- [x] Smoke-test a clean installed bundle with two temporary project directories and a separate test personal library. No real user evidence is promoted during tests.
- [ ] Update roadmap, package archive, commit and publish the runnable skill so the documented GitHub installation works.
- [ ] Relaunch the user's preview with their existing data, allowing them to choose what to save in the personal library.
