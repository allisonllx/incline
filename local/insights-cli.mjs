import { readFile, stat } from 'node:fs/promises';
import { resolveOptions } from './options.mjs';
import { saveInsight, readInsights, insightEvidence } from './insights.mjs';
try {
  const [command, ...args] = process.argv.slice(2);
  if (['--help', '-h'].includes(command))
    console.log(
      'Incline insights\n  insights.mjs save --input <insight.json> [--project <directory>]\n  insights.mjs read [--id <id>] [--aspect <topic>] [--project <directory>]\n  insights.mjs evidence --id <id> [--project <directory>]\nAgent-authored, project-local findings linked to original feedback. No automatic inference.',
    );
  else {
    if (!['save', 'read', 'evidence'].includes(command))
      throw new Error('Choose save, read or evidence');
    const filters = {};
    const optionsArgs = [];
    for (let i = 0; i < args.length; i++) {
      if (['--id', '--aspect'].includes(args[i])) {
        const key = args[i].slice(2);
        if (filters[key] || !args[i + 1] || args[i + 1].startsWith('--'))
          throw new Error('Invalid filter');
        filters[key] = args[++i];
      } else optionsArgs.push(args[i]);
    }
    if (optionsArgs.some((a) => ['--library-dir', '--local-only'].includes(a)))
      throw new Error('Insights are project-local');
    const options = await resolveOptions(optionsArgs);
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
      if (command === 'evidence') {
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
