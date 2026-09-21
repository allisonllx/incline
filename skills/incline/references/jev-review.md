# Optional Jev review

Use when the user requests an external evaluation of selected saved insights. Normal capture, insight curation and knowledge queries remain local and require no API key. A configured key alone does not activate Jev or authorize sending arbitrary project history. This is an advisory reviewer following the Beacon-inspired learning loop, not an installed Beacon collector or background observer.

## Preview selected evidence

```sh
node <skill-directory>/scripts/jev-review.mjs --project <project> --id <insight-id>
```

Add repeated `--against <other-insight-id>` flags to select up to ten existing findings for comparison. The candidate cannot compare against itself. No repository-wide or cross-project scan is performed. If no comparisons are selected, a `new` relationship only means no comparison was supplied, not that the lesson is unique in the project.

Preview is offline and does not load an API key or create files. It returns the exact outgoing request and its `requestHash`. Inspect what will be sent: the selected candidate and comparison findings, scope, qualifications, questions, linked supporting/conflicting event text and context, coverage limitations and artifact availability metadata. Source paths, screenshot bytes and unrelated records are omitted. User text may itself contain identifying information, so respect the authorized selection and inspect the preview. Missing or changed sources must be reconciled before review; superseded findings are rejected.

## Send and retain a review

Once external review of this selection is authorized, send the preview's hash. Do not ask again when existing authorization already covers the concrete selection.

```sh
node <skill-directory>/scripts/jev-review.mjs --project <project> --id <insight-id> --send --request-hash <hash-from-preview>
```

Repeat the same `--against` flags used in the preview. Changed outgoing content rejects the hash before a network request. A key is read from `TYPESAFE_API_KEY` in the environment, or from the selected project's `.env`; it is never copied into a request body or review record. Keep `.env` ignored by Git and never print its contents. Installation scope does not change which project's `.env` is used.

One bounded request goes to TypeSafe's official API, pinned to Jev 1.13.0. There is no automatic retry. Errors produce no successful evaluation record; if an API call completed but local saving failed, do not blindly repeat the billed call. Each explicit successful send creates a separate immutable `.incline/evaluations/jev/<id>.json` record containing the exact request, provenance hashes/revisions, model answers, policy version and advisory recommendation. If sources change during the request, the result is marked stale and routed to review.

## Interpret the result

Jev assesses evidence support, context scope, relation to selected existing findings and whether a visual claim lacks rendered evidence. Images are not sent: saved screenshot availability does not mean Jev inspected the render. It cannot certify visual quality or user satisfaction.

Recommendations are `retain-only`, `review`, `project-review-candidate` or `personal-review-candidate`. None applies a change. `retain-only` retains the evidence; it is not deletion. Review candidates still need the agent to inspect original evidence, reconcile uncertainty and make any separately authorized insight update through the existing insights workflow. Cross-project promotion remains a separate explicit operation, not a consequence of a high score.

The initial confidence thresholds are experimental. Keep full answer distributions and disagreements visible; do not turn evaluator confidence into a numerical taste profile. The first synthetic trial had two useful candidates deferred, so do not use Jev as a hard gate that silently drops corrections. The original capture and insight workflow continues when the API is unavailable.
