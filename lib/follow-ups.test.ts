import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRounds,
  parseSaved,
  deriveProfile,
  exportMarkdown,
  reviseAnswer,
  selectFollowUps,
  sessionStyles,
  type Session,
  type Choice,
} from './taste.ts';
const session = (): Session => ({
  id: 'v3',
  catalogVersion: 3,
  followUps: [],
  name: 'Synthetic',
  context: 'dashboard',
  exploration: 'stretch',
  answers: [],
  keep: [],
  explore: [],
  notes: '',
  complete: false,
  createdAt: '2026-09-22',
});
function answerAll(s: Session, choice: Choice = 'both') {
  const next = structuredClone(s);
  for (
    let rounds = getRounds(next.answers, next.catalogVersion, next.followUps);
    next.answers.length < rounds.length;
    rounds = getRounds(next.answers, next.catalogVersion, next.followUps)
  )
    next.answers.push({
      roundId: rounds[next.answers.length].id,
      choice,
      reason: '',
    });
  return { ...next, complete: true };
}
const parse = (s: unknown) =>
  parseSaved(JSON.stringify({ version: 1, sessions: [s] }));
void test('v3 completes ten questions without forcing probes, including both and depends', () => {
  for (const choice of ['both', 'depends'] as Choice[]) {
    const s = answerAll(session(), choice);
    assert.equal(s.answers.length, 10);
    assert.equal(parse(s).length, 1);
    assert.equal(sessionStyles(s).length, 12);
    assert.ok(
      !deriveProfile(s).some((e) =>
        ['still', 'animated', 'balanced', 'expansive'].includes(e.tag),
      ),
    );
  }
  assert.equal(getRounds([], 1).length, 8);
  assert.equal(getRounds([], 2).length, 12);
});
void test('optional probes persist, use canonical order, and adapt to density', () => {
  let s = answerAll(session(), 'b');
  s = selectFollowUps(s, ['motion', 'spacing']);
  assert.deepEqual(s.followUps, ['spacing', 'motion']);
  assert.equal(s.complete, false);
  assert.deepEqual(
    getRounds(s.answers, 3, s.followUps)
      .slice(10)
      .map((r) => r.id),
    ['boundary-airy', 'motion'],
  );
  s = answerAll(s);
  assert.equal(parse(s).length, 1);
  assert.match(exportMarkdown(s), /Spacing boundary/);
  assert.match(exportMarkdown(s), /Motion/);
  const without = selectFollowUps(s, []);
  assert.equal(without.answers.length, 10);
  assert.equal(without.complete, true);
  assert.doesNotMatch(exportMarkdown(without), /Spacing boundary|→.*motion/);
  assert.ok(!deriveProfile(without).some((e) => e.tag === 'animated'));
});
void test('backtracking invalidates dependent answers and hidden answers never contribute', () => {
  let s = answerAll(selectFollowUps(session(), ['spacing', 'motion']), 'b');
  s = reviseAnswer(s, 6);
  s.answers.push({ roundId: 'density', choice: 'a', reason: '' });
  s = answerAll(s);
  assert.equal(s.answers[10].roundId, 'boundary-compact');
  assert.equal(parse(s).length, 1);
  const malformed = { ...s, followUps: [] };
  assert.equal(parse(malformed).length, 0);
  assert.ok(!deriveProfile(malformed).some((e) => e.tag === 'animated'));
  assert.doesNotMatch(exportMarkdown(malformed), /Motion:/);
  const onlyMotion = answerAll(
    selectFollowUps(answerAll(session()), ['motion']),
  );
  const addSpacing = selectFollowUps(onlyMotion, ['motion', 'spacing']);
  assert.equal(addSpacing.answers.length, 10);
  assert.equal(addSpacing.complete, false);
});
void test('malformed selections are rejected and skipped motion supplies no preference', () => {
  for (const followUps of [
    undefined,
    null,
    ['other'],
    ['spacing', 'spacing'],
    ['motion', 3],
    'spacing',
  ])
    assert.equal(parse({ ...session(), followUps }).length, 0);
  assert.equal(
    parse({ ...session(), catalogVersion: 2, followUps: [] }).length,
    0,
  );
  const s = answerAll(selectFollowUps(session(), ['motion']));
  s.answers[10].choice = 'skipped';
  assert.equal(parse(s).length, 1);
  assert.ok(
    !deriveProfile(s).some((e) => e.tag === 'still' || e.tag === 'animated'),
  );
  assert.match(exportMarkdown(s), /skipped/);
  s.answers[0].choice = 'skipped';
  assert.equal(parse(s).length, 0);
});
