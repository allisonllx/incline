import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  realpath,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPromptStore, copyPrompt } from './prompts.mjs';
import { savePromptSettings } from './prompt-settings.mjs';

async function fixture(t) {
  const project = await realpath(
    await mkdtemp(join(tmpdir(), 'incline-prompts-')),
  );
  t.after(() => rm(project, { recursive: true, force: true }));
  const directory = join(project, '.incline', 'prompts');
  return {
    project,
    directory,
    store: createPromptStore(directory, { projectDirectory: project }),
  };
}
const base = (prompt = 'Line one\r\n色 🎨\n') => ({
  title: 'Reveal',
  prompt,
  origin: 'user-authored',
});

test('construction and read queries do not create storage', async (t) => {
  const { directory, store } = await fixture(t);
  assert.deepEqual(await store.list(), []);
  assert.deepEqual(await store.query({ text: 'anything' }), []);
  await assert.rejects(
    store.read('00000000-0000-4000-8000-000000000000'),
    /not found/i,
  );
  await assert.rejects(readdir(directory), { code: 'ENOENT' });
});

test('exact text, immutable revisions, compact query and provenance', async (t) => {
  const { store, directory } = await fixture(t);
  const first = await store.save({
    ...base(),
    tags: [
      { facet: 'medium', value: 'Live frontend', provenance: 'source-text' },
      {
        facet: 'visual-treatment',
        value: 'Monochrome',
        provenance: 'agent-hypothesis',
      },
    ],
    requirements: { roles: ['navigation transition'], medium: 'live frontend' },
  });
  assert.equal(first.prompt, base().prompt);
  assert.equal(
    (
      await readFile(
        join(directory, first.id, 'revisions', '0001', 'prompt.txt'),
      )
    ).toString(),
    base().prompt,
  );
  assert.equal(
    (
      await store.query({
        text: 'navigation',
        tags: [
          {
            facet: 'medium',
            value: 'Live frontend',
            provenance: 'source-text',
          },
        ],
      })
    ).length,
    1,
  );
  assert.equal(
    (
      await store.query({
        tags: [{ facet: 'medium', value: 'Live frontend', provenance: 'user' }],
      })
    ).length,
    0,
  );
  assert.equal((await store.list())[0].prompt, undefined);
  const next = await store.save({
    id: first.id,
    baseRevision: first.revision,
    ...base('Changed\n'),
    tags: first.tags,
    requirements: first.requirements,
  });
  assert.equal(next.revision, 2);
  assert.equal((await store.read(first.id, 1)).prompt, base().prompt);
  assert.equal((await store.read(first.id)).prompt, 'Changed\n');
  assert.deepEqual(await store.runs(first.id, 2), []);
  await assert.rejects(
    store.save({ id: first.id, baseRevision: 1, ...base('stale') }),
    /changed/i,
  );
  await assert.rejects(
    store.save({ ...first, baseRevision: 2, prompt: 'blind spread' }),
    /unknown field/i,
  );
});

test('source-only gap, recipe dependency validation, and bounded schema', async (t) => {
  const { store } = await fixture(t);
  const gap = await store.save({
    ...base(''),
    source: { contentGap: 'Original prompt text was not available' },
    assets: [{ id: 'motion', missingReason: 'Embedded video did not play' }],
  });
  assert.equal(gap.prompt, '');
  assert.equal((await store.list())[0].promptAvailable, false);
  await assert.rejects(store.save(base('')), /contentGap/);
  await assert.rejects(
    store.save({
      ...base(),
      recipe: {
        stages: [{ id: 'one', role: 'Make asset', dependsOn: ['missing'] }],
      },
    }),
    /Unknown recipe dependency/,
  );
  await assert.rejects(
    store.save({
      ...base(),
      recipe: {
        stages: [
          { id: 'one', role: 'A', dependsOn: ['two'] },
          { id: 'two', role: 'B', dependsOn: ['one'] },
        ],
      },
    }),
    /cycle/,
  );
  await assert.rejects(store.query({ limit: 51 }), /limit/);
});

