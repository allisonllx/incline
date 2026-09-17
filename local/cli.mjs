import { startServer } from './server.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'Incline — temporary local taste calibration\n\nnode incline.mjs --project /absolute/project/path [--input /path/to/collection.json]\n\nPrints a ready event with a localhost URL. Open that URL for the user.\nFinish writes .incline/profile.md and an immutable revision, emits a completed\nevent, and stops the server. Closing the browser leaves a resumable draft.\nNo network services, account, or npm install are required by the bundled skill.',
  );
} else {
  const at = args.indexOf('--project');
  const inputAt = args.indexOf('--input');
  const consumed = new Set([at, at + 1]);
  if (inputAt >= 0) {
    consumed.add(inputAt);
    consumed.add(inputAt + 1);
  }
  if (
    at < 0 ||
    !args[at + 1] ||
    (inputAt >= 0 && !args[inputAt + 1]) ||
    args.some((a, i) => !consumed.has(i))
  ) {
    console.error(
      'Usage: node incline.mjs --project /absolute/project/path [--input /path/to/collection.json]',
    );
    process.exitCode = 1;
  } else {
    const candidates = [
      new URL('../assets/ui/', import.meta.url),
      new URL('../skills/incline/assets/ui/', import.meta.url),
    ];
    const ui = candidates
      .map(fileURLToPath)
      .find((p) => existsSync(resolve(p, 'index.html')));
    if (!ui) {
      console.error(
        'Incline UI is missing. Run npm run build:skill in the Incline source project.',
      );
      process.exitCode = 1;
    } else
      try {
        let completed = false;
        const server = await startServer({
          project: resolve(args[at + 1]),
          ...(inputAt >= 0 ? { input: resolve(args[inputAt + 1]) } : {}),
          ui,
          onFinish: (result) => {
            completed = true;
            console.log(JSON.stringify({ event: 'completed', ...result }));
          },
        });
        console.log(
          JSON.stringify({
            event: 'ready',
            url: server.url,
            directory: server.directory,
          }),
        );
        const stop = () => void server.close();
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
        await server.closed;
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
        if (!completed)
          console.log(
            JSON.stringify({
              event: 'closed',
              status: 'draft-retained',
              directory: server.directory,
            }),
          );
      } catch (e) {
        console.error(e.message);
        process.exitCode = 1;
      }
  }
}
