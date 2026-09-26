import { writeFile, rename, unlink, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { safeBytes, safeDirectory } from './exploration-files.mjs';

const defaults = Object.freeze({
  version: 1,
  revision: null,
  personalLookup: false,
  personalDirectory: null,
  recording: 'off',
});
const editable = ['personalLookup', 'personalDirectory', 'recording'];
function validate(value, saved = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid prompt settings');
  const fields = saved
    ? [...editable, 'version', 'revision']
    : [...editable, 'expectedRevision'];
  if (Object.keys(value).some((key) => !fields.includes(key)))
    throw new Error('Unknown prompt settings field');
  if (
    saved &&
    (value.version !== 1 ||
      typeof value.revision !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(value.revision))
  )
    throw new Error('Invalid saved prompt settings revision');
  if ('personalLookup' in value && typeof value.personalLookup !== 'boolean')
    throw new Error('Invalid personal lookup setting');
  if (
    'personalDirectory' in value &&
    value.personalDirectory !== null &&
    (typeof value.personalDirectory !== 'string' ||
      value.personalDirectory.length > 4000 ||
      !isAbsolute(value.personalDirectory) ||
      value.personalDirectory.includes('\0'))
  )
    throw new Error('Personal prompt directory must be absolute');
  if (
    'recording' in value &&
    !['off', 'active', 'stopped'].includes(value.recording)
  )
    throw new Error('Invalid recording setting');
  if (saved && editable.some((key) => !(key in value)))
    throw new Error('Missing saved prompt settings field');
  if (saved && value.personalLookup && !value.personalDirectory)
    throw new Error('Personal lookup requires a selected directory');
}

export async function readPromptSettings(project) {
  const raw = await safeBytes(
    project,
    ['.incline', 'prompt-settings.json'],
    16000,
  );
  if (!raw) return { ...defaults };
  let data;
  try {
    data = JSON.parse(raw.bytes.toString('utf8'));
  } catch {
    throw new Error(
      'Cannot read prompt settings; preserve and repair the existing file',
    );
  }
  validate(data, true);
  return data;
}

export async function savePromptSettings(project, input) {
  validate(input);
  // Validate before creating storage, then re-read under an exclusive writer lock.
  const previous = await readPromptSettings(project);
  const merged = { ...previous, ...input };
  delete merged.expectedRevision;
  merged.revision = randomUUID();
  validate(merged, true);
  const directory = await safeDirectory(project, ['.incline'], true);
  const lockPath = join(directory, '.prompt-settings.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        'Prompt settings are being updated; retry after the current write finishes',
      );
    throw error;
  }
  const temp = join(directory, `.prompt-settings-${randomUUID()}.tmp`);
  try {
    const current = await readPromptSettings(project);
    if (
      current.revision !== previous.revision ||
      (Object.hasOwn(input, 'expectedRevision') &&
        input.expectedRevision !== current.revision)
    )
      throw new Error(
        'Prompt settings changed; read the current settings before updating',
      );
    if (merged.personalDirectory)
      merged.personalDirectory = resolve(merged.personalDirectory);
    await writeFile(temp, JSON.stringify(merged, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    await safeDirectory(project, ['.incline']);
    await rename(temp, join(directory, 'prompt-settings.json'));
    return merged;
  } finally {
    await unlink(temp).catch(() => {});
    await lock.close();
    await unlink(lockPath);
  }
}

export async function assertPromptRecording(project) {
  if (!project || (await readPromptSettings(project)).recording !== 'active')
    throw new Error(
      'Prompt recording must be active for new run or decision evidence',
    );
}
