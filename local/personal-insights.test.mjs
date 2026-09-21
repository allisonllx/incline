import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  realpath,
  symlink,
  readdir,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { recordFeedback } from './feedback.mjs';
import { saveInsight } from './insights.mjs';
import {
  previewPersonalInsight,
  savePersonalInsight,
  listPersonalInsights,
  readPersonalInsight,
  importPersonalInsight,
} from './personal-insights.mjs';
const digest = (data) => createHash('sha256').update(data).digest('hex');
async function fixture(t, repeatedArtifactRefs = false) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'incline-personal-')),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, 'source'),
    target = join(root, 'target'),
    personal = join(root, 'personal');
  await mkdir(project);
  await mkdir(target);
  await writeFile(
    join(project, 'spacing.txt'),
    'Synthetic dense table spacing reference',
  );
  const event = (id, kind, text, artifactIds) => ({
    id,
    kind,
    evidence: 'verbatim',
    text,
    source: 'Synthetic transcript',
    occurredAt: null,
    context: 'Exact gaps apply only within this layout.',
    artifactIds,
  });
  await recordFeedback(
    project,
    {
      id: 'spacing',
      mode: 'retrospective',
      coverage: {
        source: 'Synthetic pilot only',
        limitations: ['No actual user evidence inspected'],
      },
      artifacts: [
        { id: 'table', path: 'spacing.txt' },
        { id: 'missing', missingReason: 'Screenshot unavailable' },
      ],
      events: [
        event(
          'tight',
          'directed-edit',
          'Reduce table row gaps.',
          repeatedArtifactRefs
            ? ['table', 'table', 'missing', 'missing']
            : ['table', 'missing'],
        ),
        event('wide', 'directed-edit', 'Keep larger marketing hero gap.', []),
        event('push', 'acceptance', 'okay push', []),
      ],
    },
    project,
  );
  await saveInsight(project, {
    id: 'spacing',
    aspect: 'spacing',
    finding: 'Review spacing in layout context.',
    scope: 'Dense analytical tables',
    status: 'tentative',
    qualifications: ['Hero spacing may need room'],
    openQuestions: [],
    supportingEvidence: [{ batchId: 'spacing', eventId: 'tight' }],
    conflictingEvidence: [{ batchId: 'spacing', eventId: 'wide' }],
    expectedRevision: 0,
  });
  const selection = {
    id: 'contextual-spacing',
    expectedRevision: 0,
    reviewed: true,
    aspect: 'spacing',
    finding:
      'Check whether spacing supports hierarchy and density in the current layout.',
    scope: 'Evaluate separately for each layout',
    exceptions: [
      'Exact gaps stay contextual.',
      '“okay push” concerns communication/publication permission, not visual style.',
    ],
    status: 'tentative',
    sources: [
      {
        project,
        id: 'spacing',
        revision: 1,
        label: 'Synthetic dashboard',
        context: 'Dense table versus spacious hero',
        evidence: [
          { batchId: 'spacing', eventId: 'tight', role: 'supporting' },
          { batchId: 'spacing', eventId: 'wide', role: 'conflicting' },
        ],
      },
    ],
  };
  return { root, project, target, personal, selection };
}
test('preview is read-only; explicit save and import are portable, selected-only and independent', async (t) => {
  const f = await fixture(t),
    sourcePath = join(f.project, '.incline/insights/spacing/1.json');
  const original = await readFile(sourcePath);
  assert.deepEqual(await listPersonalInsights(f.personal), { insights: [] });
  const preview = await previewPersonalInsight(f.personal, f.selection);
  await assert.rejects(readdir(f.personal), { code: 'ENOENT' });
  assert.equal(preview.copiedAssets.length, 2);
  assert.equal(preview.copiedAssets[1].availability, 'unavailable');
  const result = await savePersonalInsight(f.personal, {
    ...f.selection,
    selectionHash: preview.selectionHash,
  });
  assert.deepEqual(await readFile(sourcePath), original);
  const saved = await readPersonalInsight(f.personal, result.id);
  assert.equal(saved.sources[0].sha256, digest(original));
  assert.deepEqual(
    saved.sources[0].evidence.map((e) => e.eventId),
    ['tight', 'wide'],
  );
  assert.equal(saved.sources[0].evidence[1].role, 'conflicting');
  await rm(f.project, { recursive: true });
  const imported = await importPersonalInsight(
    f.personal,
    result.id,
    f.target,
    { relevance: 'Review current table density against its own brief.' },
  );
  assert.equal(imported.draft.status, 'tentative');
  assert.equal(imported.draft.requiresProjectReview, true);
  assert.deepEqual(
    JSON.parse(await readFile(imported.draftPath, 'utf8')).snapshot,
    saved,
  );
  assert.equal(imported.draft.snapshot, undefined);
  assert.equal(JSON.stringify(preview).includes('contentBase64'), false);
  assert.equal(
    Buffer.from(
      saved.sources[0].evidence[0].artifacts[0].contentBase64,
      'base64',
    ).toString(),
    'Synthetic dense table spacing reference',
  );
  const personalBytes = await readFile(result.snapshotPath);
  await writeFile(imported.draftPath, 'Project edits');
  assert.deepEqual(await readFile(result.snapshotPath), personalBytes);
  const target2 = join(f.root, 'target2');
  await mkdir(target2);
  const replay = await importPersonalInsight(f.personal, result.id, target2, {
    revision: 1,
    relevance: 'Second brief',
  });
  assert.deepEqual(
    JSON.parse(await readFile(replay.draftPath, 'utf8')).snapshot,
    saved,
  );
  await assert.rejects(
    importPersonalInsight(f.personal, result.id, target2, {
      relevance: 'Do not overwrite',
    }),
    { code: 'EEXIST' },
  );
});
test('multi-source synthesis retains different contexts and contradictory evidence', async (t) => {
  const second = await fixture(t);
  const f = await fixture(t),
    a = f.selection.sources[0];
  await savePersonalInsight(f.personal, {
    ...f.selection,
    sources: [
      { ...a, evidence: [a.evidence[0]] },
      {
        ...a,
        project: second.project,
        label: 'Synthetic hero',
        context: 'Spacious marketing layout',
        evidence: [a.evidence[1]],
      },
    ],
  });
  const saved = await readPersonalInsight(f.personal, f.selection.id);
  assert.equal(saved.sources.length, 2);
  assert.equal(saved.sources[1].evidence[0].role, 'conflicting');
  assert.notEqual(saved.sources[0].context, saved.sources[1].context);
});
test('unavailable revisions require explicit gap; review and preview hash are enforced', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    savePersonalInsight(f.personal, { ...f.selection, reviewed: false }),
    /human-reviewed/,
  );
  const missing = {
    ...f.selection,
    sources: [{ ...f.selection.sources[0], revision: 99, evidence: [] }],
  };
  await assert.rejects(savePersonalInsight(f.personal, missing), {
    code: 'ENOENT',
  });
  await savePersonalInsight(f.personal, {
    ...missing,
    sources: [
      {
        ...missing.sources[0],
        gapReason:
          'Reviewer explicitly proceeds with this unavailable source recorded as a gap.',
      },
    ],
  });
  assert.match(
    (await readPersonalInsight(f.personal, f.selection.id)).sources[0]
      .gapReason,
    /Reviewer/,
  );
  const preview = await previewPersonalInsight(f.personal, f.selection);
  await assert.rejects(
    savePersonalInsight(f.personal, {
      ...f.selection,
      finding: 'Changed',
      selectionHash: preview.selectionHash,
    }),
    /changed since preview/,
  );
});
test('competing revisions and failed copies leave previous snapshots intact', async (t) => {
  const f = await fixture(t),
    first = await savePersonalInsight(f.personal, f.selection);
  const original = await readFile(first.snapshotPath);
  const next = {
    ...f.selection,
    expectedRevision: 1,
    finding: 'Revised spacing finding',
  };
  const results = await Promise.allSettled([
    savePersonalInsight(f.personal, next),
    savePersonalInsight(f.personal, next),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.deepEqual(await readFile(first.snapshotPath), original);
  assert.equal(
    (await readPersonalInsight(f.personal, first.id, 1)).finding,
    f.selection.finding,
  );
  const asset = join(f.project, '.incline/feedback/spacing/assets/table.txt');
  await writeFile(asset, 'corruption');
  await assert.rejects(
    savePersonalInsight(f.personal, { ...f.selection, expectedRevision: 2 }),
    /artifact hash mismatch/,
  );
  assert.deepEqual((await readdir(join(f.personal, first.id))).sort(), [
    '1.json',
    '2.json',
  ]);
  await rm(asset);
  await savePersonalInsight(f.personal, {
    ...f.selection,
    expectedRevision: 2,
  });
  assert.equal(
    (await readPersonalInsight(f.personal, first.id)).sources[0].evidence[0]
      .artifacts[0].availability,
    'snapshot-missing',
  );
  assert.equal(
    (await listPersonalInsights(f.personal)).insights[0].revision,
    3,
  );
});
test('source record, pinned source insight, snapshot envelope and asset hash corruption reject', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    savePersonalInsight(f.personal, {
      ...f.selection,
      sources: [{ ...f.selection.sources[0], sha256: '0'.repeat(64) }],
    }),
    /insight hash mismatch/,
  );
  const result = await savePersonalInsight(f.personal, f.selection);
  const record = join(f.project, '.incline/feedback/spacing/record.json');
  await writeFile(record, (await readFile(record, 'utf8')) + ' ');
  await assert.rejects(
    savePersonalInsight(f.personal, f.selection),
    /evidence hash mismatch/,
  );
  const envelope = JSON.parse(await readFile(result.snapshotPath, 'utf8'));
  envelope.snapshot.finding = 'tampered';
  await writeFile(result.snapshotPath, JSON.stringify(envelope));
  await assert.rejects(
    importPersonalInsight(f.personal, result.id, f.target, {
      relevance: 'Brief',
    }),
    /integrity/,
  );
  envelope.snapshot.sources[0].evidence[0].artifacts[0].contentBase64 =
    Buffer.from('tampered').toString('base64');
  envelope.sha256 = digest(JSON.stringify(envelope.snapshot));
  await writeFile(result.snapshotPath, JSON.stringify(envelope));
  await assert.rejects(
    readPersonalInsight(f.personal, result.id),
    /asset hash mismatch/,
  );
  await assert.rejects(readdir(join(f.target, '.incline')), { code: 'ENOENT' });
});
test('unsafe IDs, unrelated evidence, symlinks and local-only access reject', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    savePersonalInsight(f.personal, { ...f.selection, id: '../escape' }),
    /Unsafe/,
  );
  await assert.rejects(
    savePersonalInsight(f.personal, {
      ...f.selection,
      sources: [
        {
          ...f.selection.sources[0],
          evidence: [
            { batchId: 'spacing', eventId: 'push', role: 'supporting' },
          ],
        },
      ],
    }),
    /must be linked/,
  );
  const linked = join(f.root, 'linked');
  await symlink(f.project, linked);
  await assert.rejects(
    savePersonalInsight(f.personal, {
      ...f.selection,
      sources: [{ ...f.selection.sources[0], project: linked }],
    }),
    /Symlinks/,
  );
  await symlink(f.target, f.personal);
  await assert.rejects(
    savePersonalInsight(f.personal, f.selection),
    /Symlinks/,
  );
  await rm(f.personal);
  const asset = join(f.project, '.incline/feedback/spacing/assets/table.txt');
  await rm(asset);
  await symlink(join(f.project, 'spacing.txt'), asset);
  await assert.rejects(
    savePersonalInsight(f.personal, f.selection),
    /Symlinks/,
  );
  for (const action of [
    () => listPersonalInsights(null),
    () => previewPersonalInsight(null, f.selection),
    () => savePersonalInsight(null, f.selection),
    () =>
      importPersonalInsight(null, f.selection.id, f.target, {
        relevance: 'Brief',
      }),
  ])
    await assert.rejects(action(), /local-only/);
});
test('CLI personal preview/save/list/import works and local-only stays local', async (t) => {
  const f = await fixture(t),
    run = promisify(execFile),
    cli =
      process.env.INCLINE_INSIGHTS_TEST_CLI ??
      new URL('./insights-cli.mjs', import.meta.url).pathname;
  const input = join(f.root, 'selection.json');
  await writeFile(input, JSON.stringify(f.selection));
  const args = ['--personal-dir', f.personal, '--project', f.target];
  const preview = JSON.parse(
    (
      await run(process.execPath, [
        cli,
        'personal-preview',
        '--input',
        input,
        ...args,
      ])
    ).stdout,
  );
  assert.equal(preview.operation, 'preview');
  await run(process.execPath, [
    cli,
    'personal-save',
    '--input',
    input,
    ...args,
  ]);
  assert.equal(
    JSON.parse(
      (await run(process.execPath, [cli, 'personal-list', ...args])).stdout,
    ).insights.length,
    1,
  );
  assert.equal(
    JSON.parse(
      (
        await run(process.execPath, [
          cli,
          'personal-import',
          '--id',
          f.selection.id,
          '--revision',
          '1',
          '--relevance',
          'Current brief',
          ...args,
        ])
      ).stdout,
    ).draft.status,
    'tentative',
  );
  await assert.rejects(
    run(process.execPath, [cli, 'personal-list', '--local-only']),
    /local-only/,
  );
  await assert.rejects(
    run(process.execPath, [cli, 'personal-list', '--library-dir', f.personal]),
    /personal-dir/,
  );
  assert.deepEqual(
    JSON.parse(
      (
        await run(process.execPath, [
          cli,
          'read',
          '--local-only',
          '--project',
          f.target,
        ])
      ).stdout,
    ).insights,
    [],
  );
});

