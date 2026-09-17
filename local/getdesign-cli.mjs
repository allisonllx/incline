import { createGetDesign } from './getdesign.mjs';

const help = `Incline — optional public getdesign.md references

node getdesign.mjs list ["search words"]
node getdesign.mjs fetch <slug> --project /absolute/project [--revision <commit>]

Search matches names and descriptions in the public GitHub collection.
Fetch keeps the original guide, license and provenance under .incline/sources/.
It prints an inputPath for incline.mjs --project <project> --input <inputPath>.
No taste profile is changed until the collection is saved in Incline.
This optional helper needs internet access. It requires no MCP, account or key.
`;
const args = process.argv.slice(2);
try {
  const client = createGetDesign();
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(help);
  } else if (args[0] === 'list' && args.length <= 2) {
    console.log(JSON.stringify(await client.list(args[1]), null, 2));
  } else if (args[0] === 'fetch' && args[1]) {
    const options = {};
    for (let index = 2; index < args.length; index += 2) {
      const flag = args[index];
      const value = args[index + 1];
      if (
        !['--project', '--revision'].includes(flag) ||
        !value ||
        value.startsWith('--') ||
        options[flag.slice(2)] !== undefined
      )
        throw new Error(help);
      options[flag.slice(2)] = value;
    }
    if (!options.project) throw new Error(help);
    console.log(
      JSON.stringify(await client.fetchGuide(args[1], options), null, 2),
    );
  } else {
    throw new Error(help);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
