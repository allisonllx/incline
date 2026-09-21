// Reproducible synthetic retrieval check; never reads personal project data.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveInsight, readInsights } from './insights.mjs';
import { rebuildKnowledge, queryKnowledge } from './knowledge.mjs';

const project = await mkdtemp(join(tmpdir(), 'incline-retrieval-evaluation-'));
try {
  const events = Array.from({ length: 42 }, (_, i) => ({
    id: `event-${i}`,
    kind: 'directed-edit',
    evidence: 'verbatim',
    text:
      i === 0
        ? 'Separate the lesson controls from their explanation.'
        : i === 1
          ? 'Keep the portfolio controls compact.'
          : `Use the specified type treatment for specimen ${i}.`,
    context: 'Synthetic evaluation; not personal taste evidence.',
    artifactIds: [],
  }));
  events.push({
    id: 'counterexample',
    kind: 'directed-edit',
    evidence: 'verbatim',
    text: 'Keep related lesson outputs close together.',
    context: 'Synthetic evaluation.',
    artifactIds: [],
  });
  const record = {
    version: 1,
    id: 'synthetic',
    coverage: {
      source: 'synthetic fixture',
      limitations: ['No visual evidence'],
    },
    artifacts: [],
    events,
  };
  const folder = join(project, '.incline/feedback/synthetic');
  await mkdir(folder, { recursive: true });
  const sourcePath = join(folder, 'record.json');
  const source = JSON.stringify(record);
  await writeFile(sourcePath, source);
  for (let i = 0; i < 42; i++) {
    await saveInsight(project, {
      id: `finding-${i}`,
      aspect: i < 2 ? 'spacing' : 'typography',
      finding:
        i === 0
          ? 'Separate lesson controls from explanatory text.'
          : i === 1
            ? 'Keep the portfolio controls compact.'
            : `Use a distinct type treatment for specimen ${i}.`,
      scope: i === 0 ? 'lesson' : i === 1 ? 'portfolio' : `specimen-${i}`,
      status: 'tentative',
      qualifications:
        i === 0
          ? ['Keep related outputs close together; do not enlarge every gap.']
          : ['Only this specimen was discussed.'],
      openQuestions: ['Applicability elsewhere is unknown.'],
      supportingEvidence: [{ batchId: 'synthetic', eventId: `event-${i}` }],
      conflictingEvidence:
        i === 0 ? [{ batchId: 'synthetic', eventId: 'counterexample' }] : [],
      expectedRevision: 0,
    });
  }
  const before = (await readInsights(project)).insights;
  const sourceBytes = await Promise.all(
    before.map((x) => readFile(x.revisionPath)),
  );
  await rebuildKnowledge(project);
  const result = await queryKnowledge(project, {
    query: 'spacing controls',
    scope: 'lesson',
    limit: 5,
  });
  assert.equal(result.freshness, 'current');
  assert.deepEqual(
    result.results.map((x) => x.id),
    ['finding-0'],
  );
  assert.deepEqual(result.results[0].qualifications, before[0].qualifications);
  assert.deepEqual(
    result.results[0].conflictingEvidence,
    before[0].conflictingEvidence,
  );
  assert.equal(
    (await queryKnowledge(project, { query: 'unmatched-vocabulary' })).results
      .length,
    0,
  );
  assert.equal(await readFile(sourcePath, 'utf8'), source);
  for (let i = 0; i < before.length; i++)
    assert.deepEqual(await readFile(before[i].revisionPath), sourceBytes[i]);
  console.log(
    JSON.stringify(
      {
        fixture: { insights: before.length, feedbackEvents: events.length },
        retrievedIds: result.results.map((x) => x.id),
        qualificationsAndCounterevidencePreserved: true,
        originalFilesUnchanged: before.length + 1,
        fullInsightsResponseBytes: Buffer.byteLength(
          JSON.stringify({ insights: before }),
        ),
        queryResponseBytes: Buffer.byteLength(JSON.stringify(result)),
        note: 'Response bytes measure agent context, not disk I/O or design quality. Freshness checks still enumerate revision metadata; the entire compact index is read. This script does not perform the separate fresh-context agent trial documented in docs/evaluations/knowledge-retrieval.md.',
      },
      null,
      2,
    ),
  );
} finally {
  await rm(project, { recursive: true, force: true });
}
