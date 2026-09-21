import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  readdir,
  symlink,
  utimes,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { saveInsight } from './insights.mjs';
import { rebuildKnowledge, queryKnowledge } from './knowledge.mjs';

async function fixture(t) {
  const project = await mkdtemp(join(tmpdir(), 'incline-knowledge-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  const batch = join(project, '.incline/feedback/batch');
  await mkdir(join(batch, 'assets'), { recursive: true });
  await writeFile(
    join(batch, 'assets/screen.png'),
    'original screenshot bytes',
  );
  await writeFile(
    join(batch, 'record.json'),
    JSON.stringify({
      version: 1,
      id: 'batch',
      coverage: { source: 'test', limitations: [] },
      artifacts: [],
      events: [
        {
          id: 'gap',
          kind: 'directed-edit',
          evidence: 'verbatim',
          text: 'Keep related controls close.',
        },
        {
          id: 'conflict',
          kind: 'directed-edit',
          evidence: 'verbatim',
          text: 'Give separate sections breathing room.',
        },
      ],
    }),
  );
  const input = {
    id: 'spacing',
    aspect: 'spacing',
    scope: 'Lesson controls',
    finding: 'Keep related controls close while separating sections',
    status: 'tentative',
    qualifications: ['Do not enlarge every gap'],
    openQuestions: ['Does this apply on small screens?'],
    supportingEvidence: [{ batchId: 'batch', eventId: 'gap' }],
    conflictingEvidence: [{ batchId: 'batch', eventId: 'conflict' }],
    expectedRevision: 0,
  };
  await saveInsight(project, input);
  return { project, input };
}
async function tree(path) {
  const result = {};
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) await visit(child);
      else
        result[child.slice(path.length)] = (await readFile(child)).toString(
          'base64',
        );
    }
  }
  await visit(path);
  return result;
}

