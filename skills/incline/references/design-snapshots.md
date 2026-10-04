# Reusable design snapshots

Use to remember a rendered project milestone or reuse one in another project. A snapshot connects an agent-authored observed `DESIGN.md`, selected retained artifacts, original user reactions, qualifications and source version. It describes a particular result in context; it is not a universal taste profile or an implementation instruction.

## Choose and inspect the milestone

During explicitly active iteration recording, capture a meaningful stable milestone when the user expresses contextual satisfaction. Examples include “this desktop layout works for me; mobile still needs work” or a positive response to a question about the shown design. Preserve the actual reaction and question. A numeric threshold never decides eligibility; a readiness score may say nothing about aesthetics. “Push,” silence, task completion and your own positive review do not independently establish satisfaction. Do not capture every correction or ask for a new rating when the user already reacted.

An explicit request to save a particular state permits a one-off capture even without active recording or a positive reaction. Use `unknown` where satisfaction is unresolved. This does not turn on ongoing recording. Respect a stop: existing evidence remains readable, but do not create automatic snapshots until recording is explicitly resumed. A saved active setting does not authorize observing unrelated work in another chat.

Before capture:

1. Identify the exact state the reaction refers to. Inspect its rendered screens and interactions with available host tools. Do not substitute today's implementation for an older reacted-to version.
2. Describe concrete relationships: composition and focal hierarchy, whitespace and density, type roles, colour roles/proportions, component treatments, responsive behaviour and motion where observed. Include measured values only when inspected. Code can establish declared tokens; it cannot alone establish the rendered effect.
3. Retain selected screenshots, motion clips and useful source excerpts as actual files. Record viewport, route/component and interaction state in each `view`. Add a source locator when available. Missing captures stay explicit gaps, including when you saw something in chat but cannot retain it. Do not label source-derived observations as rendered inspection.
4. Keep original reactions separate from your observations. Preserve mixed comments and incomplete approval. State why the contextual satisfaction assessment is `acceptable`, `positive` or `unknown`; link the supporting reaction IDs. Proposed reuse notes stay hypotheses. If a reaction is already journalled, put its record/event locator in `source` or `context`.

The runtime verifies structure and bytes, not the accuracy of your interpretation or whether a claimed inspection happened. A source commit is recorded when available, with a dirty-state flag. Uncommitted or untracked state needs retained artifacts; the commit alone cannot reproduce it. Select evidence relevant to the snapshot, not a whole repository or environment file. Do not fetch remote media automatically.

## Capture

Commands resolve the active project, never the installed skill directory. Use an absolute `--project` if the working directory is ambiguous. Paths in input JSON are relative to that input file, or absolute. Files and storage paths must not traverse symlinks; use their actual filesystem location.

```sh
node <skill-directory>/scripts/design-snapshots.mjs capture --project <project> --input <capture.json>
node <skill-directory>/scripts/design-snapshots.mjs capture --project <project> --input <capture.json> --automatic
```

The first is an explicit one-off save; use `--automatic` for milestone capture within active recording. It requires the shared recording gate in `.incline/prompt-settings.json` to be `active`, plus a reaction-linked satisfaction assessment other than `unknown`. Within the user's existing recording authorization, initialize that gate using `prompts.mjs settings --project <project> --input <recording.json>` with `{"recording":"active"}`. Do not reactivate a stopped gate without resumed authorization. On stop, save `{"recording":"stopped"}` and stop journal/exploration capture as well. These settings gate agent writes; they do not launch an observer.

Example input (replace the illustrative reaction with real evidence, and supply the actual files):

```json
{
  "id": "portfolio-v3",
  "title": "Illustrated portfolio, desktop V3",
  "context": "A personal portfolio; expressive illustration with readable project summaries.",
  "state": "Home V3 after the tree revision, before mobile refinement.",
  "tags": ["portfolio", "illustration", "asymmetric-composition"],
  "observations": [
    {
      "aspect": "composition",
      "text": "The tree anchors the left edge; open space separates it from the main heading.",
      "basis": "rendered",
      "artifactIds": ["desktop"]
    }
  ],
  "artifacts": [
    {"id": "desktop", "kind": "screenshot", "path": "captures/home-v3.png", "view": "Home, 1440×900, initial state"},
    {"id": "mobile", "kind": "screenshot", "view": "Home, mobile", "missingReason": "Not captured; mobile remains unfinished"}
  ],
  "reactions": [
    {
      "id": "v3-reaction", "kind": "reaction", "evidence": "verbatim",
      "text": "I like the tree and overall layout now, but mobile still needs work.",
      "source": "User reply to the V3 desktop preview",
      "occurredAt": null,
      "context": "Overall desktop reaction; individual tokens and unmentioned qualities remain unknown.",
      "artifactIds": ["desktop"]
    }
  ],
  "satisfaction": {
    "status": "positive",
    "basis": "User expresses satisfaction with the desktop layout, qualified by unfinished mobile work.",
    "reactionIds": ["v3-reaction"]
  },
  "qualifications": ["Mobile is unresolved; this is not approval of every design property."],
  "reuseNotes": ["Explore illustration-led hierarchy for a future portfolio with similar content."]
}
```

