import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  realpath,
  writeFile,
  readFile,
  readdir,
  rm,
  mkdir,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  captureDesign,
  readDesign,
  queryDesigns,
  publishDesign,
  importDesign,
} from './design-snapshots.mjs';
import { savePromptSettings } from './prompt-settings.mjs';
import {
  readDesignSettings,
  saveDesignSettings,
  captureConfiguredDesign,
} from './design-snapshot-settings.mjs';
import { executeDesignCli } from './design-snapshots-cli.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=',
  'base64',
);
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'incline-design-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  const next = join(root, 'next-project');
  const library = join(root, 'library');
  await mkdir(project);
  await mkdir(next);
  await writeFile(join(root, 'preview.png'), png);
  const input = {
    id: 'portfolio-v3',
    title: 'Illustrated portfolio',
    context: 'A personal portfolio',
    state: 'Home V3 after the tree revision',
    tags: ['portfolio', 'illustrated'],
    observations: [
      {
        aspect: 'composition',
        text: 'The tree anchors the left edge while the heading has clear space.',
        basis: 'rendered',
        artifactIds: ['desktop'],
      },
    ],
    artifacts: [
      {
        id: 'desktop',
        kind: 'screenshot',
        path: 'preview.png',
        view: 'Home, 1440×900, initial state',
      },
      {
        id: 'mobile',
        kind: 'screenshot',
        view: 'Home, mobile',
        missingReason: 'Not captured',
      },
    ],
    reactions: [
      {
        id: 'r1',
        kind: 'reaction',
        evidence: 'verbatim',
        text: '4 — love the tree, mobile still needs work',
        source: 'User reply to V3',
        occurredAt: null,
        context: 'Overall V3; partial comment',
        artifactIds: ['desktop'],
        rating: {
          value: 4,
          min: 1,
          max: 5,
          question: 'Overall vibe?',
          minLabel: 'Not for me',
          maxLabel: 'Love it',
        },
      },
    ],
    satisfaction: {
      status: 'positive',
      basis:
        'User likes the overall desktop result, with a mobile qualification.',
      reactionIds: ['r1'],
    },
    qualifications: [
      'Mobile still needs work; individual tokens are not endorsed.',
    ],
    reuseNotes: ['Explore the composition for an illustrated homepage.'],
  };
  return { root, project, next, library, input };
}

test('capture retains exact reactions, observations and visuals without changing root design rules', async (t) => {
  const { root, project, input } = await fixture(t);
  await writeFile(join(project, 'DESIGN.md'), 'Existing rules');
  const result = await captureDesign(project, input, { inputDirectory: root });
  await writeFile(join(root, 'preview.png'), 'changed original');
  const saved = await readDesign(project, input.id);
  assert.deepEqual(saved.manifest.design.reactions, input.reactions);
  assert.deepEqual(saved.manifest.design.qualifications, input.qualifications);
  assert.deepEqual(
    await readFile(join(saved.directory, 'assets/desktop.png')),
    png,
  );
  assert.equal(
    await readFile(join(project, 'DESIGN.md'), 'utf8'),
    'Existing rules',
  );
  assert.equal(
    saved.manifest.design.artifacts[1].missingReason,
    'Not captured',
  );
  assert.ok(saved.guide.includes(input.observations[0].text));
  assert.ok(saved.guide.includes(input.reactions[0].text));
  assert.equal(result.id, input.id);
  assert.equal(saved.manifest.source.commit, null);
});

test('publication and import survive source removal and retain original context as inspiration', async (t) => {
  const { root, project, next, library, input } = await fixture(t);
  await captureDesign(project, input, { inputDirectory: root });
  const published = await publishDesign(project, input.id, library);
  assert.equal(
    (await publishDesign(project, input.id, library)).status,
    'already-saved',
  );
  await rm(project, { recursive: true });
  await rm(join(root, 'preview.png'));
  const rows = await queryDesigns(next, {
    scope: 'personal',
    library,
    text: 'portfolio',
    tag: 'illustrated',
  });
  assert.equal(rows.entries[0].id, published.id);
  const imported = await importDesign(
    next,
    published.id,
    library,
    'Explore the tree composition for a different portfolio.',
  );
  await rm(library, { recursive: true });
  const saved = await readDesign(next, imported.id, { scope: 'imported' });
  assert.deepEqual(saved.manifest.design.reactions, input.reactions);
  assert.equal(saved.reuse.intent, 'inspiration');
  assert.equal(saved.reuse.sourceHash, published.hash);
  assert.equal(
    saved.reuse.relevance,
    'Explore the tree composition for a different portfolio.',
  );
  assert.deepEqual(
    await readFile(join(saved.directory, 'assets/desktop.png')),
    png,
  );
  assert.deepEqual((await queryDesigns(next)).entries, []);
});

