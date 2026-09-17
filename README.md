# Incline

A working first version of a visual taste calibration tool. A profile can hold several styles, scoped to a project, with explicit room to experiment.

## Run locally

Requires Node 22.13 or newer (Node 22 needs `--experimental-strip-types` for the tests).

```sh
npm install
npm run dev
```

## What works

- Portfolio, dashboard and brand contexts, with a separate exploration preference per project.
- Eight curated visual comparisons with A, B, both, neither and depends choices.
- A spacing follow-up selected from an earlier density choice.
- Optional explanations and revisable answers. Revising removes dependent later answers.
- Several styles retained together; losing a pair does not count as rejection.
- Explicit keep/explore selections and preservation notes, separate from quiz evidence.
- Device-local saved sessions, Markdown profile export and JSON evidence export.

All candidate interfaces contain the same content within a comparison. Controlled comparisons vary density, heading type or accent colour. Style comparisons intentionally vary several qualities and cannot identify which quality caused a choice.

## Limits

This is a curated prototype, not a trained preference model or validated research instrument. Exploration is recorded in the project brief and export; it does not generate new candidates. The first version does not infer global preferences across projects, ingest reference images, learn from external design edits, or rewrite agent skills. Free-text reasons are preserved verbatim, not semantically interpreted. There is no account sync; browser storage can be cleared, so export useful profiles.

Future validation should compare fresh designs with and without the profile, measure correction effort, and check previously endorsed qualities survive. Broadening the reference set and randomising candidate order are also needed before treating the quiz as research.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Lint covers application code. Untouched generated UI primitives and the generated mobile hook are excluded due to existing starter lint violations; they remain included in TypeScript checking. Tests cover inference semantics, project isolation, adaptation, revision, storage validation and exports. Browser interaction and visual testing have not been performed.

See `docs/design.md` for scope and `docs/superpowers/plans/2026-09-17-incline.md` for the implementation outline.