test('selected source metadata, artifact traversal and unsupported personal snapshot shapes reject', async (t) => {
  const f = await fixture(t);
  const recordPath = join(f.project, '.incline/feedback/spacing/record.json');
  const insightPath = join(f.project, '.incline/insights/spacing/1.json');
  const originalRecord = JSON.parse(await readFile(recordPath, 'utf8'));
  const originalInsight = JSON.parse(await readFile(insightPath, 'utf8'));
  async function replaceRecord(record) {
    const raw = JSON.stringify(record);
    await writeFile(recordPath, raw);
    const insight = structuredClone(originalInsight);
    for (const key of ['supportingEvidence', 'conflictingEvidence'])
      for (const ref of insight[key]) ref.recordHash = digest(raw);
    await writeFile(insightPath, JSON.stringify(insight));
  }
  const traversal = structuredClone(originalRecord);
  traversal.artifacts[0].snapshot = '../spacing.txt';
  await replaceRecord(traversal);
  await assert.rejects(
    savePersonalInsight(f.personal, f.selection),
    /Unsafe artifact path/,
  );
  const invalidEvent = structuredClone(originalRecord);
  invalidEvent.events[0].context = null;
  await replaceRecord(invalidEvent);
  await assert.rejects(
    savePersonalInsight(f.personal, f.selection),
    /Invalid feedback: context/,
  );
  await replaceRecord(originalRecord);
  const saved = await savePersonalInsight(f.personal, f.selection);
  const envelope = JSON.parse(await readFile(saved.snapshotPath, 'utf8'));
  envelope.snapshot.unrecognized = 'unsupported';
  envelope.sha256 = digest(JSON.stringify(envelope.snapshot));
  await writeFile(saved.snapshotPath, JSON.stringify(envelope));
  await assert.rejects(
    readPersonalInsight(f.personal, saved.id),
    /Invalid selection fields/,
  );
  delete envelope.snapshot.unrecognized;
  envelope.snapshot.sources[0].evidence[0].event.context = null;
  envelope.sha256 = digest(JSON.stringify(envelope.snapshot));
  await writeFile(saved.snapshotPath, JSON.stringify(envelope));
  await assert.rejects(
    readPersonalInsight(f.personal, saved.id),
    /Invalid feedback: context/,
  );
});