test('missing cache query is read-only and returns scoped findings, exceptions and exact evidence', async (t) => {
  const { project } = await fixture(t);
  const before = await tree(project);
  const result = await queryKnowledge(project, {
    query: 'SPACING controls',
    aspect: 'spacing',
    scope: 'Lesson controls',
  });
  assert.equal(result.freshness, 'missing');
  assert.equal(result.source, 'insights');
  assert.equal(result.results[0].matchStrength, 'all-tokens');
  assert.equal(result.results[0].conflictingEvidence[0].eventId, 'conflict');
  assert.equal(result.results[0].qualifications[0], 'Do not enlarge every gap');
  assert.equal(result.results[0].topicPath, undefined);
  assert.deepEqual(await tree(project), before);
});
test('rebuild is deterministic, preserves sources, and links readable topic projections', async (t) => {
  const { project } = await fixture(t);
  const original = await tree(join(project, '.incline'));
  const first = await rebuildKnowledge(project);
  const firstIndex = await readFile(first.indexPath, 'utf8');
  const firstTopic = await readFile(first.topicPaths[0], 'utf8');
  const second = await rebuildKnowledge(project);
  assert.equal(await readFile(second.indexPath, 'utf8'), firstIndex);
  assert.equal(await readFile(second.topicPaths[0], 'utf8'), firstTopic);
  assert.match(firstTopic, /Do not enlarge every gap/);
  assert.match(firstTopic, /Conflicting evidence/);
  assert.match(firstTopic, /batch\/conflict/);
  assert.match(firstTopic, /artifact availability/);
  const after = await tree(join(project, '.incline'));
  for (const [path, bytes] of Object.entries(original))
    assert.equal(after[path], bytes);
  const result = await queryKnowledge(project, { query: 'spacing' });
  assert.equal(result.freshness, 'current');
  assert.equal(result.source, 'index');
  assert.equal(result.results[0].topicPath, second.topicPaths[0]);
  assert.match(
    await readFile(result.results[0].revisionPath, 'utf8'),
    /"revision": 1/,
  );
});
test('new, removed, edited and superseded source revisions invalidate projections', async (t) => {
  const { project, input } = await fixture(t);
  await rebuildKnowledge(project);
  await saveInsight(project, {
    ...input,
    expectedRevision: 1,
    finding: 'Changed controls finding',
  });
  let result = await queryKnowledge(project);
  assert.equal(result.freshness, 'stale');
  assert.equal(result.results[0].revision, 2);
  assert.equal(result.results[0].topicPath, undefined);
  await rebuildKnowledge(project);
  const sourcePath = result.results[0].revisionPath;
  const original = await readFile(sourcePath, 'utf8');
  await writeFile(
    sourcePath,
    original.replace('Changed controls finding', 'Revised controls finding'),
  );
  await utimes(sourcePath, new Date(0), new Date(0));
  result = await queryKnowledge(project);
  assert.equal(result.freshness, 'stale');
  assert.equal(result.results[0].finding, 'Revised controls finding');
  await saveInsight(project, {
    ...input,
    expectedRevision: 2,
    status: 'superseded',
  });
  await rebuildKnowledge(project);
  assert.equal((await queryKnowledge(project)).results.length, 0);
  await saveInsight(project, { ...input, id: 'new' });
  assert.equal((await queryKnowledge(project)).freshness, 'stale');
  await rebuildKnowledge(project);
  await rm(join(project, '.incline/insights/new'), { recursive: true });
  result = await queryKnowledge(project);
  assert.equal(result.freshness, 'stale');
  assert.equal(result.results.length, 0);
});
test('damaged projections fall back without repair and authoritative corruption is never hidden', async (t) => {
  const { project } = await fixture(t);
  for (const part of ['index', 'topic', 'pointer', 'navigation']) {
    const built = await rebuildKnowledge(project);
    const path = {
      index: built.indexPath,
      topic: built.topicPaths[0],
      pointer: join(project, '.incline/knowledge/current.json'),
      navigation: built.indexMarkdownPath,
    }[part];
    await writeFile(path, 'broken');
    const before = await tree(project);
    const result = await queryKnowledge(project, { query: 'spacing' });
    assert.equal(result.freshness, 'corrupt', part);
    assert.equal(result.source, 'insights');
    assert.equal(result.results[0].id, 'spacing');
    assert.deepEqual(await tree(project), before);
  }
  const built = await rebuildKnowledge(project);
  const pointer = await readFile(
    join(project, '.incline/knowledge/current.json'),
  );
  await writeFile(join(project, '.incline/insights/spacing/1.json'), '{}');
  await assert.rejects(queryKnowledge(project));
  await assert.rejects(rebuildKnowledge(project));
  assert.deepEqual(
    await readFile(join(project, '.incline/knowledge/current.json')),
    pointer,
  );
  assert.match(
    await readFile(built.indexPath, 'utf8'),
    /Keep related controls/,
  );
});
test('retrieval is bounded, lexical, normalized, deterministic and honest about partial/no matches', async (t) => {
  const { project, input } = await fixture(t);
  for (let i = 0; i < 22; i++)
    await saveInsight(project, {
      ...input,
      id: `other-${String(i).padStart(2, '0')}`,
      aspect: 'colour',
      scope: 'Marketing',
      finding: 'Muted colours with contrast',
    });
  await rebuildKnowledge(project);
  const focused = await queryKnowledge(project, {
    query: 'ＳＰＡＣＩＮＧ controls unknown',
  });
  assert.equal(focused.totalMatches, 1);
  assert.equal(focused.results[0].matchStrength, 'partial');
  assert.deepEqual(focused.results[0].matchedTokens, ['spacing', 'controls']);
  assert.match(focused.results[0].matchReasons.join(' '), /aspect: spacing/);
  assert.equal(
    (await queryKnowledge(project, { query: 'astronomy' })).totalMatches,
    0,
  );
  assert.equal(
    (await queryKnowledge(project, { query: '!!!' })).totalMatches,
    0,
  );
  assert.equal(
    (await queryKnowledge(project, { aspect: 'Spacing' })).totalMatches,
    0,
  );
  assert.equal(
    (await queryKnowledge(project, { scope: 'Lesson controls' })).totalMatches,
    1,
  );
  const bounded = await queryKnowledge(project, {
    query: 'colours',
    limit: 20,
  });
  assert.equal(bounded.totalMatches, 22);
  assert.equal(bounded.results.length, 20);
  assert.equal(bounded.results[0].id, 'other-00');
  await assert.rejects(queryKnowledge(project, { limit: 21 }), /limit/);
  await assert.rejects(queryKnowledge(project, { limit: 0 }), /limit/);
});
test('free-text aspects use safe filenames and escaped Markdown while incomplete generations are ignored', async (t) => {
  const { project, input } = await fixture(t);
  await saveInsight(project, {
    ...input,
    id: 'odd',
    aspect: '../<script>[bad](file:///tmp)',
  });
  const built = await rebuildKnowledge(project);
  assert.equal(built.topicPaths.length, 2);
  for (const path of built.topicPaths)
    assert.match(path, /topics\/[a-f0-9]{64}\.md$/);
  const odd = await queryKnowledge(project, {
    aspect: '../<script>[bad](file:///tmp)',
  });
  const topic = await readFile(odd.results[0].topicPath, 'utf8');
  assert.ok(!topic.includes('<script>'));
  // An abandoned generation must never become visible through the pointer.
  const incomplete = join(
    dirname(dirname(built.indexPath)),
    '00000000-0000-0000-0000-000000000000',
  );
  await mkdir(incomplete);
  await writeFile(join(incomplete, 'index.json'), '{}');
  const result = await queryKnowledge(project, { aspect: input.aspect });
  assert.equal(result.freshness, 'current');
  assert.equal(result.results[0].id, input.id);
});
test('rebuild rejects symlink output boundaries before writing outside the project', async (t) => {
  const { project } = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'incline-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, join(project, '.incline/knowledge'));
  await assert.rejects(rebuildKnowledge(project), /real directory/);
  assert.deepEqual(await readdir(outside), []);
});

