import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOptions } from './options.mjs';
import {
  readDesignInput,
  readDesign,
  queryDesigns,
  publishDesign,
  importDesign,
} from './design-snapshots.mjs';
import {
  readDesignSettings,
  saveDesignSettings,
  captureConfiguredDesign,
} from './design-snapshot-settings.mjs';

const usage = `Incline design snapshots
  capture --input FILE [--automatic] [--project DIR] [--local-only]
  read --id ID [--scope project|personal|imported]
  query [--text TEXT] [--tag TAG] [--limit 1..50] [--scope project|personal|imported]
  publish --id ID [--personal-dir DIR]
  import --id ID --relevance TEXT [--personal-dir DIR]
  settings [--input FILE]
All commands accept --project DIR and --local-only. Personal commands and capture
accept --personal-dir DIR; default personal store is ~/.incline/design-library.
Capture JSON names selected files relative to the input file. Automatic capture
requires active prompt recording and a reaction-linked satisfaction assessment.
Personal publication requires an explicit command or project opt-in.
`;
const common = ['--project', '--local-only'];
const allowed = {
  capture: [...common, '--input', '--automatic', '--personal-dir'],
  read: [...common, '--id', '--scope', '--personal-dir'],
  query: [...common, '--text', '--tag', '--limit', '--scope', '--personal-dir'],
  publish: [...common, '--id', '--personal-dir'],
  import: [...common, '--id', '--relevance', '--personal-dir'],
  settings: [...common, '--input'],
};
export async function executeDesignCli(args, { cwd = process.cwd() } = {}) {
  if (args.length === 1 && args[0] === '--help') return usage;
  const [command, ...rest] = args;
  if (!allowed[command])
    throw new Error('Choose a design snapshot command; use --help');
  const flags = new Map();
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    if (!allowed[command].includes(flag) || flags.has(flag))
      throw new Error(`Unknown or repeated option ${flag}`);
    if (['--automatic', '--local-only'].includes(flag)) {
      flags.set(flag, true);
      continue;
    }
    const value = rest[++index];
    if (!value || value.startsWith('--'))
      throw new Error(`Missing value for ${flag}`);
    flags.set(flag, value);
  }
  for (const flag of {
    capture: ['--input'],
    read: ['--id'],
    publish: ['--id'],
    import: ['--id', '--relevance'],
  }[command] ?? [])
    if (!flags.has(flag)) throw new Error(`${command} requires ${flag}`);
  const scope = flags.get('--scope') ?? 'project';
  if (!['project', 'personal', 'imported'].includes(scope))
    throw new Error('Invalid snapshot scope');
  const localOnly = flags.has('--local-only');
  if (
    localOnly &&
    (flags.has('--personal-dir') ||
      scope === 'personal' ||
      ['publish', 'import'].includes(command))
  )
    throw new Error('--local-only forbids personal library access');
  if (
    flags.has('--limit') &&
    (!/^[1-9]\d*$/.test(flags.get('--limit')) ||
      Number(flags.get('--limit')) > 50)
  )
    throw new Error('Limit must be 1–50');
  const { project } = await resolveOptions(
    flags.has('--project') ? ['--project', flags.get('--project')] : [],
    cwd,
  );
  const id = flags.get('--id');
  const selectedLibrary = async () =>
    flags.has('--personal-dir')
      ? resolve(cwd, flags.get('--personal-dir'))
      : ((await readDesignSettings(project)).personalDirectory ??
        join(homedir(), '.incline', 'design-library'));
  if (command === 'settings') {
    if (!flags.has('--input')) return readDesignSettings(project);
    const { input } = await readDesignInput(resolve(cwd, flags.get('--input')));
    return saveDesignSettings(project, input, { localOnly });
  }
  if (command === 'capture') {
    const { input, directory } = await readDesignInput(
      resolve(cwd, flags.get('--input')),
    );
    return captureConfiguredDesign(project, input, {
      inputDirectory: directory,
      automatic: flags.has('--automatic'),
      localOnly,
      ...(flags.has('--personal-dir')
        ? { library: resolve(cwd, flags.get('--personal-dir')) }
        : {}),
    });
  }
  if (command === 'publish')
    return publishDesign(project, id, await selectedLibrary(), { localOnly });
  if (command === 'import')
    return importDesign(
      project,
      id,
      await selectedLibrary(),
      flags.get('--relevance'),
      { localOnly },
    );
  const options = {
    scope,
    localOnly,
    ...(scope === 'personal' ? { library: await selectedLibrary() } : {}),
  };
  if (command === 'read') return readDesign(project, id, options);
  return queryDesigns(project, {
    ...options,
    text: flags.get('--text') ?? '',
    ...(flags.has('--tag') ? { tag: flags.get('--tag') } : {}),
    limit: Number(flags.get('--limit') ?? 10),
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await executeDesignCli(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    if (result?.personalSave?.status === 'failed') process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
