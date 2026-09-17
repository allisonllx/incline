import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

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

export async function resolveOptions(args, cwd = process.cwd()) {
  const options = new Map();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (
      !['--project', '--input', '--library-dir', '--local-only'].includes(
        flag,
      ) ||
      options.has(flag)
    )
      throw new Error(
        `Unknown or repeated option: ${flag}. Use --help for usage.`,
      );
    if (flag === '--local-only') options.set(flag, true);
    else {
      const value = args[++index];
      if (!value || value.startsWith('--'))
        throw new Error(`Missing value for ${flag}.`);
      options.set(flag, resolve(cwd, value));
    }
  }
  if (options.has('--local-only') && options.has('--library-dir'))
    throw new Error('Choose --local-only or --library-dir, not both.');
  return {
    project: options.get('--project') ?? (await projectRoot(cwd)),
    libraryDirectory: options.has('--local-only')
      ? null
      : (options.get('--library-dir') ??
        join(homedir(), '.incline', 'library')),
    ...(options.has('--input') ? { input: options.get('--input') } : {}),
  };
}
