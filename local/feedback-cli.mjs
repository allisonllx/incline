import { readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolveOptions } from './options.mjs';
import { readFeedback, recordFeedback } from './feedback.mjs';

try {
  const [command, ...args] = process.argv.slice(2);
  if (['--help', '-h'].includes(command)) {
    console.log(
      'Incline feedback journal\n  feedback.mjs record --input <batch.json> [--project <directory>]\n  feedback.mjs read [--project <directory>]\nRecords project-local evidence; never scans conversations or updates preferences automatically.',
    );
  } else {
    if (!['record', 'read'].includes(command))
      throw new Error('Choose record or read; use --help for usage.');
    if (args.some((arg) => ['--library-dir', '--local-only'].includes(arg)))
      throw new Error('Feedback is always project-local.');
    const options = await resolveOptions(args);
    let result;
    if (command === 'record') {
      if (!options.input) throw new Error('record requires --input');
      if ((await stat(options.input)).size > 1024 * 1024)
        throw new Error('Input exceeds 1 MB');
      const input = JSON.parse(await readFile(options.input, 'utf8'));
      result = await recordFeedback(
        options.project,
        input,
        dirname(options.input),
      );
    } else {
      if (options.input) throw new Error('read does not accept --input');
      result = await readFeedback(options.project);
    }
    console.log(JSON.stringify(result));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
