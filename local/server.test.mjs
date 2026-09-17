import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  readdir,
  mkdir,
  writeFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { getRounds } from '../lib/taste.ts';

function sample(id = 'one') {
  const answers = [];
  for (let i = 0; i < 12; i++)
    answers.push({
      roundId: getRounds(answers, 2)[i].id,
      choice: 'both',
      reason: 'Keep both available',
    });
  return {
    id,
    catalogVersion: 2,
    name: 'Design project',
    context: 'portfolio',
    exploration: 'surprise',
    answers,
    keep: ['minimal', 'brutalist'],
    explore: ['cinematic'],
    notes: 'Keep legibility',
    complete: true,
    createdAt: '2026-09-17T00:00:00.000Z',
  };
}
function collection(id = 'collection-one') {
  return {
    id,
    catalogVersion: 2,
    name: 'Reference collection',
    context: 'portfolio',
    exploration: 'stretch',
    answers: [],
    keep: [],
    explore: [],
    notes: '',
    complete: false,
    createdAt: '2026-09-17T00:00:00.000Z',
    collection: {
      version: 1,
      description: 'Tactile and calm',
      projectContext: '',
      references: [],
    },
  };
}
async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'incline-test-'));
  const ui = join(root, 'ui');
  await mkdir(ui);
  await writeFile(join(ui, 'index.html'), '<h1>Incline test</h1>');
  const server = await startServer({
    project: root,
    ui,
    closeAfterFinish: false,
    ...options,
  });
  assert.ok(server, 'server must start');
  t.after(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  const request = (path, body, headers = {}) =>
    fetch(server.origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${server.token}`,
        Origin: server.origin,
        'Content-Type': 'application/json',
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { root, ui, server, request };
}
void test('local API requires its token and rejects unrelated web origins', async (t) => {
  const { server, request } = await fixture(t);
  assert.equal((await fetch(server.origin + '/api/boot')).status, 401);
  assert.equal(
    (
      await request(
        '/api/draft',
        { sessions: [sample()] },
        { Origin: 'https://evil.example' },
      )
    ).status,
    403,
  );
  assert.equal((await request('/api/boot')).status, 200);
});
void test('drafts resume without changing the committed profile', async (t) => {
  const { root, server, request, ui } = await fixture(t);
  assert.equal(
    (await request('/api/draft', { sessions: [sample()] })).status,
    200,
  );
  await assert.rejects(readFile(join(root, '.incline', 'profile.md')), {
    code: 'ENOENT',
  });
  await server.close();
  const resumed = await startServer({
    project: root,
    ui,
    closeAfterFinish: false,
  });
  t.after(() => resumed.close());
  const boot = await fetch(resumed.origin + '/api/boot', {
    headers: { Authorization: `Bearer ${resumed.token}` },
  }).then((r) => r.json());
  assert.equal(boot.sessions[0].notes, 'Keep legibility');
});
void test('finish writes profiles and immutable revisions; new sessions preserve prior contexts', async (t) => {
  const { root, request } = await fixture(t);
  const first = await request('/api/finish', {
    sessions: [sample()],
    activeId: 'one',
  });
  assert.equal(first.status, 200);
  const result = await first.json();
  assert.equal(result.status, 'completed');
  const original = await readFile(result.revisionPath, 'utf8');
  const second = {
    ...sample('two'),
    context: 'dashboard',
    notes: 'Keep table density',
  };
  assert.equal(
    (await request('/api/finish', { sessions: [second], activeId: 'two' }))
      .status,
    200,
  );
  const state = JSON.parse(
    await readFile(join(root, '.incline', 'state.json'), 'utf8'),
  );
  assert.equal(state.sessions.length, 2);
  assert.equal(state.sessions[0].notes, 'Keep legibility');
  assert.equal(await readFile(result.revisionPath, 'utf8'), original);
  assert.equal((await readdir(join(root, '.incline', 'revisions'))).length, 2);
  assert.match(
    await readFile(join(root, '.incline', 'profile.md'), 'utf8'),
    /Keep table density/,
  );
  assert.match(
    await readFile(join(root, '.incline', 'profile.md'), 'utf8'),
    /Keep legibility/,
  );
});
void test('invalid browser payloads cannot write arbitrary paths or silently drop records', async (t) => {
  const { root, request } = await fixture(t);
  for (const bad of [
    { ...sample(), id: '../escape' },
    { ...sample(), notes: 'x'.repeat(3001) },
    { ...sample(), answers: [{ roundId: 'fake', choice: 'a', reason: '' }] },
  ]) {
    assert.equal(
      (
        await request('/api/finish', {
          sessions: [sample(), bad],
          activeId: 'one',
        })
      ).status,
      400,
    );
  }
  await assert.rejects(readFile(join(root, '.incline', 'state.json')), {
    code: 'ENOENT',
  });
});
void test('a second local session cannot race writes to the same project', async (t) => {
  const { root, ui } = await fixture(t);
  await assert.rejects(startServer({ project: root, ui }), /already running/);
});
void test('finish acknowledges saved files before shutting down and returning to the agent', async (t) => {
  let completed;
  const { request, server } = await fixture(t, {
    closeAfterFinish: true,
    onFinish: (r) => {
      completed = r;
    },
  });
  const response = await request('/api/finish', {
    sessions: [sample()],
    activeId: 'one',
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(await readFile(result.profilePath, 'utf8'), /Keep legibility/);
  await server.closed;
  assert.equal(completed.status, 'completed');
  await assert.rejects(fetch(server.origin + '/api/boot'));
});
void test('malformed saved state is not overwritten by a fresh session', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'incline-corrupt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.incline'));
  await writeFile(join(root, '.incline', 'state.json'), 'broken');
  await assert.rejects(startServer({ project: root, ui: root }), /saved data/i);
  assert.equal(
    await readFile(join(root, '.incline', 'state.json'), 'utf8'),
    'broken',
  );
});

void test('uploads and serves original raster bytes across a restart', async (t) => {
  const { root, ui, server } = await fixture(t);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const upload = await fetch(server.origin + '/api/assets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${server.token}`,
      Origin: server.origin,
      'Content-Type': 'image/png',
    },
    body: png,
  });
  assert.equal(upload.status, 201);
  const { asset } = await upload.json();
  assert.match(asset, /^[0-9a-f-]+\.png$/);
  const fetched = await fetch(server.origin + `/api/assets/${asset}`, {
    headers: { Authorization: `Bearer ${server.token}` },
  });
  assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), png);
  await server.close();
  const resumed = await startServer({
    project: root,
    ui,
    closeAfterFinish: false,
  });
  t.after(() => resumed.close());
  const afterRestart = await fetch(resumed.origin + `/api/assets/${asset}`, {
    headers: { Authorization: `Bearer ${resumed.token}` },
  });
  assert.deepEqual(Buffer.from(await afterRestart.arrayBuffer()), png);
});