test('automatic capture needs active recording and a reaction-linked satisfaction assessment', async (t) => {
  const { root, project, input } = await fixture(t);
  const options = { inputDirectory: root, automatic: true };
  await assert.rejects(captureDesign(project, input, options), /recording/i);
  assert.deepEqual(await readdir(project), []);
  await savePromptSettings(project, { recording: 'active' });
  await captureDesign(project, input, options);
  await savePromptSettings(project, { recording: 'stopped' });
  await assert.rejects(
    captureDesign(project, { ...input, id: 'later' }, options),
    /recording/i,
  );
  await savePromptSettings(project, { recording: 'active' });
  const unknown = {
    ...input,
    id: 'unknown',
    satisfaction: { status: 'unknown', basis: 'Not assessed', reactionIds: [] },
  };
  await assert.rejects(
    captureDesign(project, unknown, options),
    /satisfaction/i,
  );
  await assert.rejects(
    captureDesign(
      project,
      {
        ...input,
        satisfaction: { ...input.satisfaction, reactionIds: ['absent'] },
      },
      options,
    ),
    /reaction/i,
  );
});

test('immutable captures handle retries and concurrent writers, while corruption fails visibly', async (t) => {
  const { root, project, input } = await fixture(t);
  const results = await Promise.all([
    captureDesign(project, input, { inputDirectory: root }),
    captureDesign(project, input, { inputDirectory: root }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [
    'already-saved',
    'saved',
  ]);
  await assert.rejects(
    captureDesign(
      project,
      { ...input, title: 'Overwrite' },
      { inputDirectory: root },
    ),
    /different/,
  );
  const saved = await readDesign(project, input.id);
  await writeFile(join(saved.directory, 'DESIGN.md'), 'Tampered');
  await assert.rejects(readDesign(project, input.id), /integrity/);
  await assert.rejects(
    publishDesign(project, input.id, join(root, 'bad-library')),
    /integrity/,
  );
});

test('read-only lookup creates nothing, local-only blocks personal scope, and unsafe inputs fail', async (t) => {
  const { root, project, library, input } = await fixture(t);
  assert.deepEqual((await queryDesigns(project)).entries, []);
  assert.deepEqual(
    (await queryDesigns(project, { scope: 'personal', library })).entries,
    [],
  );
  assert.deepEqual(await readdir(project), []);
  await assert.rejects(
    queryDesigns(project, { scope: 'personal', library, localOnly: true }),
    /local-only/,
  );
  await assert.rejects(
    captureDesign(
      project,
      { ...input, id: '../escape' },
      { inputDirectory: root },
    ),
  );
  await symlink(join(root, 'preview.png'), join(root, 'linked.png'));
  await assert.rejects(
    captureDesign(
      project,
      {
        ...input,
        artifacts: [
          { ...input.artifacts[0], path: 'linked.png' },
          input.artifacts[1],
        ],
      },
      { inputDirectory: root },
    ),
    /symlink/i,
  );
  await assert.rejects(
    captureDesign(
      project,
      {
        ...input,
        observations: [{ ...input.observations[0], artifactIds: ['absent'] }],
      },
      { inputDirectory: root },
    ),
    /artifact/i,
  );
});

test('automatic personal publication requires scoped opt-in and respects local-only, directory changes and stopped recording', async (t) => {
  const { root, project, library, input } = await fixture(t);
  assert.equal((await readDesignSettings(project)).personalAutoSave, false);
  assert.deepEqual(await readdir(project), []);
  await savePromptSettings(project, { recording: 'active' });
  const options = { inputDirectory: root, automatic: true };
  const local = await captureConfiguredDesign(project, input, options);
  assert.equal(local.personalSave.status, 'not-enabled');
  const settings = await saveDesignSettings(project, {
    expectedRevision: null,
    personalAutoSave: true,
    personalDirectory: library,
  });
  // Explicit single captures never start automatic personal publication.
  assert.equal(
    (await captureConfiguredDesign(project, input, { inputDirectory: root }))
      .personalSave.status,
    'not-enabled',
  );
  const restricted = await captureConfiguredDesign(project, input, {
    ...options,
    localOnly: true,
  });
  assert.equal(restricted.personalSave.reason, 'local-only');
  const changed = await captureConfiguredDesign(project, input, {
    ...options,
    library: join(root, 'different-library'),
  });
  assert.equal(changed.personalSave.status, 'skipped');
  assert.deepEqual(
    (await queryDesigns(project, { scope: 'personal', library })).entries,
    [],
  );
  const shared = await captureConfiguredDesign(project, input, options);
  assert.equal(shared.personalSave.status, 'saved');
  assert.equal(
    (await captureConfiguredDesign(project, input, options)).personalSave
      .status,
    'already-saved',
  );
  await assert.rejects(
    saveDesignSettings(project, {
      expectedRevision: null,
      personalAutoSave: false,
    }),
    /changed/,
  );
  assert.deepEqual(await readDesignSettings(project), settings);
  await savePromptSettings(project, { recording: 'stopped' });
  await assert.rejects(
    captureConfiguredDesign(project, { ...input, id: 'after-stop' }, options),
    /recording/i,
  );
  assert.equal((await queryDesigns(project)).total, 1);
  await saveDesignSettings(project, {
    expectedRevision: settings.revision,
    personalAutoSave: false,
  });
  await savePromptSettings(project, { recording: 'active' });
  const disabled = await captureConfiguredDesign(
    project,
    { ...input, id: 'after-disable' },
    options,
  );
  assert.equal(disabled.personalSave.status, 'not-enabled');
  assert.equal(
    (await queryDesigns(project, { scope: 'personal', library })).total,
    1,
  );
});

test('failed personal publication preserves local success and can be retried after repairing the selected path', async (t) => {
  const { root, project, library, input } = await fixture(t);
  await savePromptSettings(project, { recording: 'active' });
  await saveDesignSettings(project, {
    personalAutoSave: true,
    personalDirectory: library,
  });
  await writeFile(library, 'A different file at the selected path');
  const first = await captureConfiguredDesign(project, input, {
    automatic: true,
    inputDirectory: root,
  });
  assert.equal(first.status, 'saved');
  assert.equal(first.personalSave.status, 'failed');
  assert.equal((await readDesign(project, input.id)).manifest.hash, first.hash);
  assert.equal(
    await readFile(library, 'utf8'),
    'A different file at the selected path',
  );
  await rm(library);
  const retry = await captureConfiguredDesign(project, input, {
    automatic: true,
    inputDirectory: root,
  });
  assert.equal(retry.status, 'already-saved');
  assert.equal(retry.personalSave.status, 'saved');
  assert.equal(retry.personalSave.hash, first.hash);
});

test('malformed settings and incompatible stores fail without replacing existing evidence', async (t) => {
  const { root, project, library, input } = await fixture(t);
  await assert.rejects(
    saveDesignSettings(project, { personalAutoSave: true }),
    /selected library/,
  );
  await assert.rejects(
    saveDesignSettings(
      project,
      { personalAutoSave: true, personalDirectory: library },
      { localOnly: true },
    ),
    /local-only/,
  );
  assert.deepEqual(await readdir(project), []);
  await captureDesign(project, input, { inputDirectory: root });
  await mkdir(library);
  await writeFile(join(library, 'collection.json'), '{"unrelated":true}');
  await assert.rejects(
    publishDesign(project, input.id, library),
    /store entry/,
  );
  assert.deepEqual(await readdir(library), ['collection.json']);
  const incomplete = join(project, '.incline/design-snapshots/incomplete');
  await mkdir(incomplete);
  await assert.rejects(
    captureDesign(
      project,
      { ...input, id: 'incomplete' },
      { inputDirectory: root },
    ),
    /Incomplete/,
  );
  assert.deepEqual(await readdir(incomplete), []);
  const settingsPath = join(project, '.incline/design-snapshot-settings.json');
  await writeFile(settingsPath, '{broken');
  await assert.rejects(
    captureConfiguredDesign(project, input, {
      automatic: true,
      inputDirectory: root,
    }),
  );
  await assert.rejects(
    saveDesignSettings(project, { personalAutoSave: false }),
  );
  assert.equal(await readFile(settingsPath, 'utf8'), '{broken');
});

test('source-derived observations and motion retain their files, while corrupted assets fail verification', async (t) => {
  const { root, project, input } = await fixture(t);
  const css = '.hero { gap: 2rem; }';
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]); // Signature validation, not a playable-video claim.
  await writeFile(join(root, 'tokens.css'), css);
  await writeFile(join(root, 'motion.webm'), webm);
  input.artifacts.push(
    { id: 'tokens', kind: 'source', view: 'CSS at V3', path: 'tokens.css' },
    {
      id: 'motion',
      kind: 'motion',
      view: 'Hover V3, desktop',
      path: 'motion.webm',
    },
  );
  input.observations.push({
    aspect: 'spacing',
    text: 'CSS specifies a 2rem gap; responsive appearance unverified.',
    basis: 'source',
    artifactIds: ['tokens'],
  });
  await captureDesign(project, input, { inputDirectory: root });
  const saved = await readDesign(project, input.id);
  assert.equal(
    await readFile(join(saved.directory, 'assets/tokens.css'), 'utf8'),
    css,
  );
  assert.deepEqual(
    await readFile(join(saved.directory, 'assets/motion.webm')),
    webm,
  );
  assert.ok(
    saved.guide.includes(
      'source-derived; visual outcome not established by code alone',
    ),
  );
  await writeFile(join(saved.directory, 'assets/desktop.png'), 'replaced');
  assert.equal((await queryDesigns(project)).total, 1); // Discovery checks metadata only.
  await assert.rejects(readDesign(project, input.id), /Artifact integrity/);
});

