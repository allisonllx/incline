import { startServer } from './server.mjs';
import { resolveOptions } from './options.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const help = `Incline — collect and explore your design taste

node incline.mjs [--project <directory>] [--input <collection.json>]
                 [--library-dir <directory> | --local-only]
                 [--prompt-library-dir <directory>]

Uses the current repository, or the current directory outside a repository.
--project selects a different project. A personal library is available at
~/.incline/library; it is only accessed when you open it or save a copy.
--library-dir selects another library. --local-only disables shared access.
--prompt-library-dir selects the personal prompt library, which is read only
when you explicitly open it or enable personal prompt lookup.

Prints a ready event with a localhost URL. Open that URL for the user.
Finish writes the project's .incline/profile.md and an immutable revision,
emits a completed event, and stops the server. Closing leaves a resumable draft.
No account, network service or dependency installation is needed.
`;
const args = process.argv.slice(2);
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  console.log(help);
} else {
  try {
    const options = await resolveOptions(args);
    const ui = [
      new URL('../assets/ui/', import.meta.url),
      new URL('../skills/incline/assets/ui/', import.meta.url),
    ]
      .map(fileURLToPath)
      .find((path) => existsSync(resolve(path, 'index.html')));
    if (!ui)
      throw new Error(
        'Incline UI is missing. Reinstall the complete skill, or run npm run build:skill in the source project.',
      );
    let completed = false;
    const server = await startServer({
      ...options,
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
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
