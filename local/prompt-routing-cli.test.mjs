import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const cli = fileURLToPath(new URL('./prompt-routing-cli.mjs', import.meta.url));
test('routing CLI previews an empty project without writes or credentials and rejects ambiguous flags', async (t) => {
  const project = await mkdtemp(join(tmpdir(), 'incline-routing-cli-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  const input = join(project, 'stage.json');
  await writeFile(
    input,
    JSON.stringify({
      stage: { id: 'test', revision: 'v1', brief: 'A layered reveal' },
    }),
  );
  const run = (...args) =>
    exec(process.execPath, [
      cli,
      '--project',
      project,
      '--input',
      input,
      ...args,
    ]);
  const output = JSON.parse((await run()).stdout);
  assert.equal(output.skipReason, 'no-match');
  assert.deepEqual(await readdir(project), ['stage.json']);
  await assert.rejects(run('--send'), (error) =>
    /--request-hash/.test(error.stderr),
  );
  await assert.rejects(run('--project', project), (error) =>
    /repeated/.test(error.stderr),
  );
  await assert.rejects(run('--replay', input), (error) =>
    /combined/.test(error.stderr),
  );
});