test('Git provenance records the commit and distinguishes a modified working state', async (t) => {
  const { root, project, input } = await fixture(t);
  const git = (args) => promisify(execFile)('git', ['-C', project, ...args]);
  await git(['init', '--initial-branch=main']);
  await writeFile(join(project, 'page.css'), '.hero { gap: 2rem; }');
  await git(['add', 'page.css']);
  await git([
    '-c',
    'user.name=Snapshot test',
    '-c',
    'user.email=test@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-m',
    'Fixture',
  ]);
  const { stdout: head } = await git(['rev-parse', 'HEAD']);
  await captureDesign(project, input, { inputDirectory: root });
  const first = await readDesign(project, input.id);
  assert.equal(first.manifest.source.commit, head.trim());
  assert.equal(first.manifest.source.dirty, false);
  await writeFile(join(project, 'page.css'), '.hero { gap: 3rem; }');
  await captureDesign(
    project,
    { ...input, id: 'after-edit' },
    { inputDirectory: root },
  );
  const second = await readDesign(project, 'after-edit');
  assert.equal(second.manifest.source.commit, head.trim());
  assert.equal(second.manifest.source.dirty, true);
  assert.equal(
    (await readDesign(project, input.id)).manifest.source.dirty,
    false,
  );
});

test('same capture names in different projects coexist, and imports preserve the original relevance note', async (t) => {
  const { root, project, next, library, input } = await fixture(t);
  await captureDesign(project, input, { inputDirectory: root });
  await captureDesign(
    next,
    { ...input, context: 'A separate illustrated magazine' },
    { inputDirectory: root },
  );
  const a = await publishDesign(project, input.id, library);
  const b = await publishDesign(next, input.id, library);
  assert.notEqual(a.id, b.id);
  assert.equal(
    (await queryDesigns(next, { scope: 'personal', library })).total,
    2,
  );
  await importDesign(next, a.id, library, 'Original reason');
  assert.equal(
    (await importDesign(next, a.id, library, 'Original reason')).status,
    'already-saved',
  );
  await assert.rejects(
    importDesign(next, a.id, library, 'Different reason'),
    /different content/,
  );
  assert.equal(
    (await readDesign(next, a.id, { scope: 'imported' })).reuse.relevance,
    'Original reason',
  );
});

