import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { resolveOptions } from './options.mjs';

test('launching inside a repository finds its root; overrides and non-Git projects work', async (t) => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'incline-options-')),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  const nested = join(repo, 'src', 'components');
  const other = join(root, 'other');
  await mkdir(nested, { recursive: true });
  await mkdir(other);
  await mkdir(join(repo, '.git'));
  const detected = await resolveOptions([], nested);
  assert.equal(detected.project, repo);
  assert.equal(
    detected.libraryDirectory,
    join(homedir(), '.incline', 'library'),
  );
  assert.equal(
    detected.promptLibraryDirectory,
    join(homedir(), '.incline', 'prompt-library'),
  );
  assert.equal((await resolveOptions([], other)).project, other);
  assert.equal(
    (await resolveOptions(['--project', '../../../other'], nested)).project,
    other,
  );
  await rm(join(repo, '.git'), { recursive: true });
  await writeFile(join(repo, '.git'), 'gitdir: /unused/worktree-marker');
  assert.equal((await resolveOptions([], nested)).project, repo);
});

test('library scope is independent of project location and invalid options fail before launch', async () => {
  const cwd = process.cwd();
  assert.equal(
    (await resolveOptions(['--local-only'], cwd)).libraryDirectory,
    null,
  );
  assert.equal(
    (await resolveOptions(['--local-only'], cwd)).promptLibraryDirectory,
    null,
  );
  assert.equal(
    (await resolveOptions(['--prompt-library-dir', './prompts'], cwd))
      .promptLibraryDirectory,
    join(cwd, 'prompts'),
  );
  assert.equal(
    (await resolveOptions(['--library-dir', './shared'], cwd)).libraryDirectory,
    join(cwd, 'shared'),
  );
  assert.equal(
    (await resolveOptions(['--input', './collection.json'], cwd)).input,
    join(cwd, 'collection.json'),
  );
  for (const args of [
    ['--project'],
    ['--unknown'],
    ['--local-only', '--library-dir', 'shared'],
    ['--local-only', '--prompt-library-dir', 'shared'],
    ['--project', '.', '--project', '..'],
  ]) {
    await assert.rejects(resolveOptions(args, cwd));
  }
});

test('personal directory is independent and local-only disables both shared stores', async () => {
  const cwd = process.cwd(),
    defaults = await resolveOptions([], cwd);
  assert.equal(
    defaults.personalDirectory,
    join(homedir(), '.incline', 'personal-insights'),
  );
  const alternate = await resolveOptions(
    ['--personal-dir', './personal', '--library-dir', './references'],
    cwd,
  );
  assert.equal(alternate.personalDirectory, join(cwd, 'personal'));
  assert.equal(alternate.libraryDirectory, join(cwd, 'references'));
  const local = await resolveOptions(['--local-only'], cwd);
  assert.equal(local.personalDirectory, null);
  assert.equal(local.libraryDirectory, null);
  await assert.rejects(
    resolveOptions(['--local-only', '--personal-dir', './personal'], cwd),
  );
});
