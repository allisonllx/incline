import { build } from 'esbuild';
await build({
  entryPoints: {
    incline: 'local/cli.mjs',
    getdesign: 'local/getdesign-cli.mjs',
    feedback: 'local/feedback-cli.mjs',
    insights: 'local/insights-cli.mjs',
    exploration: 'local/exploration-cli.mjs',
    'jev-review': 'local/jev-review-cli.mjs',
    prompts: 'local/prompts-cli.mjs',
    'prompt-routing': 'local/prompt-routing-cli.mjs',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outdir: 'skills/incline/scripts',
  outExtension: { '.js': '.mjs' },
});
