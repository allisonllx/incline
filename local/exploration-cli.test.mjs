import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  writeFile,
  readdir,
  mkdir,
  readFile,
  realpath,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { seed, decision, projectFixture } from './test-support/exploration.mjs';
const exec = promisify(execFile);
const cli = resolve(
  process.env.INCLINE_EXPLORATION_TEST_CLI ?? 'local/exploration-cli.mjs',
);
const run = async (project, ...args) =>
  JSON.parse(
    (await exec(process.execPath, [cli, ...args, '--project', project])).stdout,
  );

test('read-only CLI commands leave empty projects untouched and reject invalid flags', async (t) => {
  const project = await projectFixture(t);
  assert.deepEqual(await run(project, 'list'), { studies: [] });
  assert.equal(await run(project, 'read', '--id', 'study'), null);
  assert.equal(await run(project, 'view', '--id', 'study'), null);
  for (const args of [
    ['delete', '--id', 'study'],
    ['save'],
    ['read'],
    ['view', '--id', 'study', '--limit', '0'],
    ['view', '--id', 'study', '--limit', '51'],
    ['view', '--id', 'study', '--limit', '1.5'],
    ['read', '--id', 'study', '--revision', '0'],
    ['read', '--id', 'study', '--revision', '9007199254740992'],
    ['read', '--id', '../escape'],
    ['read', '--id', 'study', '--id', 'other'],
    ['list', '--input', 'input.json'],
    ['list', '--node', 'nature'],
    ['read', '--id', 'study', '--limit', '1'],
    ['evidence', '--id', 'study'],
    ['list', '--library-dir', project],
    ['list', '--personal-dir', project],
  ])
    await assert.rejects(run(project, ...args));
  assert.deepEqual(await readdir(project), []);
});

test('CLI preserves checkpoints and returns compact views plus explicit evidence gaps', async (t) => {
  const project = await projectFixture(t);
  const file = join(project, 'input.json');
  const input = seed();
  await writeFile(file, JSON.stringify(input));
  const first = await run(project, 'save', '--input', file);
  assert.equal(first.status, 'saved');
  assert.equal(
    (await run(project, 'save', '--input', file)).status,
    'already-saved',
  );
  input.expectedRevision = 1;
  input.decisions.push(decision('park', 'park', ['nature']));
  await writeFile(file, JSON.stringify(input));
  await run(project, 'save', '--input', file);
  const view = await run(project, 'view', '--id', 'study', '--limit', '1');
  assert.equal(view.parked[0].id, 'nature');
  assert.equal(view.alternatives[0].id, 'type');
  assert.equal(
    (await run(project, 'read', '--id', 'study', '--revision', '1')).decisions
      .length,
    0,
  );
  const evidence = await run(
    project,
    'evidence',
    '--id',
    'study',
    '--node',
    'nature',
  );
  assert.equal(evidence.artifacts[0].status, 'unavailable');
  assert.ok(evidence.warnings.length > 0);
  assert.equal((await run(project, 'list', '--local-only')).studies.length, 1);
  assert.deepEqual(await readdir(join(project, '.incline')), ['studies']);
});

test('standalone CLI defaults to the active project rather than the installed script directory', async (t) => {
  const project = await projectFixture(t);
  await mkdir(join(project, '.git'));
  await mkdir(join(project, 'nested'));
  const input = join(project, 'input.json');
  await writeFile(input, JSON.stringify(seed()));
  const result = JSON.parse(
    (
      await exec(process.execPath, [cli, 'save', '--input', input], {
        cwd: join(project, 'nested'),
      })
    ).stdout,
  );
  assert.ok(
    result.revisionPath.startsWith(join(await realpath(project), '.incline')),
  );
  assert.equal(
    JSON.parse(await readFile(result.revisionPath, 'utf8')).id,
    'study',
  );
  assert.deepEqual(await readdir(join(project, 'nested')), []);
});
