import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveInsight } from './insights.mjs';
const exec = promisify(execFile);
const cli = fileURLToPath(new URL('./insights-cli.mjs', import.meta.url));
const run = async (project, ...args) =>
  JSON.parse(
    (await exec(process.execPath, [cli, ...args, '--project', project])).stdout,
  );
async function fixture(t) {
  const project = await mkdtemp(join(tmpdir(), 'incline-knowledge-cli-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  return project;
}
test('query CLI is read-only on empty projects and validates command-specific options', async (t) => {
  const project = await fixture(t);
  const result = await run(project, 'query', '--query', 'spacing');
  assert.equal(result.freshness, 'missing');
  assert.deepEqual(result.results, []);
  assert.deepEqual(await readdir(project), []);
  for (const args of [
    ['rebuild', '--query', 'spacing'],
    ['read', '--scope', 'controls'],
    ['query', '--id', 'spacing'],
    ['query', '--limit', '0'],
    ['query', '--limit', '21'],
    ['query', '--limit', '2.5'],
    ['query', '--query', 'spacing', '--query', 'colour'],
    ['query', '--input', 'x.json'],
    ['rebuild', '--library-dir', '/tmp'],
  ])
    await assert.rejects(run(project, ...args));
  assert.deepEqual(await readdir(project), []);
});
test('CLI rebuild and query preserve evidence and expose exact scoped findings', async (t) => {
  const project = await fixture(t);
  const folder = join(project, '.incline/feedback/source');
  await mkdir(folder, { recursive: true });
  const path = join(folder, 'record.json');
  const bytes = JSON.stringify({
    version: 1,
    id: 'source',
    coverage: {},
    artifacts: [],
    events: [
      {
        id: 'gap',
        kind: 'directed-edit',
        evidence: 'verbatim',
        text: 'Keep space below controls',
        artifactIds: [],
      },
    ],
  });
  await writeFile(path, bytes);
  await saveInsight(project, {
    id: 'spacing',
    aspect: 'spacing',
    finding: 'Separate controls from text',
    scope: 'lesson',
    status: 'explicit',
    qualifications: ['Keep related outputs together'],
    openQuestions: ['Other contexts?'],
    supportingEvidence: [{ batchId: 'source', eventId: 'gap' }],
    conflictingEvidence: [],
    expectedRevision: 0,
  });
  const rebuilt = await run(project, 'rebuild');
  assert.ok(rebuilt.indexPath);
  const result = await run(
    project,
    'query',
    '--query',
    'controls',
    '--scope',
    'lesson',
    '--limit',
    '1',
  );
  assert.equal(result.freshness, 'current');
  assert.equal(result.results[0].id, 'spacing');
  assert.deepEqual(result.results[0].qualifications, [
    'Keep related outputs together',
  ]);
  assert.equal(
    (await run(project, 'query', '--scope', 'portfolio')).results.length,
    0,
  );
  assert.equal(
    (await run(project, 'read', '--id', 'spacing')).insights[0].revision,
    1,
  );
  assert.equal(
    (await run(project, 'evidence', '--id', 'spacing')).supporting[0].event
      .text,
    'Keep space below controls',
  );
  assert.equal(await readFile(path, 'utf8'), bytes);
});
