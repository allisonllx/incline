import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const cli = resolve(
  process.env.INCLINE_FEEDBACK_TEST_CLI ?? 'local/feedback-cli.mjs',
);
const batch = () => ({
  id: 'conversation-1-checkpoint-1',
  mode: 'retrospective',
  coverage: {
    source: 'Current conversation, turns 4–8',
    limitations: ['V1 screenshot unavailable'],
  },
  artifacts: [{ id: 'v1', missingReason: 'Screenshot unavailable' }],
  events: [
    {
      id: 'e1',
      kind: 'directed-edit',
      evidence: 'verbatim',
      text: 'Make the corners sharper',
      source: 'User turn 5',
      occurredAt: null,
      context: 'Dashboard',
      artifactIds: ['v1'],
    },
  ],
});
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'incline-feedback-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(root, { recursive: true, force: true });
  });
  const input = join(root, 'input.json');
  const run = (...args) =>
    JSON.parse(
      execFileSync(process.execPath, [cli, ...args, '--project', root], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  return {
    root,
    input,
    run,
    save: (data) => writeFile(input, JSON.stringify(data)),
  };
}
test('catch-up preserves gaps and exact feedback; repeated import is idempotent', async (t) => {
  const { root, input, run, save } = await setup(t);
  const data = batch();
  await save(data);
  assert.equal(run('record', '--input', input).status, 'recorded');
  assert.equal(run('record', '--input', input).status, 'already-recorded');
  const result = run('read');
  assert.equal(result.batches.length, 1);
  assert.deepEqual(result.batches[0].events, data.events);
  assert.deepEqual(result.batches[0].coverage, data.coverage);
  assert.deepEqual(await readdir(join(root, '.incline')), ['feedback']);
});
test('artifact snapshots survive changes to originals and acceptance stays scoped', async (t) => {
  const { root, input, run, save } = await setup(t);
  await writeFile(join(root, 'v3.html'), '<h1>Approved version</h1>');
  const data = batch();
  data.mode = 'live';
  data.artifacts = [{ id: 'v3', path: 'v3.html' }];
  data.events[0] = {
    ...data.events[0],
    kind: 'acceptance',
    text: 'Perfect',
    artifactIds: ['v3'],
  };
  await save(data);
  run('record', '--input', input);
  await writeFile(join(root, 'v3.html'), 'changed');
  const record = run('read').batches[0];
  assert.equal(
    await readFile(
      join(root, '.incline/feedback', data.id, record.artifacts[0].snapshot),
      'utf8',
    ),
    '<h1>Approved version</h1>',
  );
  assert.equal(record.events[0].context, 'Dashboard');
  assert.equal(record.events[0].kind, 'acceptance');
});
test('invalid inference, missing artifacts and conflicting retries cannot alter saved evidence', async (t) => {
  const { input, run, save } = await setup(t);
  const data = batch();
  await save(data);
  run('record', '--input', input);
  data.events[0].text = 'Replacement';
  await save(data);
  assert.throws(() => run('record', '--input', input), /already exists/);
  data.id = 'bad-acceptance';
  data.events[0].kind = 'acceptance';
  data.events[0].evidence = 'inference';
  await save(data);
  assert.throws(() => run('record', '--input', input), /acceptance/);
  data.id = 'bad-artifact';
  data.events[0].kind = 'hypothesis';
  data.artifacts = [{ id: 'v1', path: 'absent.png' }];
  await save(data);
  assert.throws(() => run('record', '--input', input), /ENOENT/);
  assert.equal(run('read').batches.length, 1);
});
test('unknown fields, unsafe IDs and broken references are rejected', async (t) => {
  const { input, run, save } = await setup(t);
  for (const modify of [
    (d) => {
      d.id = '../escape';
    },
    (d) => {
      d.events[0].confidence = 0.9;
    },
    (d) => {
      d.events[0].artifactIds = ['unknown'];
    },
  ]) {
    const data = batch();
    modify(data);
    await save(data);
    assert.throws(() => run('record', '--input', input));
  }
  assert.deepEqual(run('read').batches, []);
});

test('corrupt snapshots and records fail visibly instead of returning empty evidence', async (t) => {
  const { root, input, run, save } = await setup(t);
  const data = batch();
  await writeFile(join(root, 'snapshot.html'), 'original');
  data.artifacts = [{ id: 'v1', path: 'snapshot.html' }];
  await save(data);
  run('record', '--input', input);
  const record = run('read').batches[0];
  const snapshot = join(
    root,
    '.incline/feedback',
    data.id,
    record.artifacts[0].snapshot,
  );
  await writeFile(snapshot, 'tampered');
  assert.throws(() => run('read'), /snapshot changed/);
  await writeFile(snapshot, 'original');
  const recordPath = join(root, '.incline/feedback', data.id, 'record.json');
  record.events[0].text = '';
  await writeFile(recordPath, JSON.stringify(record));
  assert.throws(() => run('read'), /Invalid feedback/);
});
test('concurrent identical checkpoints publish exactly one complete record', async (t) => {
  const { input, run, save } = await setup(t);
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const data = batch();
  await save(data);
  const { dirname } = await import('node:path');
  const execute = () =>
    promisify(execFile)(process.execPath, [
      cli,
      'record',
      '--project',
      dirname(input),
      '--input',
      input,
    ]);
  const results = await Promise.all([execute(), execute()]);
  assert.deepEqual(
    results
      .map((r) => JSON.parse(r.stdout).status)
      .sort((a, b) => a.localeCompare(b)),
    ['already-recorded', 'recorded'],
  );
  assert.equal(run('read').batches.length, 1);
});
