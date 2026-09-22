import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  unlink,
  symlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { recordFeedback } from './feedback.mjs';
import {
  saveExploration,
  readExploration,
  listExplorations,
  explorationEvidence,
} from './exploration-store.mjs';
import {
  seed,
  decision,
  projectFixture,
  sha256,
} from './test-support/exploration.mjs';

test('empty reads create no state', async (t) => {
  const project = await projectFixture(t);
  assert.equal(await readExploration(project, { id: 'study' }), null);
  assert.deepEqual(await listExplorations(project), { studies: [] });
  assert.deepEqual(await readdir(project), []);
});

test('checkpoints preserve failures and old revisions; retries stay idempotent after newer saves', async (t) => {
  const project = await projectFixture(t);
  const input = seed();
  const first = await saveExploration(project, input);
  const bytes = await readFile(first.revisionPath);
  const second = structuredClone(input);
  second.expectedRevision = 1;
  second.decisions.push(decision('park', 'park', ['nature']));
  assert.equal((await saveExploration(project, second)).revision, 2);
  assert.deepEqual(await readFile(first.revisionPath), bytes);
  assert.equal((await saveExploration(project, input)).status, 'already-saved');
  assert.equal((await readExploration(project, { id: 'study' })).revision, 2);
  assert.equal(
    (await readExploration(project, { id: 'study', revision: 1 })).decisions
      .length,
    0,
  );
  assert.deepEqual(
    (await listExplorations(project)).studies.map((s) => s.id),
    ['study'],
  );
  assert.deepEqual(await readdir(join(project, '.incline')), ['studies']);
  const stale = seed();
  stale.brief.goal = 'Conflicting retry';
  await assert.rejects(
    saveExploration(project, stale),
    /revision|different|conflict/i,
  );
});

