import { dirname, basename, resolve } from 'node:path';
import { resolveOptions } from './options.mjs';
import { safeBytes } from './exploration-files.mjs';
import {
  previewPromptSelection,
  selectPrompt,
  validatePromptSelection,
} from './prompt-routing.mjs';

const help = `Incline prompt routing — optional advisory selection

prompt-routing.mjs --input <stage.json> [--project <directory>] [--local-only]
prompt-routing.mjs --input <stage.json> --send --request-hash <preview-hash> [--project <directory>]
prompt-routing.mjs --replay <receipt.json>

Preview is offline and writes nothing. Send makes at most one TypeSafe request,
requires the exact preview hash and active prompt recording, and retains a receipt.
A preview has a one-call budget, including failures; repeated sends are rejected.
The result recommends a prompt to inspect; it executes no recipe or tool.
Explicit user choices and local-only mode bypass Jev. Failed calls are not retried.
Replay checks a stored answer against its recorded candidate menu without a model call.
`;
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0]))
    console.log(help);
  else {
    const options = new Map();
    for (let i = 0; i < args.length; i++) {
      const key = args[i];
      if (
        ![
          '--input',
          '--project',
          '--local-only',
          '--send',
          '--request-hash',
          '--replay',
        ].includes(key) ||
        options.has(key)
      )
        throw new Error(`Unknown or repeated option: ${key}`);
      if (['--local-only', '--send'].includes(key)) options.set(key, true);
      else {
        const value = args[++i];
        if (!value || value.startsWith('--'))
          throw new Error(`Missing value for ${key}`);
        options.set(key, value);
      }
    }
    async function readJson(path, limit) {
      const full = resolve(path);
      const raw = await safeBytes(dirname(full), [basename(full)], limit);
      if (!raw) throw new Error('Input file not found');
      return JSON.parse(raw.bytes.toString('utf8'));
    }
    if (options.has('--replay')) {
      if (options.size !== 1)
        throw new Error('Replay cannot be combined with other options');
      const receipt = await readJson(options.get('--replay'), 1_000_000);
      if (
        receipt.version !== 1 ||
        receipt.kind !== 'recipe-inspection' ||
        !receipt.request
      )
        throw new Error('Invalid routing receipt');
      if (!receipt.response)
        console.log(
          JSON.stringify({
            status: 'no-answer',
            fallback: receipt.fallback,
            validation: receipt.validation,
          }),
        );
      else {
        const response = validatePromptSelection(
          receipt.response,
          receipt.request,
        );
        console.log(
          JSON.stringify({
            status: 'schema-valid',
            choice: response.answers.recipe.choice,
            originalValidation: receipt.validation,
            originalFallback: receipt.fallback,
            note: 'Replay verifies the recorded answer schema only, not current eligibility or selection quality.',
          }),
        );
      }
    } else {
      if (!options.has('--input'))
        throw new Error('Provide --input <stage.json>');
      if (options.has('--send') !== options.has('--request-hash'))
        throw new Error('Send requires --send and --request-hash together');
      const resolved = await resolveOptions(
        options.has('--project') ? ['--project', options.get('--project')] : [],
      );
      const readCurrentInput = () => readJson(options.get('--input'), 32000);
      const input = await readCurrentInput();
      const result = options.has('--send')
        ? await selectPrompt(resolved.project, input, {
            localOnly: options.has('--local-only'),
            requestHash: options.get('--request-hash'),
            readCurrentInput,
          })
        : await previewPromptSelection(resolved.project, input, {
            localOnly: options.has('--local-only'),
          });
      console.log(JSON.stringify(result, null, 2));
    }
  }
} catch (error) {
  console.error(
    error instanceof SyntaxError
      ? 'Input must contain valid JSON'
      : error.message,
  );
  process.exitCode = 1;
}
