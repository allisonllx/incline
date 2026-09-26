import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { createPromptStore } from './prompts.mjs';
import { savePromptSettings } from './prompt-settings.mjs';

const png = Buffer.from('89504e470d0a1a0a', 'hex');
async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'incline-prompt-api-'));
  const ui = join(root, 'ui');
  await mkdir(ui);
  await writeFile(join(ui, 'index.html'), '<h1>Test</h1>');
  const personal = join(root, 'personal-prompts');
  const server = await startServer({
    project: root,
    ui,
    closeAfterFinish: false,
    promptLibraryDirectory: personal,
    ...options,
  });
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
  return { root, personal, server, request };
}

test('prompt API stays behind the local token and origin gate', async (t) => {
  const { personal, server, request } = await fixture(t);
  assert.equal((await fetch(server.origin + '/api/prompts')).status, 401);
  assert.equal(
    (
      await request('/api/prompts', undefined, {
        Origin: 'https://elsewhere.example',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        '/api/prompts/save',
        {
          scope: 'project',
          changes: { title: 'A', prompt: 'B', origin: 'user-authored' },
        },
        { Origin: 'https://elsewhere.example' },
      )
    ).status,
    403,
  );
  assert.deepEqual((await (await request('/api/prompts')).json()).entries, []);
  await assert.rejects(stat(personal), { code: 'ENOENT' });
});

test('create, metadata query, source preview, revision edit, and independent personal copy', async (t) => {
  const { root, personal, request } = await fixture(t);
  const createdResponse = await request('/api/prompts/save', {
    scope: 'project',
    changes: {
      title: 'Reveal',
      prompt: 'Use a slow reveal',
      origin: 'user-authored',
      source: { url: 'https://example.com/reference' },
      tags: [{ facet: 'medium', value: 'live frontend', provenance: 'user' }],
    },
    uploads: [
      {
        id: 'source-image',
        contentType: 'image/png',
        base64: png.toString('base64'),
      },
    ],
  });
  assert.equal(createdResponse.status, 201);
  const { entry } = await createdResponse.json();
  assert.equal(entry.revision, 1);
  const query = await (
    await request(
      '/api/prompts?scope=project&text=Reveal&tag=medium:live%20frontend',
    )
  ).json();
  assert.equal(query.entries.length, 1);
  assert.equal(
    (
      await (
        await request(
          '/api/prompts?scope=project&tag=medium:%20live%20frontend',
        )
      ).json()
    ).entries.length,
    1,
  );
  assert.equal(
    (
      await (
        await request('/api/prompts?scope=project&tag=live%20frontend')
      ).json()
    ).entries.length,
    1,
  );
  assert.equal(
    (
      await (
        await request(
          '/api/prompts?scope=project&text=Reveal&tag=medium:%20live%20frontend',
        )
      ).json()
    ).entries.length,
    1,
  );
  const preview = await request(
    `/api/prompts/${entry.id}/assets/source-image?revision=1`,
  );
  assert.equal(preview.status, 200);
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), png);
  assert.equal(preview.headers.get('content-type'), 'image/png');

  const changed = await request('/api/prompts/save', {
    scope: 'project',
    id: entry.id,
    baseRevision: 1,
    changes: { title: 'Reveal refined', prompt: 'Use a careful reveal' },
  });
  assert.equal(changed.status, 201);
  const revised = (await changed.json()).entry;
  assert.equal(revised.revision, 2);
  assert.equal(revised.assets[0].sha256, entry.assets[0].sha256);
  assert.equal(revised.source.url, 'https://example.com/reference');
  assert.equal(
    (
      await request('/api/prompts/save', {
        scope: 'project',
        id: entry.id,
        baseRevision: 1,
        changes: { title: 'Stale' },
      })
    ).status,
    409,
  );
  const copied = await request('/api/prompts/copy', {
    from: 'project',
    to: 'personal',
    id: entry.id,
    revision: 2,
  });
  assert.equal(copied.status, 201);
  const independent = (await copied.json()).entry;
  assert.notEqual(independent.id, entry.id);
  assert.equal(independent.copyOf.id, entry.id);
  assert.equal(
    (await (await request('/api/prompts?scope=personal')).json()).entries
      .length,
    1,
  );
  assert.deepEqual(
    Buffer.from(
      await (
        await request(
          `/api/prompts/${independent.id}/assets/source-image?scope=personal&revision=1`,
        )
      ).arrayBuffer(),
    ),
    png,
  );
  assert.equal(
    await readFile(
      join(
        root,
        '.incline',
        'prompts',
        entry.id,
        'revisions',
        '0001',
        'prompt.txt',
      ),
      'utf8',
    ),
    'Use a slow reveal',
  );
  assert.ok(
    (
      await readFile(
        join(personal, independent.id, 'revisions', '0001', 'prompt.txt'),
        'utf8',
      )
    ).includes('careful'),
  );
});

