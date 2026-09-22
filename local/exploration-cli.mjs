import { dirname, basename } from 'node:path';
import { resolveOptions } from './options.mjs';
import { safeBytes } from './exploration-files.mjs';
import { explorationView } from './exploration-model.mjs';
import {
  saveExploration,
  readExploration,
  listExplorations,
  explorationEvidence,
} from './exploration-store.mjs';

const help = `Incline exploration
  exploration.mjs save --input <checkpoint.json> [--project <directory>]
  exploration.mjs list [--project <directory>]
  exploration.mjs read --id <study> [--revision <number>] [--project <directory>]
  exploration.mjs view --id <study> [--node <hypothesis>] [--limit <1-50>] [--project <directory>]
  exploration.mjs evidence --id <study> --node <hypothesis> [--project <directory>]
Project-local, agent-authored exploration checkpoints. Read operations create no files.
All hypotheses remain interpretations. No automatic recording, selection, or promotion.
--local-only is accepted; personal/library operations are not supported.`;

try {
  const [command, ...args] = process.argv.slice(2);
  if (['--help', '-h'].includes(command) && !args.length) console.log(help);
  else {
    const allowed = {
      save: [],
      list: [],
      read: ['id', 'revision'],
      view: ['id', 'node', 'limit'],
      evidence: ['id', 'node'],
    };
    if (!Object.hasOwn(allowed, command))
      throw new Error('Choose save, list, read, view, or evidence');
    const filters = {},
      optionArgs = [];
    for (let i = 0; i < args.length; i++) {
      const flag = args[i];
      if (['--library-dir', '--personal-dir'].includes(flag))
        throw new Error(
          'Exploration is project-local; shared directories are unsupported',
        );
      if (['--id', '--node', '--revision', '--limit'].includes(flag)) {
        const key = flag.slice(2);
        if (
          Object.hasOwn(filters, key) ||
          !allowed[command].includes(key) ||
          !args[i + 1] ||
          args[i + 1].startsWith('--')
        )
          throw new Error(`Invalid or unsupported filter: ${flag}`);
        filters[key] = args[++i];
      } else if (['--project', '--input'].includes(flag)) {
        if (flag === '--input' && command !== 'save')
          throw new Error('Only save accepts --input');
        if (!args[i + 1] || args[i + 1].startsWith('--'))
          throw new Error(`Missing value for ${flag}`);
        optionArgs.push(flag, args[++i]);
      } else if (flag === '--local-only') optionArgs.push(flag);
      else throw new Error(`Unknown option: ${flag}`);
    }
    const options = await resolveOptions(optionArgs);
    for (const key of ['revision', 'limit'])
      if (filters[key] !== undefined) {
        if (
          !/^[1-9][0-9]*$/.test(filters[key]) ||
          !Number.isSafeInteger(Number(filters[key]))
        )
          throw new Error(`Invalid ${key}`);
        filters[key] = Number(filters[key]);
      }
    if (filters.limit > 50) throw new Error('limit must be from 1 to 50');
    if (['read', 'view', 'evidence'].includes(command) && !filters.id)
      throw new Error(`${command} requires --id`);
    if (command === 'evidence' && !filters.node)
      throw new Error('evidence requires --node');
    let result;
    if (command === 'save') {
      if (!options.input) throw new Error('save requires --input');
      const loaded = await safeBytes(dirname(options.input), [
        basename(options.input),
      ]);
      if (!loaded) throw new Error('Input file not found');
      result = await saveExploration(
        options.project,
        JSON.parse(loaded.bytes.toString('utf8')),
      );
    } else if (command === 'list')
      result = await listExplorations(options.project);
    else if (command === 'evidence')
      result = await explorationEvidence(options.project, {
        id: filters.id,
        nodeId: filters.node,
      });
    else {
      const snapshot = await readExploration(options.project, {
        id: filters.id,
        ...(filters.revision ? { revision: filters.revision } : {}),
      });
      result =
        command === 'read' || snapshot === null
          ? snapshot
          : explorationView(snapshot, {
              ...(filters.node ? { nodeId: filters.node } : {}),
              ...(filters.limit ? { limit: filters.limit } : {}),
            });
    }
    console.log(JSON.stringify(result));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
