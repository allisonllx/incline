import { lstat, open, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPromptStore, copyPrompt } from './prompts.mjs';
import { readPromptSettings, savePromptSettings } from './prompt-settings.mjs';

const usage = `Incline prompt hub (local files only)
  save --input FILE [--project DIR] [--scope local|personal] [--personal-dir DIR]
  read --id ID [--revision N] [--project DIR] [--scope local|personal]
  list [--project DIR] [--scope local|personal]
  query [--text TEXT] [--tag FACET:VALUE[:PROVENANCE]] [--limit 1..50] [--scope local|personal]
  copy --id ID --from local|personal --to local|personal [--revision N]
  run --id ID --revision N --input FILE [--project DIR]
  runs --id ID [--revision N] [--project DIR]
  settings --input FILE [--project DIR]
Global: --local-only forbids personal scope and --personal-dir; --personal-dir selects a directory.
Inputs are JSON. Asset paths in a save file are resolved relative to that file.
`;
const commands = {
  save: ['--input', '--project', '--scope', '--personal-dir', '--local-only'],
  read: [
    '--id',
    '--revision',
    '--project',
    '--scope',
    '--personal-dir',
    '--local-only',
  ],
  list: ['--project', '--scope', '--personal-dir', '--local-only'],
  query: [
    '--text',
    '--tag',
    '--limit',
    '--project',
    '--scope',
    '--personal-dir',
    '--local-only',
  ],
  copy: [
    '--id',
    '--revision',
    '--from',
    '--to',
    '--project',
    '--personal-dir',
    '--local-only',
  ],
  run: ['--id', '--revision', '--input', '--project', '--local-only'],
  runs: ['--id', '--revision', '--project', '--local-only'],
  settings: ['--input', '--project', '--local-only'],
};
function parse(args) {
  if (args.length === 0 || args.includes('--help')) {
    if (args.length > 1 || (args.length === 1 && args[0] !== '--help'))
      throw new Error('Use --help by itself');
    return { help: true };
  }
  const [command, ...rest] = args;
  const allowed = commands[command];
  if (!allowed) throw new Error(`Unknown command ${command}. Use --help.`);
  const options = new Map();
  const tags = [];
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    if (!allowed.includes(flag))
      throw new Error(`Unknown option ${flag} for ${command}`);
    if (flag === '--local-only') {
      if (options.has(flag)) throw new Error(`Repeated option ${flag}`);
      options.set(flag, true);
      continue;
    }
    const value = rest[++index];
    if (!value || value.startsWith('--'))
      throw new Error(`Missing value for ${flag}`);
    if (flag === '--tag') tags.push(value);
    else {
      if (options.has(flag)) throw new Error(`Repeated option ${flag}`);
      options.set(flag, value);
    }
  }
  const required =
    {
      save: ['--input'],
      read: ['--id'],
      copy: ['--id', '--from', '--to'],
      run: ['--id', '--revision', '--input'],
      runs: ['--id'],
      settings: ['--input'],
    }[command] ?? [];
  for (const flag of required)
    if (!options.has(flag)) throw new Error(`${command} requires ${flag}`);
  for (const flag of ['--scope', '--from', '--to'])
    if (options.has(flag) && !['local', 'personal'].includes(options.get(flag)))
      throw new Error(`${flag} must be local or personal`);
  if (
    options.has('--local-only') &&
    (options.has('--personal-dir') ||
      ['--scope', '--from', '--to'].some(
        (flag) => options.get(flag) === 'personal',
      ))
  )
    throw new Error('--local-only forbids personal library access');
  if (
    options.has('--revision') &&
    !/^[1-9]\d*$/.test(options.get('--revision'))
  )
    throw new Error('--revision must be a positive integer');
  if (
    options.has('--limit') &&
    (!/^[1-9]\d*$/.test(options.get('--limit')) ||
      Number(options.get('--limit')) > 50)
  )
    throw new Error('--limit must be 1–50');
  return { command, options, tags };
}
async function projectRoot(cwd) {
  const start = await realpath(cwd);
  let current = start;
  while (true) {
    try {
      const marker = await stat(join(current, '.git'));
      if (marker.isDirectory() || marker.isFile()) return current;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}
async function inputJson(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1_000_000)
    throw new Error('Input must be a regular JSON file under 1 MB');
  const handle = await open(path, 'r');
  try {
    const bytes = await handle.readFile();
    if (bytes.length > 1_000_000) throw new Error('Input exceeds 1 MB');
    return JSON.parse(bytes.toString('utf8'));
  } finally {
    await handle.close();
  }
}
function tagOption(value) {
  const [facet, label, provenance, extra] = value.split(':');
  if (!facet || !label || extra !== undefined)
    throw new Error('--tag requires FACET:VALUE[:PROVENANCE]');
  return {
    facet,
    value: label,
    ...(provenance === undefined ? {} : { provenance }),
  };
}

export async function executePromptCli(args, { cwd = process.cwd() } = {}) {
  const parsed = parse(args);
  if (parsed.help) return usage;
  const { command, options, tags } = parsed;
  const project = options.has('--project')
    ? resolve(cwd, options.get('--project'))
    : await projectRoot(cwd);
  const local = createPromptStore(join(project, '.incline', 'prompts'), {
    projectDirectory: project,
  });
  let personal;
  async function selectedPersonal() {
    if (options.has('--local-only'))
      throw new Error('--local-only forbids personal library access');
    if (personal) return personal;
    const configured = await readPromptSettings(project);
    const selected = options.has('--personal-dir')
      ? resolve(cwd, options.get('--personal-dir'))
      : (configured.personalDirectory ??
        join(homedir(), '.incline', 'prompt-library'));
    if (!isAbsolute(selected))
      throw new Error('Personal prompt directory must be absolute');
    personal = createPromptStore(selected);
    return personal;
  }
  async function scope(which) {
    return which === 'personal' ? selectedPersonal() : local;
  }
  const current = () => scope(options.get('--scope') ?? 'local');
  const id = options.get('--id');
  const revision = options.has('--revision')
    ? Number(options.get('--revision'))
    : undefined;
  if (command === 'settings') {
    const input = await inputJson(resolve(cwd, options.get('--input')));
    return savePromptSettings(project, input);
  }
  if (command === 'save') {
    const path = resolve(cwd, options.get('--input'));
    const input = await inputJson(path);
    if (input && Array.isArray(input.assets))
      input.assets = input.assets.map((asset) =>
        asset?.path && typeof asset.path === 'string'
          ? { ...asset, path: resolve(dirname(path), asset.path) }
          : asset,
      );
    return (await current()).save(input);
  }
  if (command === 'read') return (await current()).read(id, revision);
  if (command === 'list') return (await current()).list();
  if (command === 'query')
    return (await current()).query({
      ...(options.has('--text') ? { text: options.get('--text') } : {}),
      tags: tags.map(tagOption),
      ...(options.has('--limit')
        ? { limit: Number(options.get('--limit')) }
        : {}),
    });
  if (command === 'copy')
    return copyPrompt(
      await scope(options.get('--from')),
      await scope(options.get('--to')),
      id,
      revision,
    );
  if (command === 'run') {
    const path = resolve(cwd, options.get('--input'));
    const input = await inputJson(path);
    if (input && Array.isArray(input.artifacts))
      input.artifacts = input.artifacts.map((artifact) =>
        artifact?.path && typeof artifact.path === 'string'
          ? { ...artifact, path: resolve(dirname(path), artifact.path) }
          : artifact,
      );
    return local.saveRun(id, revision, input);
  }
  if (command === 'runs') return local.runs(id, revision);
  throw new Error('Unsupported command');
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      JSON.stringify(await executePromptCli(process.argv.slice(2)), null, 2),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
