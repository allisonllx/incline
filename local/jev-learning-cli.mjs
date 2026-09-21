import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  buildRequest,
  evaluateCase,
  summarize,
  MODEL,
  RUBRIC_VERSION,
  POLICY,
} from './jev-learning.mjs';

try {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'Experimental synthetic Jev learning trial: --preview (default), or --live [--case <id>]. Live requires TYPESAFE_API_KEY. Reports go under outputs/jev-learning/. No private project data is read or promoted.',
    );
  } else {
    let live = false,
      caseId;
    const seen = new Set();
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (seen.has(arg) || !['--preview', '--live', '--case'].includes(arg))
        throw new Error('Unknown or repeated trial option');
      seen.add(arg);
      if (arg === '--live') live = true;
      if (arg === '--case') {
        caseId = args[++i];
        if (!caseId || caseId.startsWith('--'))
          throw new Error('--case requires an ID');
      }
    }
    if (seen.has('--live') && seen.has('--preview'))
      throw new Error('Choose --live or --preview');
    const root = fileURLToPath(new URL('../', import.meta.url));
    const dataset = JSON.parse(
      await readFile(
        new URL('../experiments/jev-learning/cases.json', import.meta.url),
        'utf8',
      ),
    );
    if (
      dataset.kind !== 'synthetic' ||
      dataset.version !== 1 ||
      dataset.cases.length > 20
    )
      throw new Error('Invalid fixed synthetic fixture');
    const cases = dataset.cases.filter((c) => !caseId || c.id === caseId);
    if (!cases.length) throw new Error('Unknown case ID');
    const requests = cases.map(buildRequest);
    if (!live)
      console.log(
        JSON.stringify(
          {
            mode: 'preview',
            networkRequests: 0,
            model: MODEL,
            rubricVersion: RUBRIC_VERSION,
            policy: POLICY,
            requests,
          },
          null,
          2,
        ),
      );
    else {
      if (!process.env.TYPESAFE_API_KEY?.trim())
        throw new Error('Set TYPESAFE_API_KEY; no network requests sent');
      const base = join(root, 'outputs/jev-learning');
      await mkdir(base, { recursive: true });
      const directory = await mkdtemp(join(base, 'run-'));
      await writeFile(
        join(directory, 'manifest.json'),
        JSON.stringify(
          {
            startedAt: new Date().toISOString(),
            mode: 'shadow',
            rubricVersion: RUBRIC_VERSION,
            model: MODEL,
            policy: POLICY,
            labelSource: dataset.labelSource,
            cases,
            requests,
          },
          null,
          2,
        ),
        { flag: 'wx', mode: 0o600 },
      );
      const results = [];
      try {
        for (const fixture of cases) {
          const result = await evaluateCase(fixture, {
            apiKey: process.env.TYPESAFE_API_KEY,
          });
          await writeFile(
            join(directory, fixture.id + '.json'),
            JSON.stringify(result, null, 2),
            { flag: 'wx', mode: 0o600 },
          );
          results.push(result);
          console.log(
            JSON.stringify({
              caseId: fixture.id,
              action: result.recommendation.action,
              elapsedMs: result.elapsedMs,
            }),
          );
        }
      } catch (error) {
        await writeFile(
          join(directory, 'failure.json'),
          JSON.stringify({ error: error.message, completed: results.length }),
          { flag: 'wx', mode: 0o600 },
        );
        process.exitCode = 1;
      }
      const summary = summarize(cases, results);
      await writeFile(
        join(directory, 'summary.json'),
        JSON.stringify(summary, null, 2),
        { flag: 'wx', mode: 0o600 },
      );
      console.log(
        JSON.stringify({ reportDirectory: directory, ...summary }, null, 2),
      );
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