test('import rejects symlinked project destination while leaving personal data untouched', async (t) => {
  const f = await fixture(t);
  const saved = await savePersonalInsight(f.personal, f.selection);
  const original = await readFile(saved.snapshotPath);
  await symlink(f.root, join(f.target, '.incline'));
  await assert.rejects(
    importPersonalInsight(f.personal, saved.id, f.target, {
      relevance: 'Current brief',
    }),
    /Symlinks/,
  );
  assert.deepEqual(await readFile(saved.snapshotPath), original);
});

test('duplicate source artifact references round-trip through personal save, read, list and import', async (t) => {
  const f = await fixture(t, true);
  const saved = await savePersonalInsight(f.personal, f.selection);
  const snapshot = await readPersonalInsight(f.personal, saved.id);
  const bundle = snapshot.sources[0].evidence[0];
  assert.deepEqual(bundle.event.artifactIds, [
    'table',
    'table',
    'missing',
    'missing',
  ]);
  assert.deepEqual(
    bundle.artifacts.map((asset) => asset.id),
    ['table', 'missing'],
  );
  assert.equal(
    (await listPersonalInsights(f.personal)).insights[0].id,
    saved.id,
  );
  const imported = await importPersonalInsight(f.personal, saved.id, f.target, {
    relevance: 'Check spacing against the new table brief',
  });
  const draft = JSON.parse(await readFile(imported.draftPath, 'utf8'));
  assert.deepEqual(draft.snapshot, snapshot);
  assert.equal(
    Buffer.from(
      draft.snapshot.sources[0].evidence[0].artifacts[0].contentBase64,
      'base64',
    ).toString(),
    'Synthetic dense table spacing reference',
  );
});