void test('asset API rejects empty, mismatched, oversized, cross-origin, and invalid paths', async (t) => {
  const { server } = await fixture(t);
  const post = (body, type = 'image/png', origin = server.origin) =>
    fetch(server.origin + '/api/assets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${server.token}`,
        Origin: origin,
        'Content-Type': type,
      },
      body,
    });
  assert.equal((await post(Buffer.alloc(0))).status, 400);
  assert.equal((await post(Buffer.from('not png'))).status, 415);
  assert.equal(
    (
      await post(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        'image/svg+xml',
      )
    ).status,
    415,
  );
  assert.equal((await post(Buffer.alloc(8_000_001))).status, 413);
  assert.equal(
    (
      await post(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        'image/png',
        'https://evil.example',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(server.origin + '/api/assets/%2e%2e%2fstate.json', {
        headers: { Authorization: `Bearer ${server.token}` },
      })
    ).status,
    404,
  );
});

void test('description-only collections finish and coexist with old quiz sessions', async (t) => {
  const { root, request } = await fixture(t);
  const item = { ...collection(), complete: true };
  const response = await request('/api/finish', {
    sessions: [sample(), item],
    activeId: item.id,
  });
  assert.equal(response.status, 200);
  const state = JSON.parse(
    await readFile(join(root, '.incline', 'state.json'), 'utf8'),
  );
  assert.equal(state.sessions.length, 2);
  assert.equal(state.sessions[1].collection.description, 'Tactile and calm');
});