test('CLI selects the active project and gives strict read-only queries and portable explicit reuse', async (t) => {
  const { root, project, next, library, input } = await fixture(t);
  const call = async (args, cwd = project) => {
    if (!process.env.DESIGN_SNAPSHOT_CLI)
      return executeDesignCli(args, { cwd });
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [process.env.DESIGN_SNAPSHOT_CLI, ...args],
      { cwd },
    );
    return JSON.parse(stdout);
  };
  assert.equal((await call(['query'])).total, 0);
  await assert.rejects(call(['query', '--automatic']), /Unknown/);
  await assert.rejects(
    call([
      'capture',
      '--input',
      'missing',
      '--local-only',
      '--personal-dir',
      library,
    ]),
    /local-only/,
  );
  await assert.rejects(call(['query', '--limit', '51']), /Limit/);
  assert.deepEqual(await readdir(project), []);
  await mkdir(join(project, '.git')); // Root marker covers invocation from a nested component folder.
  const nested = join(project, 'src');
  await mkdir(nested);
  const inputFile = join(root, 'capture.json');
  await writeFile(inputFile, JSON.stringify(input));
  const captured = await call(['capture', '--input', inputFile], nested);
  assert.equal(
    captured.directory,
    join(project, '.incline/design-snapshots', input.id),
  );
  assert.deepEqual(await readdir(nested), []);
  const published = await call([
    'publish',
    '--id',
    input.id,
    '--personal-dir',
    library,
  ]);
  assert.equal(
    (
      await call([
        'query',
        '--scope',
        'personal',
        '--personal-dir',
        library,
        '--tag',
        'illustrated',
      ])
    ).total,
    1,
  );
  await call([
    'import',
    '--id',
    published.id,
    '--personal-dir',
    library,
    '--relevance',
    'Relevant illustration composition',
    '--project',
    next,
  ]);
  assert.equal(
    (await call(['read', '--scope', 'imported', '--id', published.id], next))
      .manifest.hash,
    captured.hash,
  );
  assert.deepEqual(
    (await call(['read', '--id', input.id])).manifest.design.reactions,
    input.reactions,
  );
  assert.equal((await call(['settings'])).personalAutoSave, false);
  const settingsFile = join(root, 'settings.json');
  await writeFile(
    settingsFile,
    JSON.stringify({
      expectedRevision: null,
      personalAutoSave: true,
      personalDirectory: library,
    }),
  );
  const settings = await call(['settings', '--input', settingsFile]);
  assert.equal(settings.personalAutoSave, true);
  assert.equal((await call(['settings'])).revision, settings.revision);
  await savePromptSettings(project, { recording: 'active' });
  assert.equal(
    (await call(['capture', '--input', inputFile, '--automatic'])).personalSave
      .status,
    'already-saved',
  );
});

