import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildRequest,
  evaluateCase,
  validateResponse,
  recommend,
  summarize,
  QUESTIONS,
} from './jev-learning.mjs';
const fixtures = JSON.parse(
  await readFile(
    new URL('../experiments/jev-learning/cases.json', import.meta.url),
    'utf8',
  ),
).cases;
function response(overrides = {}) {
  const answers = {};
  for (const [key, q] of Object.entries(QUESTIONS)) {
    if (q.type === 'noul') {
      answers[key] = { type: 'noul', noul: 0 };
      continue;
    }
    const choice = overrides[key] ?? Object.keys(q.criteria)[0];
    answers[key] = {
      type: 'choice',
      choice,
      confidence: 1,
      probabilities: Object.fromEntries(
        Object.keys(q.criteria).map((k) => [k, k === choice ? 1 : 0]),
      ),
    };
  }
  return {
    model: 'jev-1.13.0',
    answers,
    usage: { input_tokens: 100, output_tokens: 0 },
  };
}
test('all fixed requests exclude labels, rationales and case IDs, and retain exact event links', () => {
  for (const fixture of fixtures) {
    const request = buildRequest(fixture);
    assert.deepEqual(Object.keys(request).sort(), [
      'model',
      'questions',
      'state',
    ]);
    assert.deepEqual(request.state, fixture.state);
    assert.equal(request.expected, undefined);
    assert.equal(request.rationale, undefined);
    assert.equal(request.id, undefined);
    assert.equal(JSON.stringify(request).includes(fixture.id), false);
  }
  const bad = structuredClone(fixtures[0]);
  bad.state.candidate.evidenceIds = ['missing'];
  assert.throws(() => buildRequest(bad), /link/);
});
test('transport targets official endpoint with validated response and no credential in result', async () => {
  let sent;
  const result = await evaluateCase(fixtures[0], {
    apiKey: 'test-secret',
    fetchImpl: async (url, options) => {
      sent = { url, options };
      return { ok: true, json: async () => response() };
    },
  });
  assert.equal(sent.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(sent.options.redirect, 'error');
  assert.equal(sent.options.headers.Authorization, 'Bearer test-secret');
  assert.deepEqual(JSON.parse(sent.options.body), buildRequest(fixtures[0]));
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
  assert.equal(result.recommendation.action, 'project-review-candidate');
});
test('missing keys and provider failures cannot be mistaken for model decisions or echo provider bodies', async () => {
  let calls = 0;
  await assert.rejects(
    evaluateCase(fixtures[0], {
      fetchImpl: async () => {
        calls++;
      },
    }),
    /TYPESAFE_API_KEY/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    evaluateCase(fixtures[0], {
      apiKey: 'secret',
      fetchImpl: async () => {
        calls++;
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: 'secret' }),
        };
      },
    }),
    /^Error: Jev HTTP 401/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    evaluateCase(fixtures[0], {
      apiKey: 'secret',
      fetchImpl: async () => {
        throw new Error('secret');
      },
    }),
    /^Error: Jev request failed/,
  );
});
test('invalid probabilities, missing answers, incorrect winning choices and malformed usage are rejected', () => {
  const edits = [
    (r) => delete r.answers.support,
    (r) => (r.answers.support.probabilities.supported = 2),
    (r) => (r.answers.support.probabilities.unsupported = 0.5),
    (r) => (r.answers.support.choice = 'unsupported'),
    (r) => (r.answers.scope.confidence = NaN),
    (r) => (r.answers.visual_gap.noul = -1),
    (r) => (r.usage.input_tokens = -2),
  ];
  for (const edit of edits) {
    const r = response();
    edit(r);
    assert.throws(() => validateResponse(r));
  }
});
test('policy holds uncertain, conflicting and visually unverified candidates; never promotes or writes', () => {
  assert.equal(
    recommend(response({ support: 'unsupported' }).answers).action,
    'retain-only',
  );
  assert.equal(
    recommend(response({ relation: 'duplicate' }).answers).action,
    'retain-only',
  );
  assert.equal(
    recommend(response({ relation: 'conflict' }).answers).action,
    'review',
  );
  assert.equal(
    recommend(response({ scope: 'personal' }).answers).action,
    'personal-review-candidate',
  );
  const uncertain = response();
  uncertain.answers.scope.confidence = 0.2;
  assert.equal(recommend(uncertain.answers).action, 'review');
  const visual = response();
  visual.answers.visual_gap.noul = 0.8;
  assert.equal(recommend(visual.answers).action, 'review');
});
test('summary counts unsupported and cross-project promotion errors and missed useful candidates separately', () => {
  const results = fixtures.map((f) => ({
    caseId: f.id,
    answers: response({
      support: f.expected.support,
      scope: f.expected.scope,
      relation: f.expected.relation,
    }).answers,
    usage: { input_tokens: 1, output_tokens: 0 },
    recommendation: { action: 'review' },
  }));
  for (const r of results)
    r.answers.visual_gap.noul = fixtures.find((f) => f.id === r.caseId).expected
      .visual_gap
      ? 1
      : 0;
  results[1].recommendation.action = 'personal-review-candidate';
  const report = summarize(fixtures, results);
  assert.equal(report.exactLabelMatches, fixtures.length);
  assert.equal(report.unsupportedCandidatesOffered, 1);
  assert.equal(report.scopedCandidatesIncorrectlyOfferedAsPersonal, 1);
  assert.ok(report.supportedNewOrRefinedCandidatesDeferred > 0);
});