void test('draft and finish reject references to missing assets', async (t) => {
  const { request } = await fixture(t);
  const item = collection();
  item.collection.references.push({
    id: 'ref',
    kind: 'image',
    title: 'Missing',
    note: '',
    intent: 'inspiration',
    asset: '64d916c2-331f-4b9e-b8e9-ed048fa7f318.png',
  });
  assert.equal((await request('/api/draft', { sessions: [item] })).status, 400);
  item.complete = true;
  assert.equal(
    (await request('/api/finish', { sessions: [item], activeId: item.id }))
      .status,
    400,
  );
});

void test('JSON import resolves images and Markdown guides, preserves sources, and exposes initialId', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'incline-import-'));
  const ui = join(root, 'ui');
  await mkdir(ui);
  await writeFile(join(ui, 'index.html'), 'test');
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 9]);
  await writeFile(join(root, 'reference.png'), png);
  const guide =
    '# Studio guide\n\nKeep the reading rhythm; change the colour.\n';
  await writeFile(join(root, 'DESIGN.md'), guide);
  const input = join(root, 'import.json');
  await writeFile(
    input,
    JSON.stringify({
      name: 'Seed',
      description: 'Paper texture',
      references: [
        { file: 'reference.png', note: 'Edges' },
        { url: 'https://example.com/work', title: 'Example' },
        {
          file: 'DESIGN.md',
          sourceUrl: 'https://example.com/guide',
          note: 'Only the layout.',
        },
      ],
    }),
  );
  const server = await startServer({
    project: root,
    ui,
    input,
    closeAfterFinish: false,
  });
  t.after(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  const boot = await fetch(server.origin + '/api/boot', {
    headers: { Authorization: `Bearer ${server.token}` },
  }).then((r) => r.json());
  assert.equal(boot.initialId, boot.sessions[0].id);
  assert.equal(boot.sessions[0].collection.references.length, 3);
  const asset = boot.sessions[0].collection.references[0].asset;
  assert.deepEqual(
    await readFile(join(root, '.incline', 'assets', asset)),
    png,
  );
  const importedGuide = boot.sessions[0].collection.references[2];
  assert.equal(importedGuide.kind, 'guide');
  assert.equal(importedGuide.url, 'https://example.com/guide');
  assert.equal(importedGuide.note, 'Only the layout.');
  assert.equal(importedGuide.intent, 'inspiration');
  assert.equal(
    await readFile(
      join(root, '.incline', 'assets', importedGuide.asset),
      'utf8',
    ),
    guide,
  );
  assert.equal(
    JSON.parse(await readFile(join(root, '.incline', 'draft.json'), 'utf8'))
      .sessions[0].name,
    'Seed',
  );
});

void test('bad imports preserve prior state and release the project lock', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'incline-import-bad-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ui = join(root, 'ui');
  await mkdir(join(root, '.incline'), { recursive: true });
  await mkdir(ui);
  await writeFile(join(ui, 'index.html'), 'test');
  const existing = JSON.stringify(
    { version: 1, sessions: [sample()] },
    null,
    2,
  );
  await writeFile(join(root, '.incline', 'draft.json'), existing);
  const input = join(root, 'bad.json');
  await writeFile(
    input,
    JSON.stringify({ references: [{ file: 'missing.png' }] }),
  );
  await assert.rejects(
    startServer({ project: root, ui, input }),
    /ENOENT|import/i,
  );
  assert.equal(
    await readFile(join(root, '.incline', 'draft.json'), 'utf8'),
    existing,
  );
  const server = await startServer({
    project: root,
    ui,
    closeAfterFinish: false,
  });
  await server.close();
});

void test('an import beyond the session limit preserves the prior draft and remains restartable', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'incline-import-limit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ui = join(root, 'ui');
  await mkdir(join(root, '.incline'), { recursive: true });
  await mkdir(ui);
  await writeFile(join(ui, 'index.html'), 'test');
  const existing = JSON.stringify(
    {
      version: 1,
      sessions: Array.from({ length: 100 }, (_, index) =>
        collection(`existing-${index}`),
      ),
    },
    null,
    2,
  );
  const draftPath = join(root, '.incline', 'draft.json');
  await writeFile(draftPath, existing);
  const input = join(root, 'valid.json');
  await writeFile(input, JSON.stringify({ description: 'One too many' }));

  await assert.rejects(
    startServer({ project: root, ui, input }),
    /Invalid session collection/,
  );
  assert.equal(await readFile(draftPath, 'utf8'), existing);

  const server = await startServer({
    project: root,
    ui,
    closeAfterFinish: false,
  });
  const boot = await fetch(server.origin + '/api/boot', {
    headers: { Authorization: `Bearer ${server.token}` },
  }).then((response) => response.json());
  assert.equal(boot.sessions.length, 100);
  await server.close();
});

