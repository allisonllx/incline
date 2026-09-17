import { build } from 'esbuild';
await build({
  entryPoints: {
    incline: 'local/cli.mjs',
    getdesign: 'local/getdesign-cli.mjs',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outdir: 'skills/incline/scripts',
  outExtension: { '.js': '.mjs' },
});
