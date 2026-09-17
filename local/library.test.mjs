import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
  chmod,
  symlink,
  open,
} from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { exportMarkdown, getRounds } from '../lib/taste.ts';

function sample(id = 'source') {
  return {
    id,
    catalogVersion: 2,
    name: 'Studio direction',
    context: 'brand',
    exploration: 'stretch',
    answers: [
      {
        roundId: 'range-1',
        choice: 'both',
        reason: 'Both can work for this client',
      },
    ],
    keep: ['editorial'],
    explore: ['minimal'],
    notes: 'Keep the old masthead for this client only.',
    complete: true,
    createdAt: '2026-09-17T00:00:00.000Z',
    collection: {
      version: 1,
      description: 'A calm reading rhythm',
      projectContext: 'Client A magazine',
      references: [],
    },
  };
}

async function fixture(t, libraryOption) {
  const root = await mkdtemp(join(tmpdir(), 'incline-library-'));
  const library = join(root, 'personal');
  const ui = join(root, 'ui');
  await mkdir(ui);
  await writeFile(join(ui, 'index.html'), 'test');
  const servers = [];
  t.after(async () => {
    await Promise.all(servers.map((server) => server.close()));
    await rm(root, { recursive: true, force: true });
  });
  async function project(name, override = libraryOption) {
    const path = join(root, name);
    await mkdir(path);
    const server = await startServer({
      project: path,
      ui,
      closeAfterFinish: false,
      ...(override === 'default'
        ? {}
        : { libraryDirectory: override === undefined ? library : override }),
    });
    servers.push(server);
    const request = (route, body, extra = {}) =>
      fetch(server.origin + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${server.token}`,
          Origin: server.origin,
          'Content-Type': 'application/json',
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    return { server, path, request };
  }
  return { root, library, project };
}

async function upload(
  project,
  bytes = Buffer.from('# Original guide\r\n\r\nKeep type — 留白.\r\n'),
) {
  const response = await fetch(project.server.origin + '/api/assets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${project.server.token}`,
      Origin: project.server.origin,
      'Content-Type': 'text/markdown',
    },
    body: bytes,
  });
  assert.equal(response.status, 201);
  return { bytes, asset: (await response.json()).asset };
}

async function publish(project, session = sample()) {
  const response = await project.request('/api/library/save', { session });
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()).entry;
}

void test('explicit reuse preserves original evidence and independent project history', async (t) => {
  const { library, project } = await fixture(t);
  const a = await project('a');
  const b = await project('b');
  const { bytes, asset } = await upload(a);
  const session = sample();
  session.collection.references.push({
    id: 'original-guide',
    kind: 'guide',
    title: 'Guide',
    note: 'Only the reading rhythm, not its colours.',
    intent: 'direction',
    asset,
    url: 'https://example.com/guide',
  });
  const finished = await a.request('/api/finish', {
    sessions: [session],
    activeId: session.id,
  });
  assert.equal(finished.status, 200);
  const revisionPath = (await finished.json()).revisionPath;
  const revision = await readFile(revisionPath);
  const entry = await publish(a, session);
  assert.equal(entry.context, 'Client A magazine');
  assert.equal(entry.referenceCount, 1);
  assert.equal(entry.comparisonCount, 1);
  const originalPath = join(library, entry.id, 'snapshot.json');
  const original = await readFile(originalPath);
  const use = await b.request('/api/library/use', { id: entry.id });
  assert.equal(use.status, 201, await use.clone().text());
  const imported = (await use.json()).session;
  assert.notEqual(imported.id, session.id);
  assert.equal(imported.complete, false);
  assert.deepEqual(imported.librarySource, {
    id: entry.id,
    name: session.name,
    context: 'Client A magazine',
  });
  assert.deepEqual(imported.answers, session.answers);
  assert.deepEqual(imported.keep, session.keep);
  assert.equal(imported.notes, session.notes);
  const ref = imported.collection.references[0];
  assert.equal(ref.id, 'original-guide');
  assert.equal(ref.note, session.collection.references[0].note);
  assert.equal(ref.intent, 'inspiration');
  assert.notEqual(ref.asset, asset);
  assert.deepEqual(
    await readFile(join(b.path, '.incline/assets', ref.asset)),
    bytes,
  );
  const receiptDirectory = join(
    b.path,
    '.incline/library-sources',
    imported.id,
  );
  assert.deepEqual(
    await readFile(join(receiptDirectory, 'snapshot.json')),
    original,
  );
  assert.deepEqual(
    await readFile(join(receiptDirectory, 'assets', asset)),
    bytes,
  );
  const receipt = JSON.parse(
    await readFile(join(receiptDirectory, 'receipt.json'), 'utf8'),
  );
  assert.equal(receipt.assetMap[asset], ref.asset);
  imported.notes = 'A different project instruction';
  imported.collection.references[0].note = 'New project note';
  imported.complete = true;
  assert.equal(
    (
      await b.request('/api/finish', {
        sessions: [imported],
        activeId: imported.id,
      })
    ).status,
    200,
  );
  const exported = await readFile(join(b.path, '.incline/profile.md'), 'utf8');
  assert.match(exported, /source context.*review|review.*source context/i);
  assert.ok(
    exported.includes(`.incline/library-sources/${imported.id}/snapshot.json`),
  );
  assert.match(
    exportMarkdown(imported),
    /not.*approved.*this project|review.*keep/i,
  );
  assert.deepEqual(await readFile(originalPath), original);
  assert.deepEqual(await readFile(revisionPath), revision);
  assert.equal(
    (await (await a.request('/api/boot')).json()).sessions[0].notes,
    session.notes,
  );
  assert.equal(
    (await (await b.request('/api/boot')).json()).sessions[0].librarySource.id,
    entry.id,
  );
  const again = (
    await (await b.request('/api/library/use', { id: entry.id })).json()
  ).session;
  assert.notEqual(again.id, imported.id);
  assert.notEqual(again.collection.references[0].asset, ref.asset);
  assert.equal(
    again.collection.references[0].note,
    session.collection.references[0].note,
  );
  assert.equal(
    (await (await b.request('/api/boot')).json()).sessions.length,
    2,
  );
});

