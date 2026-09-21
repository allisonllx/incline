import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveInsight, readInsights, insightEvidence } from './insights.mjs';
async function setup(t) {
  const project = await mkdtemp(join(tmpdir(), 'incline-insights-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  const path = join(project, '.incline/feedback/batch');
  await mkdir(path, { recursive: true });
  const record = {
    version: 1,
    id: 'batch',
    coverage: { source: 'test conversation', limitations: [] },
    artifacts: [
      {
        id: 'screen',
        locator: 'old screenshot',
        missingReason: 'not available',
      },
    ],
    events: [
      {
        id: 'gap',
        kind: 'directed-edit',
        evidence: 'verbatim',
        text: 'More space below the controls',
        context: 'Lesson controls',
        artifactIds: ['screen'],
      },
      {
        id: 'guess',
        kind: 'hypothesis',
        evidence: 'inference',
        text: 'Maybe all pages need more space',
        artifactIds: [],
      },
    ],
  };
  await writeFile(join(path, 'record.json'), JSON.stringify(record));
  const input = {
    id: 'control-spacing',
    aspect: 'spacing',
    finding: 'Separate controls from supporting text',
    scope: 'Lesson controls only',
    status: 'tentative',
    qualifications: ['Not a rule for all gaps'],
    openQuestions: ['Other pages?'],
    supportingEvidence: [{ batchId: 'batch', eventId: 'gap' }],
    conflictingEvidence: [],
    expectedRevision: 0,
  };
  return { project, input, path: join(path, 'record.json') };
}
test('insights retain linked evidence separately, with targeted retrieval and missing-image status', async (t) => {
  const { project, input, path } = await setup(t);
  const original = await readFile(path);
  await saveInsight(project, input);
  const result = await readInsights(project, { aspect: 'spacing' });
  assert.equal(result.insights[0].finding, input.finding);
  assert.equal(result.insights[0].revision, 1);
  assert.equal(
    (await readInsights(project, { aspect: 'colour' })).insights.length,
    0,
  );
  const evidence = await insightEvidence(project, input.id);
  assert.equal(
    evidence.supporting[0].event.text,
    'More space below the controls',
  );
  assert.equal(evidence.supporting[0].artifacts[0].availability, 'unavailable');
  assert.deepEqual(await readFile(path), original);
});
test('revisions preserve prior findings and reject stale concurrent edits', async (t) => {
  const { project, input } = await setup(t);
  await saveInsight(project, input);
  const update = {
    ...input,
    expectedRevision: 1,
    finding: 'Use contextual spacing',
  };
  const results = await Promise.allSettled([
    saveInsight(project, update),
    saveInsight(project, { ...update, finding: 'Different edit' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const first = JSON.parse(
    await readFile(
      join(project, '.incline/insights', input.id, '1.json'),
      'utf8',
    ),
  );
  assert.equal(first.finding, input.finding);
  assert.equal((await readInsights(project)).insights[0].revision, 2);
  await assert.rejects(saveInsight(project, input), /revision/);
});
test('invalid links and inferred explicit instructions are rejected', async (t) => {
  const { project, input } = await setup(t);
  await assert.rejects(
    saveInsight(project, {
      ...input,
      supportingEvidence: [{ batchId: 'batch', eventId: 'missing' }],
    }),
    /event/,
  );
  await assert.rejects(
    saveInsight(project, {
      ...input,
      status: 'explicit',
      supportingEvidence: [{ batchId: 'batch', eventId: 'guess' }],
    }),
    /explicit/,
  );
  await assert.rejects(
    saveInsight(project, { ...input, id: '../escape' }),
    /ID/,
  );
  assert.equal((await readInsights(project)).insights.length, 0);
});
test('changed provenance is reported when opening evidence', async (t) => {
  const { project, input, path } = await setup(t);
  await saveInsight(project, input);
  const record = JSON.parse(await readFile(path, 'utf8'));
  record.events[0].text = 'Changed';
  await writeFile(path, JSON.stringify(record));
  const result = await insightEvidence(project, input.id);
  assert.equal(result.supporting[0].changedSinceInsight, true);
});