void test('ordinary saves reject a merged snapshot beyond the session limit', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'incline-save-limit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ui = join(root, 'ui');
  await mkdir(join(root, '.incline'), { recursive: true });
  await mkdir(ui);
  await writeFile(join(ui, 'index.html'), 'test');
  const existing = JSON.stringify({
    version: 1,
    sessions: Array.from({ length: 100 }, (_, index) =>
      collection(`existing-${index}`),
    ),
  });
  const draftPath = join(root, '.incline', 'draft.json');
  await writeFile(draftPath, existing);
  const server = await startServer({
    project: root,
    ui,
    closeAfterFinish: false,
  });
  const response = await fetch(server.origin + '/api/draft', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${server.token}`,
      Origin: server.origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessions: [collection('one-too-many')] }),
  });
  assert.equal(response.status, 400);
  assert.equal(await readFile(draftPath, 'utf8'), existing);
  await server.close();
});

void test('a design guide retains its original text, source and qualified feedback after finish and restart', async (t) => {
  const { root, ui, server, request } = await fixture(t);
  const original =
    '# Field notes\r\n\r\nUse expressive typography — 留白.\r\n<script>not executable</script>\r\n';
  const upload = await fetch(server.origin + '/api/assets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${server.token}`,
      Origin: server.origin,
      'Content-Type': 'text/markdown',
    },
    body: original,
  });
  assert.equal(upload.status, 201);
  const { asset } = await upload.json();
  const item = collection('with-guide');
  item.complete = true;
  item.collection.description = '';
  item.collection.references.push({
    id: 'guide',
    kind: 'guide',
    asset,
    url: 'https://example.com/design',
    title: 'Field notes',
    note: 'The type, but not the muted palette.',
    intent: 'inspiration',
  });
  const finished = await request('/api/finish', {
    sessions: [sample(), item],
    activeId: item.id,
  });
  assert.equal(finished.status, 200);
  const { profilePath, revisionPath } = await finished.json();
  const revision = await readFile(revisionPath, 'utf8');
  const handoff = await readFile(profilePath, 'utf8');
  assert.ok(handoff.includes(`.incline/assets/${asset}`));
  assert.ok(handoff.includes(item.collection.references[0].url));
  assert.ok(handoff.includes(item.collection.references[0].note));
  await server.close();
  const resumed = await startServer({
    project: root,
    ui,
    closeAfterFinish: false,
  });
  t.after(() => resumed.close());
  const headers = { Authorization: `Bearer ${resumed.token}` };
  const boot = await fetch(resumed.origin + '/api/boot', { headers }).then(
    (r) => r.json(),
  );
  assert.deepEqual(
    boot.sessions.find((s) => s.id === item.id),
    item,
  );
  const file = await fetch(resumed.origin + `/api/assets/${asset}`, {
    headers,
  });
  assert.match(file.headers.get('content-type'), /^text\/plain/);
  assert.equal(await file.text(), original);
  assert.equal(
    (await fetch(resumed.origin + `/api/assets/${asset}`)).status,
    401,
  );
  assert.equal(await readFile(revisionPath, 'utf8'), revision);
});

void test('guide uploads reject invalid UTF-8, binary, blank and oversized documents', async (t) => {
  const { server, request } = await fixture(t);
  for (const [body, expected] of [
    [Buffer.from([0xff, 0xfe, 0x41]), 415],
    [Buffer.from('some\0binary'), 415],
    [Buffer.from(' \n\t '), 415],
    [Buffer.alloc(0), 400],
    [Buffer.from('x'.repeat(200_001)), 413],
  ]) {
    const response = await fetch(server.origin + '/api/assets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${server.token}`,
        Origin: server.origin,
        'Content-Type': 'text/markdown; charset=utf-8',
      },
      body,
    });
    assert.equal(response.status, expected);
  }
  const item = collection('missing-guide');
  item.collection.references.push({
    id: 'missing',
    kind: 'guide',
    title: '',
    note: '',
    intent: 'inspiration',
    asset: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.md',
  });
  assert.equal((await request('/api/draft', { sessions: [item] })).status, 400);
});
