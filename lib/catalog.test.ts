import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRounds, parseSaved, deriveProfile, type Session } from './taste.ts';
void test('new calibration covers twelve directions before probing individual attributes', () => {
  const rounds = getRounds([], 2);
  const styles = new Set(
    rounds.slice(0, 6).flatMap((r) => [r.a.style, r.b.style]),
  );
  assert.equal(styles.size, 12);
  assert.equal(rounds.length, 12);
  assert.ok(
    styles.has('brutalist') &&
      styles.has('cinematic') &&
      styles.has('terminal'),
  );
  assert.ok(
    rounds.some((r) => r.dimension === 'Layout' && r.a.layout !== r.b.layout),
  );
  assert.ok(
    rounds.some((r) => r.dimension === 'Motion' && r.a.motion !== r.b.motion),
  );
});
void test('new catalog keeps historical quiz lengths and semantics intact', () => {
  const old = getRounds([], 1);
  assert.equal(old.length, 8);
  assert.equal(old[0].tags[0], 'minimal');
  assert.equal(old[0].a.layout, 'classic');
  assert.notEqual(getRounds([], 2)[0].a.layout, 'classic');
});
void test('a full new session remains valid after saving, with multiple preferred directions', () => {
  const answers: Session['answers'] = [];
  assert.equal(getRounds([], 2).length, 12);
  for (let i = 0; i < 12; i++)
    answers.push({
      roundId: getRounds(answers, 2)[i].id,
      choice: 'both',
      reason: '',
    });
  const session: Session = {
    catalogVersion: 2,
    id: 'new',
    name: 'New',
    context: 'portfolio',
    exploration: 'surprise',
    answers,
    keep: ['brutalist', 'deco'],
    explore: ['cinematic'],
    notes: 'Preserve contrast',
    complete: true,
    createdAt: '2026-09-17',
  };
  assert.equal(
    parseSaved(JSON.stringify({ version: 1, sessions: [session] })).length,
    1,
  );
  const p = deriveProfile(session);
  assert.equal(p.find((r) => r.tag === 'brutalist')?.welcomed, 1);
  assert.equal(p.find((r) => r.tag === 'deco')?.welcomed, 1);
});
