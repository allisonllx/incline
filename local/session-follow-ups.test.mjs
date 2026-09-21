import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from './sessions.mjs';
import { getRounds, exportMarkdown } from '../lib/taste.ts';
const base = () => ({
  id: 'session',
  name: 'Synthetic',
  context: 'portfolio',
  exploration: 'stretch',
  answers: [],
  keep: [],
  explore: [],
  notes: '',
  complete: false,
  createdAt: '2026-09-22',
});
test('server round trip retains v3 optional selection and resumes the exact question', () => {
  const s = { ...base(), catalogVersion: 3, followUps: ['motion'] };
  s.answers = getRounds([], 3).map((r) => ({
    roundId: r.id,
    choice: 'both',
    reason: '',
  }));
  const saved = validate([s])[0];
  assert.deepEqual(saved.followUps, ['motion']);
  assert.equal(
    getRounds(saved.answers, saved.catalogVersion, saved.followUps)[
      saved.answers.length
    ].id,
    'motion',
  );
  saved.answers.push({
    roundId: 'motion',
    choice: 'skipped',
    reason: 'Unavailable',
  });
  saved.complete = true;
  assert.equal(validate([saved])[0].complete, true);
  assert.throws(() => validate([{ ...saved, followUps: [] }]));
});
test('normalization preserves versionless/v1/v2 question order and export meaning', () => {
  for (const version of [undefined, 1, 2]) {
    const s = { ...base(), ...(version ? { catalogVersion: version } : {}) };
    for (let i = 0; i < getRounds(s.answers, version).length; i++)
      s.answers.push({
        roundId: getRounds(s.answers, version)[i].id,
        choice: 'both',
        reason: '',
      });
    s.complete = true;
    const saved = validate([s])[0];
    assert.equal(saved.followUps, undefined);
    assert.equal(exportMarkdown(saved), exportMarkdown(s));
    assert.deepEqual(
      getRounds(saved.answers, saved.catalogVersion).map((r) => r.id),
      getRounds(s.answers, version).map((r) => r.id),
    );
  }
});