test('executable reports partial personal failure as JSON and nonzero status', async (t) => {
  const { root, project, library, input } = await fixture(t);
  await savePromptSettings(project, { recording: 'active' });
  await saveDesignSettings(project, {
    personalAutoSave: true,
    personalDirectory: library,
  });
  await writeFile(library, 'blocked');
  const inputFile = join(root, 'capture.json');
  await writeFile(inputFile, JSON.stringify(input));
  // Set DESIGN_SNAPSHOT_CLI to run this contract against the portable bundled entrypoint too.
  const cli =
    process.env.DESIGN_SNAPSHOT_CLI ??
    fileURLToPath(new URL('./design-snapshots-cli.mjs', import.meta.url));
  await assert.rejects(
    promisify(execFile)(process.execPath, [
      cli,
      'capture',
      '--project',
      project,
      '--input',
      inputFile,
      '--automatic',
    ]),
    (error) => {
      assert.equal(error.code, 1);
      const result = JSON.parse(error.stdout);
      assert.equal(result.status, 'saved');
      assert.equal(result.personalSave.status, 'failed');
      return true;
    },
  );
  assert.equal(
    (await readDesign(project, input.id)).manifest.design.title,
    input.title,
  );
});

test('automatic local capture rechecks recording after waiting for a write lock', async (t) => {
  const { root, project, input } = await fixture(t);
  await savePromptSettings(project, { recording: 'active' });
  const store = join(project, '.incline/design-snapshots');
  await mkdir(store);
  const lock = join(store, '.snapshot-write.lock');
  await writeFile(lock, 'held by another writer', { flag: 'wx' });
  const pending = captureDesign(project, input, {
    inputDirectory: root,
    automatic: true,
  });
  const rejected = assert.rejects(pending, /recording/i);
  await delay(100);
  await savePromptSettings(project, { recording: 'stopped' });
  await rm(lock);
  await rejected;
  assert.deepEqual(await readdir(store), []);
});

for (const revocation of ['stop-recording', 'disable-personal']) {
  test(`automatic personal publication rechecks ${revocation} after waiting for a write lock`, async (t) => {
    const { root, project, library, input } = await fixture(t);
    await savePromptSettings(project, { recording: 'active' });
    await saveDesignSettings(project, {
      personalAutoSave: true,
      personalDirectory: library,
    });
    await mkdir(library);
    const lock = join(library, '.snapshot-write.lock');
    await writeFile(lock, 'held by another writer', { flag: 'wx' });
    const pending = captureConfiguredDesign(project, input, {
      inputDirectory: root,
      automatic: true,
    });
    await delay(100);
    if (revocation === 'stop-recording')
      await savePromptSettings(project, { recording: 'stopped' });
    else await saveDesignSettings(project, { personalAutoSave: false });
    await rm(lock);
    const result = await pending;
    assert.equal(result.status, 'saved');
    assert.ok(['skipped', 'failed'].includes(result.personalSave.status));
    assert.deepEqual(await readdir(library), []);
    assert.equal(
      (await readDesign(project, input.id)).manifest.hash,
      result.hash,
    );
  });
}
