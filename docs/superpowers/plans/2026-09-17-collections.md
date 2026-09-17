# Collections implementation plan

**Goal:** Bring descriptions, images and links into contextual taste collections that can finish without a quiz and hand their original evidence to an agent.

**Approved scope:** The user approved the five-step approach in the conversation: collections, simple reference entry, interpretation by the existing agent, optional existing comparisons, and real-task validation. Mobbin, generated comparisons, cross-project memory, posters and slides remain future work.

**Architecture:** Extend existing sessions with optional collection data, keeping old quiz sessions valid. Store uploaded image bytes in `.incline/assets/`, with authenticated local endpoints and bounded raster uploads. The collection editor reuses draft/revision/finish semantics; the host agent reads source evidence and produces the interpretation.

**Constraints:** Local first; stable skill instructions; Node 22.18+ source runtime; no new external services; no quiz requirement for a meaningful collection; preserve old sessions and original evidence; custom directions and project context; no hidden promotion of inspiration into approved preferences.

## Interfaces

```ts
type Reference = {
  id: string;
  kind: 'image' | 'link';
  title: string;
  note: string;
  intent: 'inspiration' | 'direction';
  asset?: string; // UUID.png/jpg/webp/gif; relative to .incline/assets
  url?: string; // http(s) only, no embedded credentials
};
type Collection = {
  version: 1;
  description: string;
  projectContext: string;
  references: Reference[];
};
// Session.collection?: Collection
// POST /api/assets, authenticated raw image body <= 8 MB -> { asset: string }
// GET /api/assets/<asset>, authenticated -> original bytes
// --input <JSON file>: {name?, description?, projectContext?, references?:
//   [{file?: string, url?: string, title?: string, note?: string}]}
// File paths are resolved relative to input file; imported references default to inspiration.
```

## Tasks

- [x] Model and evidence export: add `lib/collection.ts`, extend `lib/taste.ts`. Test description-only completion, incomplete legacy quiz rejection, malformed references, optional partial comparisons, and export of per-reference notes/intent/source. Run the new tests failing before implementation, then all taste tests.
- [x] Local persistence and import: extend `local/server.mjs` and `local/cli.mjs`, add focused asset/import modules. Test real HTTP upload, auth/origin/size/type/path rejection, restart and finish persistence, retained revisions/assets, and CLI import errors without damaging existing state. Extend strict server normalization rather than dropping the new fields.
- [x] Collection UI: add `components/incline/collection-editor.tsx`; extend store and page with a collection route, entry choices, editable description/context/title, file picker/drop, links, notes and intent. Disable finish for an empty collection or pending/failed upload; support reference removal, visible save state, useful errors and original-image inspection. Reopen collections through the library, preserve optional quiz data, and finish with the exact current snapshot to prevent stale saves.
- [x] Agent workflow and verification: document optional input and source interpretation in the bundled skill and README; build and refresh the portable archive. Run tests, typecheck, lint, skill build, packaged CLI smoke, and browser checks for entry, editing, images/links, persistence and finish. Use an isolated test project for synthetic evidence, then reopen the user's local project without inserting invented preferences.

## Verification examples

```ts
assert.equal(parseSaved(JSON.stringify({version:1,sessions:[descriptionOnly]})).length, 1);
assert.equal(parseSaved(JSON.stringify({version:1,sessions:[emptyCompleteCollection]})).length, 0);
assert.match(exportMarkdown(referenceCollection), /torn edges/);
```

The assertions exercise exported content and accepted/rejected data, not implementation text. Server tests use temporary directories and real requests. Browser testing uses a separate test collection, never the user's actual preference record.

## Execution record

Continue in the existing working copy so the live preview and all prior uncommitted work remain available. Do not commit unrelated existing changes. Backend implementation can run independently of the model/editor against the interfaces above; review that task and then review the whole integration.


## Verification completed

30 automated tests pass. Typecheck, lint, standalone skill build, and skill metadata validation pass. Real packaged CLI import/finish/restart checks preserve reference bytes, source notes, independent collections and revisions. Browser checks cover entry choices, invalid link feedback, image upload/enlargement, reload/resume, optional comparisons, the completed-quiz edit/finish regression, direct no-quiz completion, imported prefill, and a 390px viewport without horizontal overflow. Two review findings (101-session merge validation and profile Finish after collection edits) were fixed and re-reviewed. Real third-party client skill discovery and the quality of generated designs remain follow-up validation.
