import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveProfile,
  getRounds,
  reviseAnswer,
  parseSaved,
  exportMarkdown,
  type Session,
} from './taste.ts';

const session = (answers: Session['answers'] = []): Session => ({
  id: 'one',
  name: 'Portfolio',
  context: 'portfolio',
  exploration: 'stretch',
  answers,
  keep: [],
  explore: [],
  notes: 'Keep clear hierarchy',
  complete: false,
  createdAt: '2026-09-17T00:00:00.000Z',
});
void test('both keeps distinct styles available without forcing a winner', () => {
  const p = deriveProfile(
    session([{ roundId: 'direction-1', choice: 'both', reason: '' }]),
  );
  assert.equal(p.find((x) => x.tag === 'minimal')?.welcomed, 1);
  assert.equal(p.find((x) => x.tag === 'editorial')?.welcomed, 1);
});
void test('losing a pair is not a rejection or an endorsement', () => {
  const p = deriveProfile(
    session([{ roundId: 'direction-1', choice: 'a', reason: '' }]),
  );
  assert.equal(p.find((x) => x.tag === 'minimal')?.preferred, 1);
  assert.equal(p.find((x) => x.tag === 'editorial')?.rejected, 0);
  assert.equal(p.find((x) => x.tag === 'minimal')?.welcomed, 0);
});
void test('neither rejects the shown examples, while depends retains uncertainty', () => {
  const p = deriveProfile(
    session([
      { roundId: 'direction-1', choice: 'neither', reason: '' },
      { roundId: 'direction-2', choice: 'depends', reason: '' },
    ]),
  );
  assert.equal(p.find((x) => x.tag === 'editorial')?.rejected, 1);
  assert.equal(p.find((x) => x.tag === 'bold')?.conditional, 1);
  assert.equal(p.find((x) => x.tag === 'bold')?.preferred, 0);
});
void test('another project never contributes evidence; silence remains unknown', () => {
  deriveProfile(session([{ roundId: 'direction-1', choice: 'a', reason: '' }]));
  assert.deepEqual(
    deriveProfile({ ...session(), id: 'two', context: 'dashboard' }),
    [],
  );
});
void test('spacing follow-up probes the selected boundary', () => {
  const compact = getRounds([{ roundId: 'density', choice: 'a', reason: '' }]);
  const airy = getRounds([{ roundId: 'density', choice: 'b', reason: '' }]);
  assert.equal(compact.length, 8);
  assert.equal(compact[6].id, 'boundary-compact');
  assert.equal(airy[6].id, 'boundary-airy');
  assert.equal(airy[6].b.density, 'expansive');
});
void test('backtracking discards dependent answers but keeps explicit user notes', () => {
  const s = session([
    { roundId: 'direction-1', choice: 'a', reason: '' },
    { roundId: 'direction-2', choice: 'b', reason: '' },
  ]);
  const revised = reviseAnswer({ ...s, complete: true }, 1);
  assert.equal(revised.answers.length, 1);
  assert.equal(revised.complete, false);
  assert.equal(revised.notes, 'Keep clear hierarchy');
  assert.equal(s.answers.length, 2);
});
void test('storage round trip keeps multiple project contexts and rejects malformed data', () => {
  const sessions = [
    session(),
    { ...session(), id: 'two', context: 'dashboard' as const },
  ];
  assert.deepEqual(
    parseSaved(JSON.stringify({ version: 1, sessions })),
    sessions,
  );
  for (const raw of [
    'oops',
    '{}',
    JSON.stringify({ version: 1, sessions: [{ id: 'bad' }] }),
    JSON.stringify({
      version: 1,
      sessions: [
        {
          ...session(),
          answers: [{ roundId: 'density', choice: 'bogus', reason: '' }],
        },
      ],
    }),
  ])
    assert.deepEqual(parseSaved(raw), []);
});
void test('export separates explicit keep instructions from tentative evidence', () => {
  const text = exportMarkdown({
    ...session([{ roundId: 'direction-1', choice: 'a', reason: 'Readable' }]),
    keep: ['editorial'],
    explore: ['bold'],
  });
  assert.match(text, /portfolio/i);
  assert.match(text, /stretch/i);
  assert.match(text, /Keep: editorial/);
  assert.match(text, /Explore: bold/);
  assert.match(text, /relative/i);
  assert.match(text, /Readable/);
  assert.match(text, /Keep clear hierarchy/);
});