void test('boot and empty listing are lazy, with explicit local-only mode and a default personal path', async (t) => {
  const { library, project } = await fixture(t);
  const a = await project('a');
  assert.deepEqual(
    (await (await a.request('/api/boot')).json()).personalLibrary,
    { available: true, directory: library },
  );
  assert.deepEqual(await (await a.request('/api/library')).json(), {
    entries: [],
  });
  await assert.rejects(readdir(library), { code: 'ENOENT' });
  const local = await project('local', null);
  assert.deepEqual(
    (await (await local.request('/api/boot')).json()).personalLibrary,
    { available: false, directory: null },
  );
  for (const [route, body] of [
    ['/api/library', undefined],
    ['/api/library/save', { session: sample() }],
    ['/api/library/use', { id: 'invalid' }],
  ])
    assert.equal((await local.request(route, body)).status, 404);
  const standard = await project('default', 'default');
  assert.deepEqual(
    (await (await standard.request('/api/boot')).json()).personalLibrary,
    { available: true, directory: join(homedir(), '.incline', 'library') },
  );
});

void test('shared routes require a token and every mutation requires the exact origin', async (t) => {
  const { project, library } = await fixture(t);
  const a = await project('a');
  for (const { route, body } of [
    { route: '/api/library/save', body: { session: sample() } },
    {
      route: '/api/library/use',
      body: { id: '00000000-0000-4000-8000-000000000000' },
    },
    { route: '/api/draft', body: { sessions: [sample()] } },
  ]) {
    assert.equal(
      (await a.request(route, body, { Authorization: '' })).status,
      401,
    );
    assert.equal(
      (await a.request(route, body, { Origin: 'https://unrelated.example' }))
        .status,
      403,
    );
    const headers = {
      Authorization: `Bearer ${a.server.token}`,
      'Content-Type': 'application/json',
    };
    assert.equal(
      (
        await fetch(a.server.origin + route, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
      ).status,
      403,
    );
  }
  assert.equal(
    (await a.request('/api/library', undefined, { Authorization: '' })).status,
    401,
  );
  await assert.rejects(readdir(library), { code: 'ENOENT' });
});

void test('simultaneous publications and imports preserve each immutable snapshot and draft', async (t) => {
  const { project, library } = await fixture(t);
  const a = await project('a');
  const b = await project('b');
  const entries = await Promise.all([
    publish(a),
    publish(b, { ...sample('other'), notes: 'Different' }),
    publish(a, { ...sample(), notes: 'Revision two' }),
  ]);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 3);
  assert.equal(
    (await (await a.request('/api/library')).json()).entries.length,
    3,
  );
  const snapshots = await Promise.all(
    entries.map((entry) => readFile(join(library, entry.id, 'snapshot.json'))),
  );
  const uses = await Promise.all(
    entries.map((entry) => a.request('/api/library/use', { id: entry.id })),
  );
  assert.ok(uses.every((response) => response.status === 201));
  const sessions = (await (await a.request('/api/boot')).json()).sessions;
  assert.equal(sessions.length, 3);
  assert.equal(new Set(sessions.map((session) => session.id)).size, 3);
  for (const [i, entry] of entries.entries())
    assert.deepEqual(
      await readFile(join(library, entry.id, 'snapshot.json')),
      snapshots[i],
    );
});

