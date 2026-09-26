import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
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
const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

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

test('a leading U+FEFF survives save, historical read, and independent copy', async (t) => {
  const { project, store } = await fixture(t);
  const original = '\uFEFFhello\r\n世界';
  const first = await store.save(base(original));
  assert.equal(first.prompt, original);
  await store.save({ id: first.id, baseRevision: 1, ...base('later') });
  assert.equal((await store.read(first.id, 1)).prompt, original);
  const copied = await copyPrompt(
    store,
    createPromptStore(join(project, 'personal')),
    first.id,
    1,
  );
  assert.equal(copied.prompt, original);
  assert.equal(copied.promptSha256, first.promptSha256);
  assert.equal(copied.copyOf.promptSha256, first.promptSha256);
});

test('entry quota rejects a 1,001st publication and concurrent writers', async (t) => {
  const { directory, store } = await fixture(t);
  const first = await store.save(base('quota'));
  const sourceMeta = JSON.parse(
    await readFile(join(directory, first.id, 'revisions', '0001', 'meta.json')),
  );
  const sourcePrompt = join(
    directory,
    first.id,
    'revisions',
    '0001',
    'prompt.txt',
  );
  async function seed() {
    const id = randomUUID();
    const revision = join(directory, id, 'revisions', '0001');
    await mkdir(revision, { recursive: true });
    const meta = { ...sourceMeta, id };
    delete meta.metadataSha256;
    meta.metadataSha256 = digest(meta);
    await writeFile(join(revision, 'meta.json'), JSON.stringify(meta));
    await copyFile(sourcePrompt, join(revision, 'prompt.txt'));
  }
  for (let i = 0; i < 998; i++) await seed();
  assert.equal((await store.list()).length, 999);
  const outcomes = await Promise.allSettled([
    store.save(base('concurrent A')),
    createPromptStore(directory).save(base('concurrent B')),
  ]);
  assert.equal(
    outcomes.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal((await store.list()).length, 1000);
  await assert.rejects(store.save(base('over quota')), /1,000|quota|limit/i);
  assert.equal((await store.list()).length, 1000);
  assert.equal((await store.read(first.id)).prompt, 'quota');
});

test('run quota rejects a 1,001st publication and concurrent writers', async (t) => {
  const { project, directory, store } = await fixture(t);
  const prompt = await store.save(base('run quota'));
  await savePromptSettings(project, { recording: 'active' });
  const first = await store.saveRun(prompt.id, 1, {
    execution: { status: 'not-run' },
  });
  const runsDirectory = join(directory, prompt.id, 'runs', '0001');
  async function seed() {
    const id = randomUUID();
    const folder = join(runsDirectory, id);
    await mkdir(folder);
    const record = { ...first, id };
    delete record.recordSha256;
    record.recordSha256 = digest(record);
    await writeFile(join(folder, 'record.json'), JSON.stringify(record));
  }
  for (let i = 0; i < 998; i++) await seed();
  assert.equal((await store.runs(prompt.id, 1)).length, 999);
  const outcomes = await Promise.allSettled([
    store.saveRun(prompt.id, 1, { execution: { status: 'not-run' } }),
    createPromptStore(directory, { projectDirectory: project }).saveRun(
      prompt.id,
      1,
      { execution: { status: 'not-run' } },
    ),
  ]);
  assert.equal(
    outcomes.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal((await store.runs(prompt.id, 1)).length, 1000);
  await assert.rejects(
    store.saveRun(prompt.id, 1, { execution: { status: 'not-run' } }),
    /1,000|quota|limit/i,
  );
  assert.equal((await store.runs(prompt.id, 1)).length, 1000);
  assert.equal((await store.read(prompt.id)).prompt, 'run quota');
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
