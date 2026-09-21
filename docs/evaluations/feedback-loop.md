# Feedback-loop evaluation

## Scope

A1 adds optional contextual disposition; A2 adds event/hash review receipts; A3 connects review and rendered assessment in skill guidance. Automated checks validate storage and coverage, not visual judgment or long-term preference learning.

## Interpretation fixtures (human/agent evaluation, not keyword classification)

| Context | Publication | Readiness | Aesthetic |
|---|---|---|---|
| “Push” in response to whether to publish, no other clarification | authorized | unknown | unknown |
| Speaker previously clarified “okay push” means acceptable enough to proceed | authorized | acceptable | unknown |
| “Good enough for this release” | unknown | acceptable | unknown |
| “I love this direction” | unknown | unknown | positive |
| “I prefer this to the previous version” | unknown | unknown | preferred |
| “Archive this failed attempt” | unknown | unknown | unknown |
| “Push despite the design; it still needs work” | authorized | unknown | unknown |

These judgments depend on the supplied context. A different speaker or qualifier may change the interpretation. Keep dissatisfaction in the original event rather than forcing it into a positive disposition axis. Never infer every property was approved.

## Automated coverage

`local/reviews.test.mjs` checks additive legacy compatibility, invalid dispositions, read-only empty scans, legacy warnings, malformed records, exact per-event coverage, source changes reopening review, deferred outcomes, exact insight revision links, archive preservation, replay conflicts and concurrent identical publication. Existing feedback and insight tests retain historical behavior.

## Independent rendered transfer trial — completed 2026-09-22

A fresh agent received only the skill path, a synthetic project path and this request: “Please make a convolution lesson based on attention.html, with a working step-by-step demonstration. Continue recording feedback for this iteration.” It was not shown the expected findings, this evaluation or the implementation plan.

The seeded project contained a source lesson, three tentative findings and five synthetic events, including a pending paragraph/divider correction and a large-gap counterexample. The agent read the original records and linked findings, revised contextual spacing to include the new correction, retained the counterexample and tentative status, and saved per-event review receipts. Final pending scan was empty. The agent's new assessment used hypothesis/inference with source and screenshot snapshots; no user acceptance was fabricated.

Observed output: a working convolution demonstration with stable Play/Step/Reset grouping, close Speed label, distinct row/column/channel colour roles, and output adjacent to its calculation/explanation. Inspected desktop ready and step-one states at 1000×900 and mobile ready/completed states at 390×844. The reviewing agent also opened the saved desktop step-one and mobile completion screenshots. Mobile output wraps below the input/filter and needs scrolling. The break before the final divider is visible without a large empty region.

Functional checks covered four numerical outputs (6, 8, 12, 14), stepping, playback, pause, two speeds, resetting during playback, completion state, Enter activation, stable button position, and no horizontal overflow at 390 and 320 pixels. Width 320 was checked programmatically only. Visible keyboard focus, screen readers, other browsers and touch hardware remain unverified. No later user correction or aesthetic rating is available.

Two process limitations were observed: the agent used direct insight reads rather than the recommended compact query first; its initial save included stored recordHash fields, which the input validator rejected, then it corrected the documented input shape and saved successfully. Neither changed source history. This is one successful synthetic functional trial, not proof of long-term learning or aesthetic alignment.

### Reproduction fixtures

Run `node docs/evaluations/fixtures/feedback-transfer/seed.mjs` from this repository to create a fresh temporary project containing only the starting lesson and synthetic memory. Give a fresh agent the request above, skill path and returned project path. The [result example](fixtures/feedback-transfer/result-example.html) preserves the observed output for comparison, but must not be supplied to the agent being evaluated. Do not substitute this synthetic source for real user evidence. The generated temporary project's saved snapshots retain rendered evidence; no private project data is included in Git.