void test('legacy quiz-only snapshots become editable drafts without losing answers or context', async (t) => {
  const { project } = await fixture(t);
  const a = await project('a');
  const session = sample();
  delete session.collection;
  delete session.catalogVersion;
  session.answers = [];
  for (let i = 0; i < 8; i++)
    session.answers.push({
      roundId: getRounds(session.answers)[i].id,
      choice: 'both',
      reason: 'Specific source reason',
    });
  const entry = await publish(a, session);
  const response = await a.request('/api/library/use', { id: entry.id });
  assert.equal(response.status, 201);
  const imported = (await response.json()).session;
  assert.equal(imported.catalogVersion, 1);
  assert.deepEqual(imported.answers, session.answers);
  assert.equal(imported.collection.projectContext, 'brand');
  assert.deepEqual(imported.collection.references, []);
  assert.equal(imported.complete, false);
});

void test('invalid publish data and missing source assets leave the personal library absent', async (t) => {
  const { project, library } = await fixture(t);
  const a = await project('a');
  for (const body of [
    null,
    {},
    { session: { ...sample(), id: '../escape' } },
    { session: sample(), directory: '/tmp/escape' },
    {
      session: {
        ...sample(),
        librarySource: { id: '../escape', name: 'bad', context: '' },
      },
    },
  ])
    assert.equal((await a.request('/api/library/save', body)).status, 400);
  const session = sample();
  session.collection.references.push({
    id: 'missing',
    kind: 'guide',
    title: '',
    note: '',
    intent: 'direction',
    asset: '00000000-0000-4000-8000-000000000000.md',
  });
  assert.equal((await a.request('/api/library/save', { session })).status, 400);
  await assert.rejects(readdir(library), { code: 'ENOENT' });
});

void test('missing or corrupted shared evidence cannot modify the receiving draft or committed state', async (t) => {
  const { project, library } = await fixture(t);
  const a = await project('a');
  const b = await project('b');
  const { bytes, asset } = await upload(a);
  const session = sample();
  session.collection.references.push({
    id: 'guide',
    kind: 'guide',
    asset,
    title: '',
    note: '',
    intent: 'direction',
  });
  const entry = await publish(a, session);
  const finished = await b.request('/api/finish', {
    sessions: [sample('existing')],
    activeId: 'existing',
  });
  assert.equal(finished.status, 200);
  const draftPath = join(b.path, '.incline/draft.json');
  const statePath = join(b.path, '.incline/state.json');
  const draft = await readFile(draftPath);
  const state = await readFile(statePath);
  const directoryBefore = await readdir(join(b.path, '.incline'));
  const unchanged = async () => {
    assert.deepEqual(await readFile(draftPath), draft);
    assert.deepEqual(await readFile(statePath), state);
    assert.deepEqual(await readdir(join(b.path, '.incline')), directoryBefore);
    assert.equal(
      (await (await b.request('/api/boot')).json()).sessions.length,
      1,
    );
  };
  for (const id of ['../escape', null, 1, 'not-a-uuid']) {
    assert.equal((await b.request('/api/library/use', { id })).status, 400);
    await unchanged();
  }
  assert.equal(
    (
      await b.request('/api/library/use', {
        id: '00000000-0000-4000-8000-000000000000',
      })
    ).status,
    404,
  );
  await unchanged();
  const originalPath = join(library, entry.id, 'assets', asset);
  for (const damaged of [
    Buffer.from('# Valid Markdown but changed'),
    Buffer.from([0xff]),
    Buffer.alloc(200_001, 97),
  ]) {
    await writeFile(originalPath, damaged);
    assert.equal(
      (await b.request('/api/library/use', { id: entry.id })).status,
      400,
    );
    await unchanged();
  }
  await rm(originalPath);
  assert.equal(
    (await b.request('/api/library/use', { id: entry.id })).status,
    400,
  );
  await unchanged();
  await writeFile(originalPath, bytes);
  const snapshotPath = join(library, entry.id, 'snapshot.json');
  const snapshot = await readFile(snapshotPath);
  for (const damaged of [
    '{broken',
    'x'.repeat(2_000_001),
    JSON.stringify({
      ...JSON.parse(snapshot),
      session: { ...session, id: '../escape' },
    }),
  ]) {
    await writeFile(snapshotPath, damaged);
    assert.equal(
      (await b.request('/api/library/use', { id: entry.id })).status,
      400,
    );
    await unchanged();
  }
  await writeFile(snapshotPath, snapshot);
  assert.equal(
    (await b.request('/api/library/use', { id: entry.id })).status,
    201,
  );
});

