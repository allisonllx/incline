import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  rm,
  readdir,
  mkdir,
  symlink,
  writeFile,
  readFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readPromptSettings,
  savePromptSettings,
  assertPromptRecording,
} from './prompt-settings.mjs';

async function project(t) {
  const root = await mkdtemp(join(tmpdir(), 'incline-prompt-settings-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test('settings reads are lazy and recording requires an active scope', async (t) => {
  const root = await project(t);
  assert.equal((await readPromptSettings(root)).recording, 'off');
  await assert.rejects(assertPromptRecording(root), /recording.*active/i);
  assert.deepEqual(await readdir(root), []);
  const first = await savePromptSettings(root, { recording: 'active' });
  await assertPromptRecording(root);
  const second = await savePromptSettings(root, {
    recording: 'stopped',
    expectedRevision: first.revision,
  });
  assert.notEqual(first.revision, second.revision);
  await assert.rejects(assertPromptRecording(root), /recording.*active/i);
  await assert.rejects(
    savePromptSettings(root, {
      recording: 'active',
      expectedRevision: first.revision,
    }),
    /changed/i,
  );
  assert.equal((await readPromptSettings(root)).recording, 'stopped');
});
test('lookup consent is explicit, scoped, and preserves recording settings', async (t) => {
  const root = await project(t);
  await assert.rejects(
    savePromptSettings(root, { personalLookup: true }),
    /directory/i,
  );
  const directory = join(root, 'personal');
  await savePromptSettings(root, {
    personalLookup: true,
    personalDirectory: directory,
  });
  const saved = await savePromptSettings(root, { recording: 'active' });
  assert.equal(saved.personalDirectory, directory);
  assert.equal(saved.personalLookup, true);
  assert.equal((await readPromptSettings(root)).recording, 'active');
  assert.deepEqual((await readdir(root)).sort(), ['.incline']);
  await assert.rejects(
    savePromptSettings(root, { externalCalls: true }),
    /unknown/i,
  );
});
test('settings refuse corrupt files and symlink storage without touching targets', async (t) => {
  const root = await project(t);
  const outside = await project(t);
  await symlink(outside, join(root, '.incline'));
  await assert.rejects(readPromptSettings(root), /symlink/i);
  await assert.rejects(
    savePromptSettings(root, { recording: 'active' }),
    /symlink/i,
  );
  assert.deepEqual(await readdir(outside), []);
  await rm(join(root, '.incline'));
  await mkdir(join(root, '.incline'));
  await writeFile(join(root, '.incline', 'prompt-settings.json'), 'broken');
  await assert.rejects(
    savePromptSettings(root, { recording: 'active' }),
    /settings/i,
  );
  assert.equal(
    await readFile(join(root, '.incline', 'prompt-settings.json'), 'utf8'),
    'broken',
  );
});