test('asset bytes are copied independently, verified, and symlinks refused', async (t) => {
  const { project, store } = await fixture(t);
  const image = join(project, 'sample.png');
  await writeFile(image, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const linked = join(project, 'linked.png');
  await symlink(image, linked);
  await assert.rejects(
    store.save({
      ...base(),
      assets: [{ id: 'visual', path: linked, contentType: 'image/png' }],
    }),
    /Symbolic link|ELOOP/i,
  );
  const saved = await store.save({
    ...base(),
    assets: [{ id: 'visual', path: image, contentType: 'image/png' }],
  });
  const personal = createPromptStore(join(project, 'personal'));
  const copied = await copyPrompt(store, personal, saved.id, saved.revision);
  assert.notEqual(copied.id, saved.id);
  assert.deepEqual(copied.copyOf, {
    id: saved.id,
    revision: 1,
    promptSha256: saved.promptSha256,
  });
  await rm(image);
  assert.deepEqual(
    (await personal.asset(copied.id, 1, 'visual')).bytes,
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  assert.deepEqual(await personal.runs(copied.id), []);
  await writeFile(
    join(
      project,
      'personal',
      copied.id,
      'revisions',
      '0001',
      'assets',
      'visual.png',
    ),
    'tampered',
  );
  await assert.rejects(personal.read(copied.id), /hash mismatch/);
});

test('run evidence is scoped to revision and active project recording', async (t) => {
  const { project, store } = await fixture(t);
  const saved = await store.save({
    ...base(),
    recipe: {
      stages: [
        { id: 'asset', role: 'Build asset' },
        { id: 'page', role: 'Assemble page', dependsOn: ['asset'] },
      ],
    },
  });
  const image = join(project, 'output.png');
  await writeFile(image, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const input = {
    stageId: 'asset',
    briefRevision: 'brief-1',
    planRevision: 'plan-1',
    inputs: [{ name: 'instruction', value: 'Make the image' }],
    tools: [{ name: 'renderer', version: '1', settings: 'size=small' }],
    artifacts: [{ id: 'image', path: image, contentType: 'image/png' }],
    execution: { status: 'succeeded', evidence: ['renderer completed'] },
    inspection: { status: 'inconclusive', evidence: ['motion unavailable'] },
    tester: { status: 'passed', by: 'agent-run', evidence: ['opened PNG'] },
    userReview: { status: 'not-reviewed' },
  };
  await assert.rejects(
    store.saveRun(saved.id, 1, input),
    /recording must be active/,
  );
  await savePromptSettings(project, { recording: 'active' });
  await assert.rejects(
    store.saveRun(saved.id, 1, {
      ...input,
      userReview: { status: 'positive' },
    }),
    /actual evidence/,
  );
  await assert.rejects(
    store.saveRun(saved.id, 1, { ...input, tester: { status: 'passed' } }),
    /provenance/,
  );
  const run = await store.saveRun(saved.id, 1, input);
  assert.equal(run.promptSha256, saved.promptSha256);
  assert.equal(run.artifacts[0].sha256.length, 64);
  assert.equal(
    (await store.runAsset(saved.id, 1, run.id, 'image')).bytes.length,
    8,
  );
  assert.equal((await store.runs(saved.id, 1)).length, 1);
  const next = await store.save({
    id: saved.id,
    baseRevision: 1,
    ...base('A new version'),
  });
  assert.deepEqual(await store.runs(saved.id, next.revision), []);
  await assert.rejects(
    store.saveRun(saved.id, 1, {
      ...input,
      stageId: 'page',
      dependencies: [
        { stageId: 'asset', runId: '00000000-0000-4000-8000-000000000000' },
      ],
    }),
    /Unknown run dependency/,
  );
  await rm(image);
  await savePromptSettings(project, { recording: 'stopped' });
  await assert.rejects(
    store.saveRun(saved.id, 1, input),
    /recording must be active/,
  );
  const personal = createPromptStore(join(project, 'personal'), {
    projectDirectory: project,
  });
  await assert.rejects(personal.saveRun(saved.id, 1, input), /project-local/);
});
