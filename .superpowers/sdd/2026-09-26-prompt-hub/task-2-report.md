# Task 2: local prompt library UI and server integration

The existing Library view has a Collections/Prompts switch. The Prompts area lists and searches project-local prompts, filters exact faceted or plain-value tags, previews prompt text and retained assets, shows explicit gaps and recorded-run evidence, edits revisions, and copies entries between project and personal scopes. Personal prompts are read only when the user selects that scope. The preference to include personal prompts in automatic project lookup is separately toggled and saved with revision checking; a saved selection for a different launcher directory is displayed as needing a new explicit selection.

## Interfaces

- `resolveOptions` returns `promptLibraryDirectory`, defaulting to `~/.incline/prompt-library`; `--prompt-library-dir` overrides it and `--local-only` sets it to `null`. Legacy `libraryDirectory` is unchanged.
- `startServer` accepts `promptLibraryDirectory` and includes `{ promptLibrary: { available } }` in `/api/boot`. The prompt handler runs after the server's existing host, origin, and bearer-token gate.
- `GET /api/prompts?scope=project|personal&text=&tag=facet:value` lists or queries latest revisions. `GET /api/prompts/:id?scope=&revision=` reads one revision. `GET /api/prompts/:id/runs?scope=&revision=` reads recorded runs. Authenticated binary previews use `GET /api/prompts/:id/assets/:assetId` and `GET /api/prompts/:id/runs/:runId/:artifactId`, both with `scope` and `revision` query parameters. Bytes come from the store's verified `asset`/`runAsset` methods and are served with `nosniff` and no caching.
- `GET/POST /api/prompts/settings` reads or changes the personal lookup toggle. POST requires `{ personalLookup, expectedRevision }`; the server supplies the launcher-selected personal directory, never a client path. GET returns effective `personalLookup`, `directoryChanged`, revision, and availability. Changing the setting does not create a prompt store.
- `POST /api/prompts/save` accepts `{ scope, id?, baseRevision?, changes, uploads? }`. Changes cover normal fields; uploads are up to four base64 captures, bounded by request and asset limits. The endpoint rejects asset paths, preserves source details, requirements, notes, recipe, links, gaps, and prior retained asset bytes on revision edits, and passes only strict editable fields to the store. `POST /api/prompts/copy` accepts `{ from, to, id, revision? }` and calls the core independent-copy operation.

The UI renders untrusted text as React text, opens only HTTP(S) source URLs as external links, and does not embed source media. Retained images and Markdown previews fetch with the bearer token and use temporary blob URLs. Source links are labeled as external rather than durable captures. Run statuses, notes, and evidence are shown on separate execution, inspection, tester, and user-review axes; an empty run list says there is no established result evidence.

## Verification

- `node --test local/prompts-api.test.mjs local/options.test.mjs local/server.test.mjs`: 26 passed. Tests cover token/origin rejection, lazy personal-store reads, create/query/exact and plain tag filters/asset read, stale-revision rejection, editing without advanced-field or asset loss, explicit copies, arbitrary path and oversized-upload rejection, local-only personal rejection, settings CAS, directory change, and unchanged collection/server behavior.
- `npm run typecheck`: passed.
- Focused `oxlint` on all owned JS/TS files: passed.
- Disposable browser smoke and packaged build are being completed by the parent task after this commit.

## Files

Added `components/incline/prompt-library.tsx`, `local/prompts-api.mjs`, and `local/prompts-api.test.mjs`. Updated `app/page.tsx`, `components/incline/use-session-store.ts`, `app/globals.css`, `local/server.mjs`, `local/options.mjs`, `local/options.test.mjs`, and `local/cli.mjs`.

## Concern

The prompt editor supports normal fields and additive retained uploads; advanced requirements, notes, and recipe remain preserved but are not edited in this UI. Prompt runs are displayed but recorded by the store/CLI workflow, not by this UI. The browser bundle must be rebuilt from this source before visual smoke testing.
