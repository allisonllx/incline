import { resolveOptions } from './options.mjs';
import { previewReview, runReview } from './jev-review.mjs';
try {
  const args = process.argv.slice(2);
  if (args.includes('--help'))
    console.log(
      'Optional Jev insight review\n  jev-review.mjs --id <insight> [--against <other-id>] [--project <directory>]\n  Add --send --request-hash <preview hash> to send exactly that payload and save an advisory review.\nPreview is offline. Only selected linked text and artifact metadata are sent. Key: TYPESAFE_API_KEY environment or project .env. Existing insights are never modified.',
    );
  else {
    let id,
      send = false,
      requestHash;
    const against = [],
      optionsArgs = [],
      seen = new Set();
    for (let i = 0; i < args.length; i++) {
      const flag = args[i];
      if (
        ![
          '--id',
          '--against',
          '--send',
          '--request-hash',
          '--project',
        ].includes(flag)
      )
        throw new Error('Unknown review option');
      if (flag !== '--against' && seen.has(flag))
        throw new Error('Repeated review option');
      seen.add(flag);
      if (flag === '--send') {
        send = true;
        continue;
      }
      const value = args[++i];
      if (!value || value.startsWith('--'))
        throw new Error('Missing review option value');
      if (flag === '--id') id = value;
      else if (flag === '--against') against.push(value);
      else if (flag === '--request-hash') requestHash = value;
      else optionsArgs.push(flag, value);
    }
    if (!id || (!send && requestHash))
      throw new Error('Specify --id; --request-hash requires --send');
    const { project } = await resolveOptions(optionsArgs);
    if (send)
      console.log(
        JSON.stringify(await runReview(project, id, { against, requestHash })),
      );
    else {
      const { fixture: _fixture, ...preview } = await previewReview(project, id, against);
      console.log(JSON.stringify(preview));
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
