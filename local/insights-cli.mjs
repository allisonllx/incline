import { readFile, stat } from 'node:fs/promises';
import {
  previewPersonalInsight,
  savePersonalInsight,
  listPersonalInsights,
  importPersonalInsight,
} from './personal-insights.mjs';
import { resolveOptions } from './options.mjs';
import { saveInsight, readInsights, insightEvidence } from './insights.mjs';
import { listPendingEvidence, saveReview } from './reviews.mjs';
import { rebuildKnowledge, queryKnowledge } from './knowledge.mjs';
try {
  const [command, ...args] = process.argv.slice(2);
  if (['--help', '-h'].includes(command))
    console.log(
      'Incline insights\n  insights.mjs pending [--project <directory>]\n  insights.mjs review --input <receipt.json> [--project <directory>]\n  insights.mjs save --input <insight.json> [--project <directory>]\n  insights.mjs read [--id <id>] [--aspect <topic>] [--project <directory>]\n  insights.mjs evidence --id <id> [--project <directory>]\n  insights.mjs rebuild [--project <directory>]\n  insights.mjs query [--query <text>] [--aspect <topic>] [--scope <exact scope>] [--limit <1-20>] [--project <directory>]\n  insights.mjs personal-preview --input <selection.json> [--personal-dir <directory>]\n  insights.mjs personal-save --input <selection.json> [--personal-dir <directory>]\n  insights.mjs personal-list [--personal-dir <directory>]\n  insights.mjs personal-import --id <id> --relevance <brief relevance> [--revision <number>] [--project <directory>] [--personal-dir <directory>]\nPersonal operations are explicit; --local-only disables them. Personal imports are tentative drafts.\nAgent-authored, project-local findings linked to original feedback. Rebuild creates derived topic views; query is read-only and reports freshness. No automatic inference.',
    );
  else {
    if (
      ![
        'save',
        'read',
        'evidence',
        'rebuild',
        'query',
        'pending',
        'review',
        'personal-preview',
        'personal-save',
        'personal-list',
        'personal-import',
      ].includes(command)
    )
      throw new Error(
        'Choose save, read, evidence, rebuild, query, pending or review',
      );
    const filters = {};
    const optionsArgs = [];
    for (let i = 0; i < args.length; i++) {
      if (
        [
          '--id',
          '--aspect',
          '--query',
          '--scope',
          '--limit',
          '--revision',
          '--relevance',
        ].includes(args[i])
      ) {
        const key = args[i].slice(2);
        if (filters[key] || !args[i + 1] || args[i + 1].startsWith('--'))
          throw new Error('Invalid filter');
        filters[key] = args[++i];
      } else optionsArgs.push(args[i]);
    }
    if (optionsArgs.includes('--library-dir'))
      throw new Error(
        'Personal insights use --personal-dir, independently of the reference library',
      );
    if (
      !command.startsWith('personal-') &&
      optionsArgs.includes('--personal-dir')
    )
      throw new Error('Use --personal-dir only with personal operations');
    const options = await resolveOptions(optionsArgs);
    const allowedFilters = {
      'personal-preview': [],
      'personal-save': [],
      'personal-list': [],
      'personal-import': ['id', 'revision', 'relevance'],
      save: [],
      pending: [],
      review: [],
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
    if (command.startsWith('personal-') && !options.personalDirectory)
      throw new Error('Personal operations are disabled by --local-only');
    if (['personal-preview', 'personal-save'].includes(command)) {
      if (!options.input)
        throw new Error('Personal preview/save requires --input');
      const info = await stat(options.input);
      if (!info.isFile() || info.size > 1_000_000)
        throw new Error('Invalid input file');
      const selection = JSON.parse(await readFile(options.input, 'utf8'));
      result = await (
        command === 'personal-preview'
          ? previewPersonalInsight
          : savePersonalInsight
      )(options.personalDirectory, selection);
    } else if (command === 'personal-list') {
      if (options.input) throw new Error('Personal list does not accept input');
      result = await listPersonalInsights(options.personalDirectory);
    } else if (command === 'personal-import') {
      if (options.input || !filters.id || !filters.relevance)
        throw new Error('Personal import requires --id and --relevance');
      if (
        filters.revision !== undefined &&
        !/^[1-9][0-9]*$/.test(filters.revision)
      )
        throw new Error('Invalid revision');
      result = await importPersonalInsight(
        options.personalDirectory,
        filters.id,
        options.project,
        {
          relevance: filters.relevance,
          ...(filters.revision ? { revision: Number(filters.revision) } : {}),
        },
      );
    } else if (command === 'save' || command === 'review') {
      if (!options.input || Object.keys(filters).length)
        throw new Error(`${command} requires input and no filters`);
      const info = await stat(options.input);
      if (!info.isFile() || info.size > 1_000_000)
        throw new Error('Invalid input file');
      result = await (command === 'review' ? saveReview : saveInsight)(
        options.project,
        JSON.parse(await readFile(options.input, 'utf8')),
      );
    } else {
      if (options.input) throw new Error('Only save and review accept input');
      if (command === 'pending')
        result = await listPendingEvidence(options.project);
      else if (command === 'rebuild')
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