test('revision editing preserves advanced fields, gaps, recipe, and retained assets', async (t) => {
  const { root, request } = await fixture(t);
  const store = createPromptStore(join(root, '.incline', 'prompts'), {
    projectDirectory: root,
  });
  const original = await store.save({
    title: 'Recipe',
    prompt: 'Do this',
    origin: 'agent-authored',
    source: { contentGap: 'Video unavailable' },
    requirements: { effect: 'Reveal', unknowns: ['Timing unknown'] },
    notes: [{ text: 'Check contrast', provenance: 'agent-hypothesis' }],
    recipe: { stages: [{ id: 'draft', role: 'Make a draft' }] },
    assets: [
      { id: 'still', contentType: 'image/png', bytes: png },
      { id: 'motion', missingReason: 'No retained motion' },
    ],
  });
  const response = await request('/api/prompts/save', {
    scope: 'project',
    id: original.id,
    baseRevision: 1,
    changes: { title: 'Recipe edited' },
  });
  assert.equal(response.status, 201);
  const revised = (await response.json()).entry;
  assert.deepEqual(revised.requirements, original.requirements);
  assert.deepEqual(revised.recipe, original.recipe);
  assert.deepEqual(revised.notes, original.notes);
  assert.deepEqual(revised.source, original.source);
  assert.equal(revised.assets[1].missingReason, 'No retained motion');
  assert.deepEqual((await store.asset(original.id, 2, 'still')).bytes, png);
  assert.equal(
    (await request(`/api/prompts/${original.id}/assets/motion?revision=2`))
      .status,
    404,
  );
  assert.deepEqual(
    (
      await (
        await request(`/api/prompts/${original.id}/runs?revision=2`)
      ).json()
    ).runs,
    [],
  );
});

test('arbitrary path assets and oversized uploads are refused; local-only forbids personal operations', async (t) => {
  const { root, request } = await fixture(t, { promptLibraryDirectory: null });
  const settings = await (await request('/api/prompts/settings')).json();
  assert.equal(settings.personalAvailable, false);
  assert.equal((await request('/api/prompts?scope=personal')).status, 404);
  assert.equal(
    (
      await request('/api/prompts/copy', {
        from: 'project',
        to: 'personal',
        id: crypto.randomUUID(),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request('/api/prompts/settings', {
        personalLookup: true,
        expectedRevision: null,
      })
    ).status,
    404,
  );
  const pathAttempt = await request('/api/prompts/save', {
    scope: 'project',
    changes: {
      title: 'Bad',
      prompt: 'Bad',
      origin: 'user-authored',
      assets: [
        { id: 'leak', path: '/etc/passwd', contentType: 'text/markdown' },
      ],
    },
  });
  assert.equal(pathAttempt.status, 400);
  const oversized = await request('/api/prompts/save', {
    scope: 'project',
    changes: { title: 'Bad', prompt: 'Bad', origin: 'user-authored' },
    uploads: [
      {
        id: 'huge',
        contentType: 'image/png',
        base64: Buffer.alloc(8_000_001).toString('base64'),
      },
    ],
  });
  assert.equal(oversized.status, 413);
  assert.equal(
    (await (await request('/api/prompts')).json()).entries.length,
    0,
  );
  await assert.rejects(
    readFile(join(root, '.incline', 'prompt-settings.json')),
  );
});

test('lookup preference persists with revision checking and launcher-selected directory', async (t) => {
  const { root, personal, request } = await fixture(t);
  const first = await (await request('/api/prompts/settings')).json();
  assert.equal(first.settings.personalLookup, false);
  const enabled = await request('/api/prompts/settings', {
    personalLookup: true,
    expectedRevision: first.settings.revision,
  });
  assert.equal(enabled.status, 200);
  const revision = (await enabled.json()).settings.revision;
  const saved = JSON.parse(
    await readFile(join(root, '.incline', 'prompt-settings.json'), 'utf8'),
  );
  assert.equal(saved.personalDirectory, personal);
  assert.equal(
    (
      await request('/api/prompts/settings', {
        personalLookup: false,
        expectedRevision: null,
      })
    ).status,
    409,
  );
  assert.equal(
    (await (await request('/api/prompts/settings')).json()).settings.revision,
    revision,
  );
});

test('saved consent for a different personal directory is not shown as consent for this launcher', async (t) => {
  const { root, personal, request } = await fixture(t);
  const prior = await savePromptSettings(root, {
    personalLookup: true,
    personalDirectory: join(root, 'old-personal-prompts'),
    expectedRevision: null,
  });
  const current = await (await request('/api/prompts/settings')).json();
  assert.equal(current.settings.personalLookup, false);
  assert.equal(current.settings.directoryChanged, true);
  assert.equal(current.settings.revision, prior.revision);
  const changed = await request('/api/prompts/settings', {
    personalLookup: true,
    expectedRevision: prior.revision,
  });
  assert.equal(changed.status, 200);
  assert.equal(
    (await (await request('/api/prompts/settings')).json()).settings
      .personalLookup,
    true,
  );
  assert.equal(
    JSON.parse(
      await readFile(join(root, '.incline', 'prompt-settings.json'), 'utf8'),
    ).personalDirectory,
    personal,
  );
});
