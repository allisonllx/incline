# Prompt store and CLI interface

`createPromptStore(directory, { projectDirectory, readOnly } = {})` is lazy. Constructing it and calling `list`, `query`, or a missing `read` does not create directories. Project-local storage is `join(projectDirectory, '.incline', 'prompts')`; personal storage is the selected directory. The API is `save(input)`, `list()`, `read(id, revision?)`, `query({ text?, tags?, limit? })`, `saveRun(id, revision, input)`, `runs(id, revision?)`, `asset(id, revision, assetId)`, and `runAsset(id, revision, runId, artifactId)`. `copyPrompt(sourceStore, destinationStore, id, revision?)` creates a new independent entry and copies its available asset bytes. Both store arguments can instead be directory strings. Copies retain `copyOf` attribution and have no runs or user verdicts.

`save` accepts **only** `id?`, `baseRevision?`, `title`, `prompt`, `origin`, `source?`, `tags?`, `requirements?`, `notes?`, `assets?`, `recipe?`, `parent?`, `copyOf?`. New entries omit `id` and `baseRevision`; updates require both and supply the complete editable payload. A stale `baseRevision` fails with status 409. Saved read objects are deliberately rejected as update inputs. Strings are bounded UTF-8 text; `prompt` preserves Unicode and newlines exactly, up to 300 KB. Empty prompt text is allowed only with `source.contentGap` explaining unavailable original text. `origin` is `published`, `user-authored`, `agent-authored`, or `agent-reconstructed`.

`source` fields: `url?`, `author?`, `capturedAt?`, `license?`, `contentGap?`, `embedUrl?`. URLs must use HTTP(S). `tags` are `{ facet, value, provenance }`, with provenance `user`, `source-text`, `inspected-visual`, or `agent-hypothesis`. `notes` are `{ text, provenance }`. `requirements` has optional `effect`, `roles[]`, `medium`, `inputs[]`, `tools[]`, `runtime`, `limitations[]`, `unknowns[]`, and `checks[]`. Unknown requirements remain explicit in `unknowns`; inferred visual tags are searchable metadata, not automatic exclusion rules.

`assets` accepts up to 24 entries, either `{ id, path, contentType }` (absolute local path; `Buffer` bytes are supported internally for copy) or `{ id, missingReason }`. Supported retained media: PNG, JPEG, WebP, GIF, and UTF-8 Markdown. Other media, including motion, must be recorded as a gap until a supported capture exists. Files are copied into immutable revision folders with size and SHA-256 in each descriptor. Prompt and metadata have separate hashes. `read` verifies prompt and asset bytes; `asset` returns `{ id, filename, contentType, size, sha256, bytes }` and verifies the selected asset. File and directory symlinks within the store are refused. Revisions publish from staging directories, with at most 100 revisions and 1,000 entries per store.

`recipe` is optional `{ stages: [{ id, role, dependsOn?, inputs?, outputs?, checks? }] }`; IDs and dependencies are checked, including cycles. `parent` and `copyOf` are optional `{ id, revision, promptSha256 }` links. These are provenance links, not automatic execution.

Example `read` result (hashes shortened here only for readability):

```json
{
  "version": 1,
  "id": "a32f6f81-2604-4b98-a479-4cde72437172",
  "revision": 1,
  "createdAt": "2026-09-26T00:00:00.000Z",
  "title": "Reveal",
  "prompt": "Line one\r\n色",
  "origin": "user-authored",
  "source": {},
  "tags": [{ "facet": "medium", "value": "live frontend", "provenance": "user" }],
  "requirements": { "effect": null, "roles": [], "medium": "live frontend", "inputs": [], "tools": [], "runtime": null, "limitations": [], "unknowns": [], "checks": [] },
  "notes": [],
  "recipe": null,
  "parent": null,
  "copyOf": null,
  "assets": [],
  "promptSha256": "<64 hex characters>",
  "metadataSha256": "<64 hex characters>",
  "integrity": { "promptSha256": "<same hash>", "metadataSha256": "<same hash>" }
}
```

`list()` and `query()` return compact latest-revision rows: `id`, `revision`, `title`, `origin`, `createdAt`, `source`, `tags`, `requirements`, `assetCount`, `promptSha256`, and `promptAvailable`; neither loads prompt bodies. `query` accepts up to 20 exact facet filters (`{ facet, value, provenance? }`), a metadata text query, and a `limit` of 1–50 (default 20). All supplied tags are ANDed; value comparison ignores case. No prompt body is indexed. The revision metadata is the authoritative search projection, so no separate index can go stale.

`saveRun` requires a **project-local** store created with `projectDirectory`; it calls `assertPromptRecording(projectDirectory)` before work and immediately before publication. The active/stopped/off state comes from `.incline/prompt-settings.json`. Run input accepts `briefRevision?`, `planRevision?`, `stageId?`, `dependencies?`, `inputs?`, `tools?`, `artifacts?`, `execution?`, `inspection?`, `tester?`, and `userReview?`. `inputs` are `{ name, value, sha256? }` (hash checked and stored). `tools` are `{ name, version?, settings? }`. `dependencies` are `{ stageId, runId }`, restricted to declared recipe dependencies and existing runs of that revision. An artifact is `{ id, path, contentType, locator? }` for a durable copied capture or `{ id, locator?, missingReason }` for an explicit gap. Supported captures use the same five media types as prompt assets. A locator alone cannot imply a durable capture.

Each evidence field has `{ status, notes?, evidence? }`. Execution statuses: `not-run`, `succeeded`, `failed`, `partial`; inspection: `not-inspected`, `passed`, `failed`, `inconclusive`; tester: `not-tested`, `passed`, `failed`, `inconclusive`; user review: `not-reviewed`, `positive`, `negative`, `mixed`, `accepted`. Tester results additionally require `by: 'agent-run' | 'author-reported' | 'user-reported' | 'user-observed'`. A nonempty user verdict requires evidence text or locator from an actual user reaction. Missing fields become `null`, not inferred success. `runs(id, revision?)` returns immutable run records for that exact revision, including IDs, hashes, copied artifact descriptors, and separate evidence axes; it verifies saved artifact bytes. `runAsset` returns a verified descriptor plus `bytes` for a captured result. A new prompt revision starts with no runs.

CLI: `node local/prompts-cli.mjs --help`. Commands are `save`, `read`, `list`, `query`, `copy`, `run`, `runs`, and `settings`. Input comes from `--input FILE` JSON; asset and run artifact paths inside it resolve relative to the JSON file. `--project DIR` overrides discovered Git root; `--scope personal` or `--from/--to personal` explicitly selects personal storage. `--personal-dir DIR` overrides the configured selection, otherwise explicit personal commands use the configured directory or `~/.incline/prompt-library`. `--local-only` forbids every personal option. All successful command output is portable JSON; invalid/repeated options fail before writes. The CLI performs no network calls.

Validation: 16 focused store, CLI, and parent router tests passed; oxlint passed on owned files.
