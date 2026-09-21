import { readFile, stat } from 'node:fs/promises';
import { resolveOptions } from './options.mjs';
import { saveInsight, readInsights, insightEvidence } from './insights.mjs';
import { rebuildKnowledge, queryKnowledge } from './knowledge.mjs';
try {
  const [command, ...args] = process.argv.slice(2);
  if (['--help', '-h'].includes(command))
    console.log(
      'Incline insights\n  insights.mjs save --input <insight.json> [--project <directory>]\n  insights.mjs read [--id <id>] [--aspect <topic>] [--project <directory>]\n  insights.mjs evidence --id <id> [--project <directory>]\n  insights.mjs rebuild [--project <directory>]\n  insights.mjs query [--query <text>] [--aspect <topic>] [--scope <exact scope>] [--limit <1-20>] [--project <directory>]\nAgent-authored, project-local findings linked to original feedback. Rebuild creates derived topic views; query is read-only and reports freshness. No automatic inference.',
    );
  else {
    if (!['save', 'read', 'evidence', 'rebuild', 'query'].includes(command))
      throw new Error('Choose save, read, evidence, rebuild or query');
    const filters = {};
    const optionsArgs = [];
    for (let i = 0; i < args.length; i++) {
      if (
        ['--id', '--aspect', '--query', '--scope', '--limit'].includes(args[i])
      ) {
        const key = args[i].slice(2);
        if (filters[key] || !args[i + 1] || args[i + 1].startsWith('--'))
          throw new Error('Invalid filter');
        filters[key] = args[++i];
      } else optionsArgs.push(args[i]);
    }
    if (optionsArgs.some((a) => ['--library-dir', '--local-only'].includes(a)))
      throw new Error('Insights are project-local');
    const options = await resolveOptions(optionsArgs);
    const allowedFilters = {
      save: [],
      read: ['id', 'aspect'],
      evidence: ['id'],
      rebuild: [],
      query: ['query', 'aspect', 'scope', 'limit'],
    };
    if (
      Object.keys(filters).some((key) => !allowedFilters[command].includes(key))
    )
      throw new Error(`Unsupported filter for ${command}`);
    if (filters.limit !== undefined) {
      if (!/^(?:[1-9]|1[0-9]|20)$/.test(filters.limit))
        throw new Error('limit must be an integer from 1 to 20');
      filters.limit = Number(filters.limit);
    }
    let result;
    if (command === 'save') {
      if (!options.input || Object.keys(filters).length)
        throw new Error('save requires input and no filters');
      const info = await stat(options.input);
      if (!info.isFile() || info.size > 1_000_000)
        throw new Error('Invalid input file');
      result = await saveInsight(
        options.project,
        JSON.parse(await readFile(options.input, 'utf8')),
      );
    } else {
      if (options.input) throw new Error('Only save accepts input');
      if (command === 'rebuild')
        result = await rebuildKnowledge(options.project);
      else if (command === 'query')
        result = await queryKnowledge(options.project, filters);
      else if (command === 'evidence') {
        if (!filters.id || filters.aspect)
          throw new Error('evidence requires only --id');
        result = await insightEvidence(options.project, filters.id);
      } else result = await readInsights(options.project, filters);
    }
    console.log(JSON.stringify(result));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
