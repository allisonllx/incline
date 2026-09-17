# Reuse a personal collection

Installation location and taste storage are independent. A project-installed skill can use a personal library; a globally installed skill can run with `--local-only`. The default library is `~/.incline/library`, overridden by `--library-dir <directory>` when launching. Honour the host agent's permissions. Report a denied location rather than changing permission settings or scanning other repositories.

## User flow

1. Open Your collections, choose This project, then Save to personal library on the selected collection. Saving is explicit and creates a new immutable snapshot each time.
2. In another project, open Personal library and select Use in this project. The library's evidence and original assets are copied into a fresh, incomplete local collection. The source remains unchanged.
3. Review the new project's context and selected direction. Original notes, comparisons and qualifications are evidence from the original context. They are not global instructions. References marked direction in the source become inspiration in the new draft; original intent is retained in its source snapshot.
4. Finish writes only the current project's state and revision. Further personal changes require explicitly saving another copy.

Existing project-only collections use this same copy flow. No files or revisions are moved or deleted, and no automatic migration happens on install or upgrade. A library can hold contradictory styles with separate context, rather than synthesizing one personal type.

## Agent access

After launching, the localhost `ready` event contains the exact URL and fragment token. The local API uses `Authorization: Bearer <token>`; all library POSTs also require an `Origin` header equal to that URL's origin and `Content-Type: application/json`.

- GET `/api/boot` includes `personalLibrary.available` and `personalLibrary.directory`.
- GET `/api/library` returns `entries` with IDs, names, original contexts, source project names, counts and timestamps. Listing does not create an absent library.
- POST `/api/library/save` with `{ "session": <selected-session> }` saves an explicit snapshot of that session and its local assets. Use actual project evidence, never fabricate a session or mark a user choice on their behalf. Saving to the library does not finish the project session.
- POST `/api/library/use` with `{ "id": "<entry-id>" }` returns `{ "session": <new-project-draft> }`. The server writes the new draft. Restart without `--input` or reopen Your collections to resume if performing the action outside the UI.

Use these operations only within the user's requested scope. To apply an existing personal collection, first match its context to the actual brief, preserve alternatives and distinguish explicit instructions from hypotheses. Asking to use Incline does not alone authorise publishing project evidence to a shared collection. An unavailable library does not prevent project-only work.

## Evidence locations

Each personal entry lives in `<library>/<entry-id>/`: `snapshot.json`, `evidence.md`, and `assets/`. Entry IDs are immutable snapshots, so a subsequent personal save cannot silently update an existing project's selected version. Library evidence files describe original context; asset paths should be resolved within that entry, not the active repository.

Imported project sessions have `librarySource` attribution. Their original source snapshot and asset mapping live under `<project>/.incline/library-sources/<new-session-id>/`; active reference files live in `<project>/.incline/assets/`. Inspect the source receipt when the original context or intent matters. Keep these private with the rest of the project's taste evidence.

Library snapshots preserve original reference bytes, URLs, notes and quiz choices. They do not automatically scrape links, install imported design instructions or copy unrelated repository files. A corrupt or inaccessible entry should produce an error and leave existing project state intact.
