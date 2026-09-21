# Jev learning trial

An optional, observation-only experiment adapting Beacon's capture → evaluate → extract/review → reuse pattern to Incline's evidence-to-insights boundary. It is **not a Beacon installation or trace importer**, and it does not run a background collector. Fixture candidates stand in for the agent's extraction step. Jev evaluates proposed lessons; ordinary code produces review recommendations; no recommendation modifies an insight, personal library or skill.

## Run

`npm run eval:jev` previews every outbound request without network access or writes. `npm run eval:jev -- --preview --case contextual-spacing` narrows the preview.

For live evaluation, set `TYPESAFE_API_KEY` in your environment and run `npm run eval:jev -- --live`. Alternatively, store it in the Git-ignored `.env.local` and run `node --env-file=.env.local local/jev-learning-cli.mjs --live`. Never commit the key. `--case <id>` limits a live run to one case.

Only the fixed synthetic `cases.json` is read. There is no option to scan projects or upload personal transcripts. Each case sends one request, with four independent questions, to `https://api.typesafe.ai/v1/systemone`, pinned to `jev-1.13.0`. There are at most 20 cases, a 64 KB request cap and a 30-second timeout. Calls are sequential with no automatic retry; a provider error stops the trial and retains completed results. Rerunning is a new billed evaluation, not a resume.

Reports are written to a fresh directory under ignored `outputs/jev-learning/`: the exact synthetic requests and provisional labels, individual validated responses, model version, request hashes, policy version, timing, usage and summary. Error responses are not echoed. A malformed response cannot become a recommendation. The offline test suite uses fake transport and does not need an API key.

## What is evaluated

- **Support:** does the entire proposed finding, including scope and certainty, follow from the evidence?
- **Scope:** what context does the user's evidence actually support?
- **Relationship:** is it new, duplicate, a refinement, or a same-context conflict?
- **Visual evidence gap:** does the claim need a rendered artifact that is missing?

Each request excludes case names, expected labels and rationale. Neutral event IDs retain provenance inside the fixture without leaking its expected answer. The model cannot inspect screenshots; a text report that CSS changed does not establish that a design looks better.

The policy recommends retain-only, review, project-review-candidate, or personal-review-candidate. Even the last two require later review; nothing is promoted automatically. Experimental thresholds (choice confidence floor 0.7; visual-gap ceiling 0.3) were fixed before the live run. Confidence is a statistic about that classification, not a user's taste confidence or a measured probability of future aesthetic satisfaction.

## First live run — 2026-09-22

[Raw validated results](results/2026-09-22.json) preserve the original judgments and thresholds. Labels were authored by the implementing agent before the run; they are provisional expectations, not independently validated ground truth or a frontier-model benchmark. No thresholds or labels were changed after viewing the results.

| Measure | Result |
| --- | --- |
| Cases / atomic questions | 12 / 48 |
| Cases matching all expected labels | 10 / 12 |
| Atomic labels matching expectations | 46 / 48 |
| Unsupported candidates offered for insight review | 0 of 4 |
| Incorrect personal-scope review candidates | 0 |
| Supported new/refined candidates deferred | 2 of 6 |
| Median measured request time | 314 ms |
| Minimum / maximum | 281 / 1,004 ms |
| Input / output tokens | 12,884 / 1,838 |
| Estimated input charge at published $0.042/M input tokens | $0.000541 |

The charge is an estimate, not a billing receipt. An initial one-case connectivity smoke test used an additional 1,071 input tokens; it is excluded from the 12-case results. Requests started from this machine and timings include network overhead. No private project evidence was sent. The key was passed in the child process environment for this session and was not saved in the repository.

### What worked

The policy retained the overgeneralized spacing claim, publication-as-praise claim, silent-approval inference and unverified visual-success claim without offering them as new insights. Duplicate feedback did not create another lesson. Contextual table density remained separate from portfolio whitespace. A reversion and explicitly stated cross-project preference were both identified with their scope intact.

### Two disagreements and two deferrals

1. **Publication-as-praise:** support was correctly classified as unsupported. The separate visual-gap answer was 0.55, versus the expected false label. The core deficiency is absent user endorsement; a screenshot cannot establish that the user loves a style. The policy still chose retain-only.
2. **Refinement:** Jev recognized the refinement relationship but rated support ambiguously (unsupported 0.47, supported 0.44; confidence 0.21), so the policy requested review. On inspecting the fixture, the candidate introduces a control/explanation relationship that the quoted correction does not explicitly name. This may expose an imperfect fixture or over-specific candidate, not simply a model error. Preserve the disagreement for independent adjudication.
3. **Explicit project direction:** all labels matched, but support confidence was 0.61 despite a supported probability of 0.74. Our 0.7 confidence floor deferred it. This is a recall cost of the initial policy; it is not evidence that lowering the threshold is safe.

## Recommendation and next gate

Keep this as an optional reviewer. The trial supports feasibility, not production calibration or aesthetic improvement. Before connecting it to recorded project feedback, independently label a fresh set of selected examples and compare the agent-only decisions with Jev-assisted decisions. Measure false promotions, useful findings deferred and scope errors; keep uncertain cases visible. Do not tune on these 12 examples and report the same cases as a held-out improvement.

A future Beacon adapter would need explicit project/session selection, trace-to-event normalization and deduplication, stable provenance links, and an explicit preview of what is sent externally. None of that is claimed by this trial. Existing Incline capture, insights and query commands remain fully usable without Jev.

Sources checked for this implementation: [TypeSafe HTTP API](https://docs.typesafe.ai/api), [model capabilities and pricing](https://docs.typesafe.ai/models), [confidence semantics](https://docs.typesafe.ai/confidence), and [Beacon's learning loop](https://github.com/Asymptote-Labs/agent-beacon#-turn-session-history-into-memory).

## Project integration

The portable skill now includes a separate `jev-review.mjs` command for explicitly selected saved insights. See [the review workflow](../../skills/incline/references/jev-review.md). The synthetic trial above remains unchanged. Integration adds an offline exact-payload preview, hash-bound sending, project `.env` credential lookup, selected comparisons and immutable advisory records. It does not install Beacon or auto-promote findings.

A live packaged-command smoke test against a temporary synthetic saved insight completed on 2026-09-22 using Jev 1.13.0 (1,231 input tokens, 153 output tokens). It returned `review` due to uncertainty, saved the review separately, and preserved original evidence. The temporary fixture was removed. No real project feedback was sent during integration validation.
