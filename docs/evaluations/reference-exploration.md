# Reference exploration: implementation and evaluation

Date: 2026-09-22. Baseline: `0b979893d35abdce95e79f11af825431b6394e89`. Implementation branch: `codex/reference-exploration`.

The local record system and packaged guidance are implemented. Runtime checks verify recoverability and provenance; they do not establish improved aesthetics, reference understanding, or reduced real-user correction burden. The earlier [A/B/C design protocol](reference-transfer-research.md#controlled-trial-protocol) remains separate.

## Runtime verification

Environment: Node v26.6.0 on macOS. No new dependency, database, model service, or global skill installation was added. Existing journals, insights, profiles, and knowledge formats are unchanged.

| Check | Result |
| --- | --- |
| Unmodified baseline suite | 112/112 passed |
| Full integrated `npm test` | 160/160 passed, including 48 new exploration cases |
| Model/store suites after review corrections | 45/45 passed |
| Same CLI cases against generated portable bundle | 3/3 passed |
| Targeted lint for new runtime/test modules | Passed |
| Skill structure validator | Passed |
| Documented JSON example against portable CLI | Save, view, and explicit missing-evidence status passed |
| Local Markdown links and whitespace | 77 links valid; `git diff --check` passed |

Commands:

```sh
npm test
node --test local/exploration-model.test.mjs local/exploration-store.test.mjs
node local/build-skill.mjs
INCLINE_EXPLORATION_TEST_CLI=skills/incline/scripts/exploration.mjs node --test local/exploration-cli.test.mjs
node_modules/.bin/oxlint local/exploration*.mjs local/test-support/exploration.mjs
```

The **synthetic** fixtures exercise multi-parent hypotheses and multi-hypothesis attempts; parking, return, finish/reopen; append-only corrections; bounded views with complete IDs; independent concurrent writes; retries after later revisions; malformed storage; path/symlink rejection; changed/missing images and journal records; exact feedback links; and empty read operations without file creation. Standalone execution from a nested temporary project writes to that project, not the installed skill directory.

The **synthetic** “Nah” event remains attached to its sample, without asserting its cause or changing related hypothesis states automatically. It cannot stand in for a user instruction. New instruction decisions require linked directed-edit/reversion evidence. The schema can check event type and integrity; it cannot judge whether prose faithfully interprets the reaction.

Review exposed and fixed two provenance gaps, each reproduced by failing regressions first: relevant decisions now include the specific other attempts they name, and newly attached feedback is verified even if that event was used elsewhere. Unchanged historical attachments remain readable when originals become unavailable. A separate regression preserves a historical inspection with an explicit retention gap; unavailable bytes do not change who made the observation.

## Workflow behavior coverage

The deterministic runtime cannot establish that an agent inspects a design carefully or follows recording scope. These distinctions govern the workflow checks:

| Case | Coverage and limit |
| --- | --- |
| Bare liking, one named tree detail, multiple qualities | Guidance directs whole-reference inspection and broad grounded hypotheses; runtime only preserves what is supplied |
| More candidates than displayed samples | Unattempted alternatives survive projection; display count does not cap saved candidates |
| Vague rejection | Synthetic journal/graph regression preserves exact evidence and uncertainty |
| Poor execution | Agent must inspect the actual sample before attributing failure to an interpretation; no automated aesthetic verdict |
| Explicit exclusion | Linked user instructions are verified; their semantic scope still needs faithful agent interpretation |
| Return or later reopen | Runtime preserves original branches/attempts and changes only named states |
| Combining parts | Multi-parent derivation and multi-hypothesis attempts are tested |
| Resume in another task | State resolves from the active project, with selected-node ancestry and targeted sources |
| Changed or missing image | Per-source status and warnings; changed bytes are not passed off as retained originals |
| Stop recording | Workflow instruction applies to exploration too; the CLI is not an observer or authorization engine |
| Selection, stopping, or budget | Explicit finish preserves history without asserting acceptance; agent must honor the actual stopping condition |

## Fresh-context synthetic workflow run

Completed a fresh-context delegated smoke test in an isolated synthetic project. The live reference was [Acacia's symposium site](https://symposium.acacia-ai.org/). No actual target portfolio or original design was supplied; all portfolio copy was placeholder content. This is not a comparison against an existing project.

Exact **synthetic** prompts, in order:

1. “Use Incline to explore https://symposium.acacia-ai.org/ for a software developer portfolio opening section. I like the tree. Keep About, Work, Contact navigation and one clear View work action. Show me a few distinct samples; remember this exploration so we can return to alternatives.”
2. “Nah, A doesn’t work. Try another direction.”
3. “Stop recording. Change the Contact navigation label to Get in touch.”

The agent inspected and captured the reference's opening and a scrolled community/partner section. It created five provisional hypotheses and rendered three standalone samples at 1280×720: A used a large atmospheric tree beside serif typography; B framed the tree as a technical specimen beside sans typography; C used an editorial plate with the image on the left. The three compositions were visually inspected, with two interpretations left untested. No detailed preference questionnaire was requested.

After prompt 2, the agent recorded the exact scripted reaction against A, separately noted execution limitations, parked only A's focal-composition branch, and tried the previously untested inverted dark/light composition. Rendered D moves the tree above a horizontal content/action strip, a visible structural change rather than only a new branch name. The pale ellipse is an authored experiment, not an observed reference detail or confirmed user preference. B/C and the remaining natural-subject interpretation stayed available. Two immutable exploration revisions were saved; no winner was selected.

After prompt 3, the agent made the label edit in an ordinary scratch copy and checked the rendered navigation. Before/after SHA-256 manifests showed identical contents and file sets across all five protected exploration/journal files, including retained evidence. The final label edit was not added to the journal or graph. This checks one agent run's scope handling; it is not a runtime authorization guarantee.

The parent independently inspected the source opening and all four sample screenshots and checked the checkpoint/manifest results. All samples reused a simplified vector/stippled tree: its heavy branches and open canopy differ from the reference's dense character treatment. Thus this run exercised composition diversity and recoverability but exposed an execution-fidelity limitation. It does not prove that technical graphic treatment transferred successfully or that any sample is aesthetically better.

Trial limitations: initial desktop views only; mobile, motion, keyboard/focus, CTA operation, and accessibility contrast were not tested. No real aesthetic reaction, matched baseline, repetition, or measured model/tool cost was available. The reported model family was GPT-6; exact model ID/settings were unavailable. Elapsed time was approximately six minutes for the first phase and roughly two more for recovery/scope checks; exact start was not retained. Browser tab creation failed once in the delegated context; reusing the existing reference tab worked. CodeDB index access failed and documented file-read fallback was used.

The detailed report, screenshots, source, checkpoints, and hash manifests are retained locally in the ignored `.superpowers/sdd/2026-09-22-reference-exploration/behavior/` workspace. Skill hashes there were captured during report creation, not at initial load; the exploration guide received a retention-gap clarification during the run. Runtime commit `1444e85` and final guidance commit `af70143` identify the completed implementation, but were not frozen experimental conditions. Reproduce a controlled trial by freezing these inputs before the first generation.

## Real design evaluation remains open

No matched baseline/enhanced comparison or actual user preference result has been collected for this implementation. A real trial should freeze the original and reference captures, content, viewports, model/settings, tools, and budget; show comparably finished samples with condition labels hidden; and allow ties, neither, and no meaningful difference. Recovery comparison needs the same actual unsuccessful attempt and real corrective feedback in both conditions. Scripted rejection is behavior testing only.

Keep feature transfer, usability, explicit-constraint preservation, aesthetic preference, explanation burden, repeated corrections, and cost separate. One favorable example would justify another trial, not a general taste-improvement claim. No automatic DOM extractor, screenshot scorer, global promotion, or learned branch ranking is included.