test('opposing findings remain separate by context and return their qualifications', async (t) => {
  const { project, input } = await fixture(t);
  await saveInsight(project, {
    ...input,
    id: 'marketing-spacing',
    scope: 'Marketing sections',
    finding: 'Use generous spacing around standalone sections',
    qualifications: ['Do not apply this to dense lesson controls'],
  });
  await rebuildKnowledge(project);
  const both = await queryKnowledge(project, { query: 'spacing' });
  assert.equal(both.results.length, 2);
  assert.deepEqual(
    new Set(both.results.map((entry) => entry.scope)),
    new Set(['Lesson controls', 'Marketing sections']),
  );
  const selected = await queryKnowledge(project, {
    query: 'spacing',
    scope: 'Marketing sections',
  });
  assert.equal(selected.results.length, 1);
  assert.equal(selected.results[0].id, 'marketing-spacing');
  assert.equal(
    selected.results[0].qualifications[0],
    'Do not apply this to dense lesson controls',
  );
});

test('publication failure cleans incomplete output and preserves the previous generation', async (t) => {
  const { project } = await fixture(t);
  const built = await rebuildKnowledge(project);
  const root = join(project, '.incline/knowledge');
  const pointerPath = join(root, 'current.json');
  const pointerBytes = await readFile(pointerPath);
  const previousGeneration = await tree(dirname(built.indexPath));
  const originalGenerations = await readdir(join(root, 'generations'));

  // A directory at the pointer destination forces failure after all output
  // files and the temporary pointer have been written, at atomic publication.
  await rm(pointerPath);
  await mkdir(pointerPath);
  await assert.rejects(rebuildKnowledge(project), (error) =>
    ['EISDIR', 'ENOTEMPTY', 'EEXIST', 'EPERM'].includes(error.code),
  );
  assert.deepEqual(await tree(dirname(built.indexPath)), previousGeneration);
  assert.deepEqual(
    await readdir(join(root, 'generations')),
    originalGenerations,
  );
  assert.deepEqual((await readdir(root)).sort(), [
    'current.json',
    'generations',
  ]);

  await rm(pointerPath, { recursive: true });
  await writeFile(pointerPath, pointerBytes);
  const result = await queryKnowledge(project, { query: 'spacing' });
  assert.equal(result.freshness, 'current');
  assert.equal(result.results[0].id, 'spacing');
  assert.equal(result.results[0].topicPath, built.topicPaths[0]);
});
