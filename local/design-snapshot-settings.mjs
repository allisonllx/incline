import { open, writeFile, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { safeBytes, safeDirectory } from './exploration-files.mjs';
import { fields } from './design-snapshot-model.mjs';
import { captureDesign, publishDesign } from './design-snapshots.mjs';
import { assertPromptRecording } from './prompt-settings.mjs';

const defaults = {
  version: 1,
  revision: null,
  personalAutoSave: false,
  personalDirectory: null,
};
function validate(value, saved = false) {
  fields(
    value,
    saved
      ? ['version', 'revision', 'personalAutoSave', 'personalDirectory']
      : ['expectedRevision', 'personalAutoSave', 'personalDirectory'],
  );
  if (
    saved &&
    (value.version !== 1 ||
      typeof value.revision !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(value.revision))
  )
    throw new Error('Invalid design settings revision');
  if (
    (saved || 'personalAutoSave' in value) &&
    typeof value.personalAutoSave !== 'boolean'
  )
    throw new Error('Invalid personal auto-save setting');
  if (
    (saved || 'personalDirectory' in value) &&
    value.personalDirectory !== null &&
    (typeof value.personalDirectory !== 'string' ||
      !isAbsolute(value.personalDirectory) ||
      value.personalDirectory.includes('\0') ||
      value.personalDirectory.length > 4000)
  )
    throw new Error('Select an absolute personal design library directory');
  if (saved && value.personalAutoSave && !value.personalDirectory)
    throw new Error('Automatic personal saves require a selected library');
}
export async function readDesignSettings(project) {
  const file = await safeBytes(
    project,
    ['.incline', 'design-snapshot-settings.json'],
    16000,
  );
  if (!file) return { ...defaults };
  const settings = JSON.parse(file.bytes.toString('utf8'));
  validate(settings, true);
  return settings;
}
export async function saveDesignSettings(
  project,
  input,
  { localOnly = false } = {},
) {
  validate(input);
  if (localOnly && (input.personalAutoSave === true || input.personalDirectory))
    throw new Error('--local-only forbids enabling personal saves');
  const previous = await readDesignSettings(project);
  const settings = { ...previous, ...input, revision: randomUUID() };
  delete settings.expectedRevision;
  if (settings.personalDirectory)
    settings.personalDirectory = resolve(settings.personalDirectory);
  validate(settings, true);
  const directory = await safeDirectory(project, ['.incline'], true);
  const lockPath = join(directory, '.design-settings.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  const temporary = join(directory, `.design-settings-${randomUUID()}.tmp`);
  try {
    const current = await readDesignSettings(project);
    if (
      current.revision !== previous.revision ||
      (Object.hasOwn(input, 'expectedRevision') &&
        input.expectedRevision !== current.revision)
    )
      throw new Error(
        'Design settings changed; read the latest revision before updating',
      );
    await writeFile(temporary, JSON.stringify(settings, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    await safeDirectory(project, ['.incline']);
    await rename(temporary, join(directory, 'design-snapshot-settings.json'));
    return settings;
  } finally {
    await unlink(temporary).catch(() => {});
    await lock.close();
    await unlink(lockPath);
  }
}

export async function captureConfiguredDesign(project, input, options = {}) {
  const settings = options.automatic ? await readDesignSettings(project) : null;
  const result = await captureDesign(project, input, options);
  if (!settings?.personalAutoSave)
    return { ...result, personalSave: { status: 'not-enabled' } };
  if (options.localOnly)
    return {
      ...result,
      personalSave: { status: 'skipped', reason: 'local-only' },
    };
  if (
    options.library &&
    resolve(options.library) !== settings.personalDirectory
  )
    return {
      ...result,
      personalSave: {
        status: 'skipped',
        reason:
          'Selected library differs from the opted-in directory; renew the setting to enable it.',
      },
    };
  const beforePublish = async () => {
    const current = await readDesignSettings(project);
    if (current.revision !== settings.revision)
      throw Object.assign(
        new Error(
          'Settings changed during capture; retry with current consent.',
        ),
        { code: 'DESIGN_CONSENT_CHANGED' },
      );
    await assertPromptRecording(project);
  };
  try {
    await beforePublish();
    return {
      ...result,
      personalSave: await publishDesign(
        project,
        input.id,
        settings.personalDirectory,
        { beforePublish },
      ),
    };
  } catch (error) {
    if (error.code === 'DESIGN_CONSENT_CHANGED')
      return {
        ...result,
        personalSave: { status: 'skipped', reason: error.message },
      };
    return {
      ...result,
      personalSave: { status: 'failed', error: error.message },
    };
  }
}