All top-level fields are required; arrays may be empty except observations and artifacts. IDs use 1–80 letters, digits, underscores or hyphens. Artifact kinds are `screenshot`, `motion` or `source`; supply either `path` or `missingReason`. Observation `basis` is `rendered` or `source` and must reference an artifact of the corresponding kind. Reactions use [journal event fields](iteration-feedback.md#batch-format), require explicit `verbatim` or `summary` evidence and artifact links, and may retain an [optional rating](feedback-checkpoints.md). Do not convert a summary to a quotation. `satisfaction.reactionIds` must reference included reactions; it may be empty only for `unknown`.

The command returns `directory`, `guidePath`, content `hash` and `personalSave` status. Each immutable capture lives at `.incline/design-snapshots/<id>/` with `snapshot.json`, generated `DESIGN.md` and copied `assets/`. It never updates the project root `DESIGN.md`. Repeating identical input and files is safe; revisions require a new ID. Keep the returned guide and manifest together with their assets. A standalone copied guide loses its local artifact links.

Bounds: input/manifest 1 MB, generated guide 200 KB, up to 40 observations, 30 reactions, 24 artifacts, 8 MB per file and 32 MB combined. Screenshots support PNG/JPEG/WebP/GIF; motion supports GIF/MP4/WebM. Source supports nonempty UTF-8 MD/TXT/HTML/CSS/SCSS/SVG/JS/JSX/TS/TSX/JSON. Signature checks do not establish video playability or visual quality. Larger captures should be deliberately reduced or represented as gaps, never silently truncated.

## Personal saves and standing opt-in

A local capture does not authorize a personal copy. After a meaningful save, offer a short personal-library nudge when useful and not already answered. Show the concrete guide, selected assets and qualifications before the choice. If authorization already covers that selection, publish without asking again:

```sh
node <skill-directory>/scripts/design-snapshots.mjs publish --project <project> --id portfolio-v3
```

Personal copies default to `~/.incline/design-library/`, separate from collections, insights and prompts. `--personal-dir <absolute-directory>` selects a different design-only store. The personal ID is the manifest hash, so different projects' same-named captures coexist. All selected files are copied; the original checkout can disappear without breaking the personal reference. Do not scan other repositories or update their files.

If the user explicitly opts into future personal saves for this project, read and update the project settings:

```sh
node <skill-directory>/scripts/design-snapshots.mjs settings --project <project>
node <skill-directory>/scripts/design-snapshots.mjs settings --project <project> --input <settings.json>
```

Input example: `{"expectedRevision":null,"personalAutoSave":true,"personalDirectory":"/absolute/home/.incline/design-library"}`. Replace `expectedRevision` with the latest returned revision when settings already exist. Bind consent to the actual selected absolute directory. No `~` expansion occurs inside JSON. This permits personal copies only following eligible **automatic** captures while recording is active; explicit one-off captures still require explicit publication. Disable future personal saves with `{"expectedRevision":"<latest-revision>","personalAutoSave":false}`.

`--local-only` allows local capture and local imported-reference reads but skips personal auto-save and rejects personal query/read/publish/import. An automatic capture with a different `--personal-dir` skips personal publication until opt-in is renewed for that directory. A personal failure returns the successful local capture plus `personalSave.status: "failed"`, and the CLI exits nonzero; keep the local result and report both outcomes. Retrying the same capture after fixing the path reuses the retained snapshot. Do not claim a personal save succeeded based on local success alone.

## Retrieve and adapt

Local lookup is read-only. Access the personal store when the user's request covers it; opting into personal saves alone does not enable unrelated personal searches.

```sh
node <skill-directory>/scripts/design-snapshots.mjs query --project <project> --text "portfolio" --tag "illustration"
node <skill-directory>/scripts/design-snapshots.mjs query --project <project> --scope personal --text "portfolio"
node <skill-directory>/scripts/design-snapshots.mjs read --project <project> --scope personal --id <hash>
node <skill-directory>/scripts/design-snapshots.mjs import --project <new-project> --id <hash> --relevance "Explore the illustration hierarchy for this portfolio; mobile evidence is incomplete."
node <skill-directory>/scripts/design-snapshots.mjs read --project <new-project> --scope imported --id <hash>
```

Query matches all words in title/context/state/tags, optionally an exact tag, filters before limiting, and returns at most 50 results from a store of up to 1,000 snapshots. It validates metadata only; read a selected entry to verify the guide and file hashes, then inspect the actual retained visuals with host tools. Query is not semantic matching or proof that the reference fits. A personal path can be supplied to the personal commands; otherwise they use this project's configured directory or the default above.

Import copies the verified bundle under `.incline/design-references/<hash>/` with a provenance receipt, target-project relevance and `intent: inspiration`. The original satisfaction stays attached to the original version. It does not become approval of the new implementation. Preserve current project constraints, compare contextual fit, and adapt selected relationships rather than importing all tokens. Repeating an import preserves its original relevance note; a differing note cannot silently replace it.

Report damaged or unreadable data, preserve it and stop that operation. Do not reset the store, repair hashes to disguise changes, or fall back to an empty profile. This feature is an agent workflow and packaged CLI; there is no snapshot browser tab, automated screenshot extractor or background satisfaction detector.
