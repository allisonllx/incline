import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./prompts-cli.mjs', import.meta.url));
async function fixture(t) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'incline-prompt-cli-')),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  await mkdir(project);
  await mkdir(join(project, '.git'));
  return { root, project };
}
function call(cwd, ...args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
  });
  return {
    ...result,
    data: result.status === 0 ? JSON.parse(result.stdout) : null,
  };
}
async function json(path, value) {
  await writeFile(path, JSON.stringify(value));
}

test('CLI saves and retrieves exact text as portable JSON, resolving asset paths from input', async (t) => {
  const { root, project } = await fixture(t);
  const dataFile = join(root, 'input.json');
  await writeFile(
    join(root, 'image.png'),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  await json(dataFile, {
    title: 'Motion',
    prompt: 'A\r\n日本語\n',
    origin: 'published',
    tags: [{ facet: 'motion', value: 'looping', provenance: 'source-text' }],
    assets: [{ id: 'frame', path: 'image.png', contentType: 'image/png' }],
  });
  const saved = call(project, 'save', '--input', dataFile);
  assert.equal(saved.status, 0, saved.stderr);
  assert.equal(saved.data.prompt, 'A\r\n日本語\n');
  const read = call(project, 'read', '--id', saved.data.id, '--revision', '1');
  assert.equal(read.status, 0, read.stderr);
  assert.equal(read.data.assets[0].sha256.length, 64);
  const query = call(project, 'query', '--tag', 'motion:looping:source-text');
  assert.equal(query.status, 0, query.stderr);
  assert.equal(query.data[0].id, saved.data.id);
  assert.equal(query.data[0].prompt, undefined);
  const personal = join(root, 'personal');
  const copied = call(
    project,
    'copy',
    '--id',
    saved.data.id,
    '--from',
    'local',
    '--to',
    'personal',
    '--personal-dir',
    personal,
  );
  assert.equal(copied.status, 0, copied.stderr);
  assert.notEqual(copied.data.id, saved.data.id);
  assert.equal(
    call(project, 'list', '--scope', 'personal', '--personal-dir', personal)
      .data.length,
    1,
  );
  assert.equal(
    (
      await readFile(
        join(
          personal,
          copied.data.id,
          'revisions',
          '0001',
          'assets',
          'frame.png',
        ),
      )
    ).length,
    8,
  );
});

test('CLI rejects invalid options and local-only access before storage writes', async (t) => {
  const { root, project } = await fixture(t);
  const input = join(root, 'input.json');
  await json(input, { title: 'Safe', prompt: 'text', origin: 'user-authored' });
  const bad = call(project, 'save', '--input', input, '--unknown', 'x');
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /Unknown option/);
  const forbidden = call(
    project,
    'save',
    '--input',
    input,
    '--scope',
    'personal',
    '--local-only',
  );
  assert.notEqual(forbidden.status, 0);
  assert.match(forbidden.stderr, /local-only/);
  await assert.rejects(readdir(join(project, '.incline', 'prompts')), {
    code: 'ENOENT',
  });
});

test('CLI run records only while project settings are active', async (t) => {
  const { root, project } = await fixture(t);
  const promptInput = join(root, 'prompt.json');
  const runInput = join(root, 'run.json');
  const settingsInput = join(root, 'settings.json');
  await json(promptInput, {
    title: 'Run',
    prompt: 'try it',
    origin: 'user-authored',
  });
  const saved = call(project, 'save', '--input', promptInput);
  assert.equal(saved.status, 0, saved.stderr);
  await json(runInput, {
    inputs: [{ name: 'brief', value: 'small demo' }],
    execution: { status: 'succeeded', evidence: ['completed locally'] },
    tester: { status: 'passed', by: 'agent-run', evidence: ['render opened'] },
    artifacts: [
      {
        id: 'video',
        locator: 'demo.mp4',
        missingReason: 'Motion capture unavailable',
      },
    ],
  });
  const blocked = call(
    project,
    'run',
    '--id',
    saved.data.id,
    '--revision',
    '1',
    '--input',
    runInput,
  );
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /recording must be active/);
  await json(settingsInput, { recording: 'active' });
  const settings = call(project, 'settings', '--input', settingsInput);
  assert.equal(settings.status, 0, settings.stderr);
  const run = call(
    project,
    'run',
    '--id',
    saved.data.id,
    '--revision',
    '1',
    '--input',
    runInput,
  );
  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    run.data.artifacts[0].missingReason,
    'Motion capture unavailable',
  );
  assert.equal(
    call(project, 'runs', '--id', saved.data.id, '--revision', '1').data.length,
    1,
  );
});
