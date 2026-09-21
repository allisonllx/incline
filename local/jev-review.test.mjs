import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveInsight, readInsights } from './insights.mjs';
import { previewReview, runReview, reviewApiKey } from './jev-review.mjs';
import { QUESTIONS } from './jev-learning.mjs';
async function setup(t) {
  const project = await mkdtemp(join(tmpdir(), 'incline-jev-review-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  await mkdir(join(project, '.incline/feedback/batch'), { recursive: true });
  const recordPath = join(project, '.incline/feedback/batch/record.json');
  await writeFile(
    recordPath,
    JSON.stringify({
      version: 1,
      id: 'batch',
      coverage: { limitations: ['Historical screenshot unavailable'] },
      events: [
        {
          id: 'gap',
          kind: 'directed-edit',
          evidence: 'verbatim',
          text: 'Space these controls away from the explanation.',
          context: 'Lesson',
          artifactIds: [],
        },
      ],
      artifacts: [],
    }),
  );
  const input = {
    id: 'spacing',
    aspect: 'spacing',
    scope: 'Lesson',
    finding: 'Separate controls from explanatory text.',
    status: 'tentative',
    qualifications: ['Keep related outputs together'],
    openQuestions: ['Mobile?'],
    supportingEvidence: [{ batchId: 'batch', eventId: 'gap' }],
    conflictingEvidence: [],
    expectedRevision: 0,
  };
  await saveInsight(project, input);
  return { project, input, recordPath };
}
function answer() {
  return {
    model: 'jev-1.13.0',
    usage: { input_tokens: 100, output_tokens: 10 },
    answers: Object.fromEntries(
      Object.entries(QUESTIONS).map(([k, q]) => [
        k,
        q.type === 'noul'
          ? { type: 'noul', noul: 0 }
          : {
              type: 'choice',
              choice: Object.keys(q.criteria)[0],
              confidence: 1,
              probabilities: Object.fromEntries(
                Object.keys(q.criteria).map((v, i) => [v, i === 0 ? 1 : 0]),
              ),
            },
      ]),
    ),
  };
}
test('preview is offline, selective, path-free and excludes candidate from comparisons', async (t) => {
  const { project, input } = await setup(t);
  await saveInsight(project, {
    ...input,
    id: 'other',
    finding: 'Other lesson',
  });
  const before = await readdir(join(project, '.incline'));
  const preview = await previewReview(project, 'spacing');
  assert.deepEqual(preview.request.state.existingInsights, []);
  assert.equal(preview.request.state.events.length, 1);
  assert.equal(JSON.stringify(preview.request).includes(project), false);
  assert.deepEqual(
    preview.request.state.candidate.qualifications,
    input.qualifications,
  );
  assert.deepEqual(await readdir(join(project, '.incline')), before);
  assert.equal(
    (await previewReview(project, 'spacing', ['other'])).request.state
      .existingInsights[0].id,
    'other',
  );
  await assert.rejects(previewReview(project, 'spacing', ['spacing']));
});
test('live review requires current payload hash, saves an immutable receipt and preserves insights/evidence', async (t) => {
  const { project, recordPath } = await setup(t);
  const original = await readFile(recordPath);
  const insights = await readInsights(project);
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { ok: true, json: async () => answer() };
  };
  await assert.rejects(
    runReview(project, 'spacing', { apiKey: 'secret', fetchImpl }),
    /Preview/,
  );
  assert.equal(calls, 0);
  const preview = await previewReview(project, 'spacing');
  const result = await runReview(project, 'spacing', {
    requestHash: preview.requestHash,
    apiKey: 'secret',
    fetchImpl,
  });
  assert.equal(calls, 1);
  assert.equal(result.sourcesChanged, false);
  const raw = await readFile(result.evaluationPath, 'utf8');
  const receipt = JSON.parse(raw);
  assert.equal(raw.includes('secret'), false);
  assert.deepEqual(receipt.request, preview.request);
  assert.deepEqual(await readFile(recordPath), original);
  assert.deepEqual(await readInsights(project), insights);
  const second = await runReview(project, 'spacing', {
    requestHash: preview.requestHash,
    apiKey: 'secret',
    fetchImpl,
  });
  assert.notEqual(second.evaluationPath, result.evaluationPath);
  assert.equal(await readFile(result.evaluationPath, 'utf8'), raw);
});
test('stale previews and changed linked evidence cannot be sent', async (t) => {
  const { project, input, recordPath } = await setup(t);
  const preview = await previewReview(project, 'spacing');
  await saveInsight(project, {
    ...input,
    expectedRevision: 1,
    finding: 'A refined lesson',
  });
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
  };
  await assert.rejects(
    runReview(project, 'spacing', {
      requestHash: preview.requestHash,
      apiKey: 'secret',
      fetchImpl,
    }),
    /Preview/,
  );
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  record.events[0].text = 'Changed';
  await writeFile(recordPath, JSON.stringify(record));
  await assert.rejects(previewReview(project, 'spacing'), /changed/);
  assert.equal(calls, 0);
});
test('source changes during provider evaluation downgrade the saved recommendation', async (t) => {
  const { project, input } = await setup(t);
  const preview = await previewReview(project, 'spacing');
  const result = await runReview(project, 'spacing', {
    requestHash: preview.requestHash,
    apiKey: 'secret',
    fetchImpl: async () => {
      await saveInsight(project, {
        ...input,
        expectedRevision: 1,
        finding: 'Updated during request',
      });
      return { ok: true, json: async () => answer() };
    },
  });
  assert.equal(result.sourcesChanged, true);
  assert.equal(result.recommendation.action, 'review');
  const receipt = JSON.parse(await readFile(result.evaluationPath, 'utf8'));
  assert.equal(receipt.request.state.candidate.revision, 1);
});
test('key comes only from explicit environment or selected project .env; output symlinks block network', async (t) => {
  const { project } = await setup(t);
  await writeFile(
    join(project, '.env'),
    'TYPESAFE_API_KEY=local-test-key\nUNRELATED=value\n',
  );
  assert.equal(await reviewApiKey(project, {}), 'local-test-key');
  assert.equal(
    await reviewApiKey(project, { TYPESAFE_API_KEY: 'environment-test-key' }),
    'environment-test-key',
  );
  const outside = await mkdtemp(join(tmpdir(), 'incline-review-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, join(project, '.incline/evaluations'));
  const preview = await previewReview(project, 'spacing');
  let calls = 0;
  await assert.rejects(
    runReview(project, 'spacing', {
      requestHash: preview.requestHash,
      apiKey: 'secret',
      fetchImpl: async () => {
        calls++;
      },
    }),
    /real directory/,
  );
  assert.equal(calls, 0);
  assert.deepEqual(await readdir(outside), []);
});