void test('library symlinks cannot follow other project data', async (t) => {
  const { project, library, root } = await fixture(t);
  const a = await project('a');
  const b = await project('b');
  const { asset } = await upload(a);
  const session = sample();
  session.collection.references.push({
    id: 'guide',
    kind: 'guide',
    asset,
    title: '',
    note: '',
    intent: 'direction',
  });
  const entry = await publish(a, session);
  const file = join(library, entry.id, 'assets', asset);
  await rm(file);
  const secret = join(root, 'private.md');
  await writeFile(secret, '# Another project');
  await symlink(secret, file);
  assert.equal(
    (await b.request('/api/library/use', { id: entry.id })).status,
    400,
  );
  await assert.rejects(readFile(join(b.path, '.incline/draft.json')), {
    code: 'ENOENT',
  });
  assert.equal(await readFile(secret, 'utf8'), '# Another project');
});

void test('library permission errors identify the location while preserving existing snapshots', async (t) => {
  if (process.getuid?.() === 0)
    return t.skip('permission checks require an unprivileged user');
  const { project, library } = await fixture(t);
  const a = await project('a');
  const entry = await publish(a);
  const originalPath = join(library, entry.id, 'snapshot.json');
  const original = await readFile(originalPath);
  await chmod(library, 0o500);
  try {
    const response = await a.request('/api/library/save', {
      session: sample(),
    });
    assert.equal(response.status, 500);
    assert.ok((await response.json()).error.includes(library));
    assert.deepEqual(await readdir(library), [entry.id]);
    assert.deepEqual(await readFile(originalPath), original);
  } finally {
    await chmod(library, 0o700);
  }
  await chmod(originalPath, 0);
  try {
    const response = await a.request('/api/library/use', { id: entry.id });
    assert.equal(response.status, 500);
    assert.ok((await response.json()).error.includes(library));
    await assert.rejects(readFile(join(a.path, '.incline/draft.json')), {
      code: 'ENOENT',
    });
  } finally {
    await chmod(originalPath, 0o600);
  }
});

void test('an import failing its final draft write removes the new receipt and copied assets', async (t) => {
  const { project } = await fixture(t);
  const a = await project('a');
  const b = await project('b');
  const { asset } = await upload(a);
  const session = sample();
  session.collection.references.push({
    id: 'guide',
    kind: 'guide',
    asset,
    title: '',
    note: '',
    intent: 'direction',
  });
  const entry = await publish(a, session);
  await mkdir(join(b.path, '.incline/draft.json'));
  const response = await b.request('/api/library/use', { id: entry.id });
  assert.equal(response.status, 500);
  assert.deepEqual(await readdir(join(b.path, '.incline/assets')), []);
  assert.deepEqual(await readdir(join(b.path, '.incline/library-sources')), []);
  assert.deepEqual((await (await b.request('/api/boot')).json()).sessions, []);
  await rm(join(b.path, '.incline/draft.json'), { recursive: true });
  assert.equal(
    (await b.request('/api/library/use', { id: entry.id })).status,
    201,
  );
});

void test('imports at the project session limit fail before creating any asset or receipt', async (t) => {
  const { project } = await fixture(t);
  const a = await project('a');
  const entry = await publish(a);
  const sessions = Array.from({ length: 100 }, (_, i) =>
    sample(`existing-${i}`),
  );
  assert.equal((await a.request('/api/draft', { sessions })).status, 200);
  const draft = await readFile(join(a.path, '.incline/draft.json'));
  assert.equal(
    (await a.request('/api/library/use', { id: entry.id })).status,
    400,
  );
  assert.deepEqual(await readFile(join(a.path, '.incline/draft.json')), draft);
  await assert.rejects(readdir(join(a.path, '.incline/library-sources')), {
    code: 'ENOENT',
  });
});

void test('exported imported comparisons stay qualified by their source context', async (t) => {
  const { project } = await fixture(t);
  const a = await project('a');
  const entry = await publish(a);
  const imported = (
    await (await a.request('/api/library/use', { id: entry.id })).json()
  ).session;
  const markdown = exportMarkdown(imported);
  assert.doesNotMatch(markdown, /These preferences apply to this project\./);
  assert.match(markdown, /source context/);
  assert.match(markdown, /Both can work for this client/);
});

void test('a non-regular library file fails promptly instead of blocking the project write queue', async (t) => {
  const { project, library } = await fixture(t);
  const a = await project('a');
  const entry = await publish(a);
  const snapshot = join(library, entry.id, 'snapshot.json');
  await rm(snapshot);
  await promisify(execFile)('mkfifo', [snapshot]);
  try {
    const response = await fetch(a.server.origin + '/api/library/use', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${a.server.token}`,
        Origin: a.server.origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: entry.id }),
      signal: AbortSignal.timeout(500),
    });
    assert.equal(response.status, 400);
    assert.equal(
      (await a.request('/api/draft', { sessions: [sample()] })).status,
      200,
    );
  } finally {
    // Release a blocked reader if the implementation regresses to a blocking open.
    const writer = await open(
      snapshot,
      constants.O_WRONLY | constants.O_NONBLOCK,
    ).catch(() => null);
    await writer?.close();
  }
});
