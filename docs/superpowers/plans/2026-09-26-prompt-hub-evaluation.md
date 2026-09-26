# Prompt hub first-delivery evaluation

The local store, retrieval, run provenance and optional selector are implemented as tools for an agent. The initial selector remains advisory. These checks establish software behavior and recoverability, not improved design, accurate taste inference, or a Jev quality advantage.

## Reproducible offline comparison

Run `node local/prompt-routing-evaluation.mjs`. It creates disposable project stores, never opens personal stores, and injects provider responses. It makes **zero external/model calls** and performs no generation. The four shipped-example cases cover a specific mechanism, missing vocabulary, incompatible medium and a pinned choice. The source-only social bookmark is excluded from usable recipes.

Nine additional synthetic cases use descriptions separate from the shipped recipes. The baseline column is a hand-authored review label, not a measured agent decision. Advisory answers are scripted fixtures. Holding candidates fixed tests the adapter and its fallbacks; it cannot measure the model's judgment.

| Case | Local shortlist vs review label | Injected advisory / host outcome |
| --- | --- | --- |
| Missing tags | Empty exact match broadens; useful mechanism retained | Useful ID accepted as advisory |
| Misleading colour | Colour-only query misses the useful mechanism | Single match skips Jev; a broader query recovers the mechanism |
| Equally plausible | Both labelled useful alternatives retained | Abstention preserved |
| No useful match | Compatible format alone admits irrelevant candidates | Abstention preserved |
| Changed source | Source revision changes during the call | Answer discarded as stale |
| Pinned choice | Explicit revision retained | No model call |
| Invalid output | Candidate set retained | Unknown ID rejected; normal retrieval remains available |
| Uncertain answer | Candidate set retained | Low-confidence answer falls back |
| Instructions in source metadata | Untrusted text enters the candidate description | Only a candidate ID can be returned; no recipe/tool execution occurs |

The misleading-colour case is an intentional retrieval weakness retained in the report. Exact tags and words can miss the mechanism the user cares about, even if a candidate matches the query. The agent must inspect the original and broaden its query when the result is unsuitable. A shortlist of one is not an endorsement. The injection fixture verifies the host's bounded action, not model resistance to prompt injection.

The JSON report separates shortlist coverage, scripted advice and host fallback. Selector accuracy, real-agent overrides, real provider latency/cost, user response and correction effort are `null`: they were not measured. Mock token counts are fixtures, not billed usage. Failed or fallback cases are not counted as selector wins.

## Contract and provenance checks

Storage tests cover exact Unicode/newline/BOM text, immutable history, source-byte hashes, independent copies, editable tag provenance, lazy read-only operations, symlink refusal, publication races and matching read/write capacity limits. Runs distinguish execution, inspection, tester identity and user reaction; modified or copied prompts start without inherited run verdicts.

Selector tests cover exact-preview consent, bounded candidates and payloads, local-only/pinned bypasses, invalid IDs/distributions, abstention, uncertainty, provider failure, stale sources/stages, recording stop, immutable payload receipts, preservation of usage on invalid answers, and concurrent/repeated send prevention. A consumed one-call claim persists after failure so a retry cannot silently bill again. Operational claims contain hashes and time, not feedback. The programmatic API requires a fresh-stage reader; the CLI rereads its input file.

The adapter uses the provider's documented [Choice API](https://docs.typesafe.ai/primitives/choice) and [request/response contract](https://docs.typesafe.ai/api), with `jev-1.13.0`. It stores the exact serialized payload and digest separately from its stage/library/settings binding. An API key's existence never triggers a call.

## What a real trial still needs

Use the same task, candidate set, worker, tools and generation budget for local retrieval plus agent review and that workflow plus advisory Jev. Record the agent's ordinary choice before revealing the advisory answer. Retain human labels independently of both and include the difficult cases above. Measure shortlist coverage before selection quality; record overrides, abstentions, fallbacks, all calls/retries, total latency and cost. Link any downstream prompt run and original user reaction. Do not infer aesthetic preference from completion or “push.”

Separately compare prior design workflow, staged production without retrieval, and staged production with relevant recipes on a real project. Inspect intermediate artifacts and the assembled page. Keep transfer fidelity, visual integration, correction burden, user preference and cost separate. Delegation needs its own comparison; faster execution does not imply better design.

No real design trial, camera test, user satisfaction result or live Jev efficacy measurement is included in this delivery. A visual DAG editor, autonomous scheduler, worker router, public marketplace and automatic personal promotion remain deferred.