test('concurrent different checkpoints cannot overwrite a revision', async (t) => {
  const project = await projectFixture(t);
  await saveExploration(project, seed());
  const a = seed();
  a.expectedRevision = 1;
  a.decisions.push(decision('a', 'park', ['nature']));
  const b = seed();
  b.expectedRevision = 1;
  b.decisions.push(decision('b', 'explore', ['type']));
  const results = await Promise.allSettled([
    saveExploration(project, a),
    saveExploration(project, b),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  assert.equal(
    (await readExploration(project, { id: 'study' })).decisions.length,
    1,
  );
});

test('concurrent identical requests publish one complete snapshot', async (t) => {
  const project = await projectFixture(t);
  const results = await Promise.all([
    saveExploration(project, seed()),
    saveExploration(project, seed()),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [
    'already-saved',
    'saved',
  ]);
  assert.deepEqual(
    await readdir(join(project, '.incline/studies/study/exploration')),
    ['1.json'],
  );
});

test('corrupted latest checkpoints and altered request hashes fail visibly', async (t) => {
  const project = await projectFixture(t);
  const saved = await saveExploration(project, seed());
  const data = JSON.parse(await readFile(saved.revisionPath, 'utf8'));
  data.hypotheses[0].claim = 'Unrecorded replacement';
  await writeFile(saved.revisionPath, JSON.stringify(data));
  await assert.rejects(
    readExploration(project, { id: 'study' }),
    /hash|integrity/i,
  );
  await assert.rejects(saveExploration(project, seed()), /hash|integrity/i);
  await writeFile(saved.revisionPath, '{');
  await assert.rejects(listExplorations(project));
});

test('storage rejects symlink destinations, unsafe IDs, and oversized snapshots', async (t) => {
  const project = await projectFixture(t);
  const outside = await projectFixture(t);
  await symlink(outside, join(project, '.incline'));
  await assert.rejects(saveExploration(project, seed()), /symlink|unsafe/i);
  assert.deepEqual(await readdir(outside), []);
  await assert.rejects(
    readExploration(project, { id: '../escape' }),
    /ID|invalid|unsafe/i,
  );
  await unlink(join(project, '.incline'));
  const saved = await saveExploration(project, seed());
  await writeFile(saved.revisionPath, ' '.repeat(1_000_001));
  await assert.rejects(
    readExploration(project, { id: 'study' }),
    /large|size/i,
  );
});

test('local images are checked selectively and changing old images does not prevent a correction', async (t) => {
  const project = await projectFixture(t);
  const base = join(project, '.incline/studies/study');
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'sample-v1.png'), 'synthetic image');
  const input = seed();
  input.artifacts.push({
    id: 'sample',
    role: 'sample',
    source: {
      kind: 'study-file',
      path: 'sample-v1.png',
      sha256: sha256('synthetic image'),
    },
  });
  input.attempts.push({
    id: 'a',
    hypothesisIds: ['nature'],
    artifactIds: ['sample'],
    feedbackLinks: [],
  });
  await saveExploration(project, input);
  assert.equal(
    (
      await explorationEvidence(project, { id: 'study', nodeId: 'nature' })
    ).artifacts.find((a) => a.id === 'sample').status,
    'available',
  );
  await writeFile(join(base, 'sample-v1.png'), 'changed');
  assert.equal(
    (
      await explorationEvidence(project, { id: 'study', nodeId: 'nature' })
    ).artifacts.find((a) => a.id === 'sample').status,
    'changed',
  );
  assert.ok(
    !(
      await explorationEvidence(project, { id: 'study', nodeId: 'type' })
    ).artifacts.some((a) => a.id === 'sample'),
  );
  input.expectedRevision = 1;
  input.decisions.push(decision('park', 'park', ['nature']));
  assert.equal((await saveExploration(project, input)).revision, 2);
  await unlink(join(base, 'sample-v1.png'));
  assert.equal(
    (
      await explorationEvidence(project, { id: 'study', nodeId: 'nature' })
    ).artifacts.find((a) => a.id === 'sample').status,
    'unavailable',
  );
});

test('new local images must match their hashes and cannot traverse or follow symlinks', async (t) => {
  const project = await projectFixture(t);
  const base = join(project, '.incline/studies/study');
  await mkdir(base, { recursive: true });
  const outside = await projectFixture(t);
  await writeFile(join(outside, 'secret'), 'outside');
  await symlink(join(outside, 'secret'), join(base, 'escape'));
  const input = seed();
  input.artifacts.push({
    id: 'sample',
    role: 'sample',
    source: { kind: 'study-file', path: 'escape', sha256: sha256('outside') },
  });
  await assert.rejects(
    saveExploration(project, input),
    /symlink|unsafe|unavailable/i,
  );
  input.artifacts[1].source.path = '../secret';
  await assert.rejects(saveExploration(project, input), /path|unsafe/i);
  await writeFile(join(base, 'actual'), 'actual');
  input.artifacts[1].source.path = 'actual';
  await assert.rejects(saveExploration(project, input), /hash|changed/i);
});

async function feedbackFixture(project) {
  const source = join(project, 'source.png');
  await writeFile(source, 'journal image');
  const saved = await recordFeedback(
    project,
    {
      id: 'feedback',
      mode: 'live',
      coverage: { source: 'Synthetic test', limitations: [] },
      artifacts: [{ id: 'image', path: source }],
      events: [
        {
          id: 'nah',
          kind: 'negative',
          evidence: 'verbatim',
          text: 'Nah',
          source: 'Synthetic user',
          occurredAt: null,
          context: 'Sample A',
          artifactIds: ['image'],
        },
        {
          id: 'keep',
          kind: 'directed-edit',
          evidence: 'verbatim',
          text: 'Keep typography',
          source: 'Synthetic user',
          occurredAt: null,
          context: 'Sample A',
          artifactIds: ['image'],
        },
      ],
    },
    project,
  );
  const bytes = await readFile(saved.recordPath);
  return { ...saved, bytes, hash: sha256(bytes) };
}

test('feedback links preserve exact rejection without inferring a cause or user instruction', async (t) => {
  const project = await projectFixture(t);
  const journal = await feedbackFixture(project);
  const input = seed();
  input.artifacts.push({
    id: 'sample',
    role: 'sample',
    source: {
      kind: 'feedback',
      batchId: 'feedback',
      artifactId: 'image',
      recordHash: journal.hash,
    },
  });
  const ref = { batchId: 'feedback', eventId: 'nah', recordHash: journal.hash };
  input.attempts.push({
    id: 'a',
    hypothesisIds: ['nature'],
    artifactIds: ['sample'],
    feedbackLinks: [ref],
  });
  input.decisions.push(
    decision('back', 'return', ['nature'], {
      returnToIds: ['type'],
      feedbackLinks: [ref],
    }),
  );
  await saveExploration(project, input);
  const result = await explorationEvidence(project, {
    id: 'study',
    nodeId: 'nature',
  });
  assert.equal(result.feedback[0].event.text, 'Nah');
  assert.equal(result.feedback[0].status, 'available');
  assert.equal(
    result.artifacts.find((a) => a.id === 'sample').status,
    'available',
  );
  assert.deepEqual(await readFile(journal.recordPath), journal.bytes);
  const invalid = structuredClone(input);
  invalid.id = 'other';
  invalid.decisions[0].basis = 'user-instruction';
  await assert.rejects(saveExploration(project, invalid), /instruction/i);
  invalid.decisions[0].feedbackLinks = [{ ...ref, eventId: 'keep' }];
  assert.equal((await saveExploration(project, invalid)).status, 'saved');
});

test('missing or changed linked evidence warns on reads and rejects new links on saves', async (t) => {
  const project = await projectFixture(t);
  const journal = await feedbackFixture(project);
  const input = seed();
  input.decisions.push(
    decision('park', 'park', ['nature'], {
      feedbackLinks: [
        { batchId: 'feedback', eventId: 'nah', recordHash: journal.hash },
      ],
    }),
  );
  await saveExploration(project, input);
  const changed = JSON.parse(journal.bytes);
  changed.events[0].text = 'Changed feedback';
  await writeFile(journal.recordPath, JSON.stringify(changed));
  let evidence = await explorationEvidence(project, {
    id: 'study',
    nodeId: 'nature',
  });
  assert.equal(evidence.feedback[0].status, 'changed');
  assert.equal(evidence.feedback[0].event, undefined);
  assert.ok(evidence.warnings.length);
  const other = structuredClone(input);
  other.id = 'another';
  await assert.rejects(saveExploration(project, other), /changed|hash/i);
  await writeFile(journal.recordPath, journal.bytes);
  other.decisions[0].feedbackLinks[0].eventId = 'missing';
  await assert.rejects(saveExploration(project, other), /event|missing/i);
  await unlink(journal.recordPath);
  evidence = await explorationEvidence(project, {
    id: 'study',
    nodeId: 'nature',
  });
  assert.equal(evidence.feedback[0].status, 'unavailable');
});

test('targeted evidence includes decision-named sample and feedback without unrelated sibling attempts', async (t) => {
  const project = await projectFixture(t);
  const journal = await feedbackFixture(project);
  const input = seed();
  input.artifacts.push(
    {
      id: 'comparison',
      role: 'sample',
      source: {
        kind: 'feedback',
        batchId: 'feedback',
        artifactId: 'image',
        recordHash: journal.hash,
      },
    },
    {
      id: 'unrelated',
      role: 'sample',
      source: { kind: 'unavailable', reason: 'Unrelated study' },
    },
  );
  input.attempts.push(
    {
      id: 'comparison',
      hypothesisIds: ['type'],
      artifactIds: ['comparison'],
      feedbackLinks: [
        { batchId: 'feedback', eventId: 'nah', recordHash: journal.hash },
      ],
    },
    {
      id: 'unrelated',
      hypothesisIds: ['type'],
      artifactIds: ['unrelated'],
      feedbackLinks: [
        { batchId: 'feedback', eventId: 'keep', recordHash: journal.hash },
      ],
    },
  );
  input.decisions.push(
    decision('comparison', 'park', ['nature'], { attemptIds: ['comparison'] }),
    decision('sibling', 'refine', ['type'], {
      attemptIds: ['comparison', 'unrelated'],
    }),
  );
  await saveExploration(project, input);
  const evidence = await explorationEvidence(project, {
    id: 'study',
    nodeId: 'nature',
  });
  assert.deepEqual(
    evidence.artifacts.map((a) => a.id),
    ['ref', 'comparison'],
  );
  assert.deepEqual(
    evidence.feedback.map((f) => f.eventId),
    ['nah'],
  );
  assert.equal(evidence.artifacts[1].status, 'available');
  assert.equal(evidence.feedback[0].event.text, 'Nah');
});

for (const journalState of ['missing', 'changed'])
  test(`new attachments revalidate reused ${journalState} feedback while old attachments survive`, async (t) => {
    const project = await projectFixture(t);
    const journal = await feedbackFixture(project);
    const input = seed();
    const ref = {
      batchId: 'feedback',
      eventId: 'nah',
      recordHash: journal.hash,
    };
    input.attempts.push(
      {
        id: 'old',
        hypothesisIds: ['type'],
        artifactIds: ['ref'],
        feedbackLinks: [ref],
      },
      {
        id: 'existing-empty',
        hypothesisIds: ['nature'],
        artifactIds: ['ref'],
        feedbackLinks: [],
      },
    );
    await saveExploration(project, input);
    if (journalState === 'missing') await unlink(journal.recordPath);
    else
      await writeFile(journal.recordPath, `${journal.bytes.toString('utf8')} `);
    input.expectedRevision = 1;
    input.decisions.push(decision('park', 'park', ['nature']));
    assert.equal((await saveExploration(project, input)).revision, 2);
    for (const attach of [
      (next) =>
        next.attempts.push({
          id: 'new',
          hypothesisIds: ['nature'],
          artifactIds: ['ref'],
          feedbackLinks: [ref],
        }),
      (next) => next.attempts[1].feedbackLinks.push(ref),
      (next) =>
        next.decisions.push(
          decision('new-decision', 'explore', ['nature'], {
            feedbackLinks: [ref],
          }),
        ),
    ]) {
      const next = structuredClone(input);
      next.expectedRevision = 2;
      attach(next);
      await assert.rejects(
        saveExploration(project, next),
        /Feedback.*(unavailable|changed)/,
      );
    }
    assert.equal((await readExploration(project, { id: 'study' })).revision, 2);
  });
