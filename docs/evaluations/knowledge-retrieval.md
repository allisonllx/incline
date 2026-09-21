# Knowledge retrieval evaluation

Date: 2026-09-22. Scope: milestone A4, file-based knowledge projections. All fixtures are synthetic; no personal feedback or screenshots are committed.

## Reproducible retrieval check

Run `node local/knowledge-evaluation.mjs` from the repository root. The script creates a temporary project, saves 42 current insights and a batch of 43 feedback events, rebuilds the index, queries spacing for the lesson scope, verifies original bytes and removes the fixture.

The fixture includes one applicable lesson-spacing finding, a conflicting event about keeping related outputs together, a different spacing preference scoped to a portfolio and 40 typography distractors. The query must return only the lesson finding with its qualifications, questions and counterevidence intact. An unrelated vocabulary query must return no matches.

Observed on Node 26.6.0:

| Measure | Result |
| --- | --- |
| Full current-insights JSON response | 27,489 bytes |
| Scoped query JSON response | 1,248 bytes |
| Retrieved applicable insights | 1 of 42 |
| Original files compared byte-for-byte and unchanged | 43 |
| Missing-vocabulary matches | 0 |

Response size varies slightly with temporary path length. This is roughly 95% less text returned to the agent for this fixture, not a latency or disk-I/O benchmark. The query still reads the complete compact index and enumerates latest-revision metadata twice. Code inspection shows a current indexed query reads the pointer, index, navigation and selected topic files instead of reading all 42 authoritative revision bodies; the test does not instrument filesystem reads. Artifact contents and original feedback are retrieved separately when needed. This is not a semantic search benchmark or evidence of improved aesthetics.

## Compatibility and failure checks

Automated tests cover read-only missing-cache queries, exact filters and partial matches, deterministic views, existing evidence/snapshot preservation, new/edited/removed/superseded insights, corrupt projections, authoritative corruption, safe topic filenames, symlink output rejection, incomplete generations and failed publication cleanup. CLI tests cover invalid options, default empty-project behavior and continued direct read/evidence commands.

The skill package was rebuilt and copied into a temporary installation. Its bundled command rebuilt and queried a separate synthetic project successfully without source dependencies or changes to the user's installed skill.

## Behavioral trial

A separate agent with no conversation history received the temporary packaged skill, synthetic project path and this request: “Use Incline to tell me which saved spacing lessons apply before I revise the lesson page. Explain what to preserve and what still needs checking.”

It used the bundled query and evidence commands, selected the lesson finding, preserved the correction about output continuity, kept the campaign-poster preference out of the lesson recommendation, and reported tentative scope, unavailable screenshots and the need for narrow-viewport inspection. It also distinguished a current index from complete feedback review. No files were changed. This single trial checks finding selection and source consultation; it does not include rendering a design or user aesthetic acceptance.

## Remaining empirical validation

Observe several real iterations: did the agent retrieve the applicable insight, inspect the relevant rendered relationships, and avoid requiring the same correction? This change does not automatically consolidate pending feedback, create personal insights, or alter discovery questions. Metadata freshness is cache invalidation, not a forensic audit. Old generations remain on disk; cleanup and database migration are deferred.
