import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGetDesign } from './getdesign.mjs';
import { prepareImport } from './import.mjs';

const revision = 'a'.repeat(40);
const api = 'https://api.github.com/repos/VoltAgent/awesome-design-md';
const raw = `https://raw.githubusercontent.com/VoltAgent/awesome-design-md/${revision}`;
const original = '# Editorial study\r\n\r\nExpressive type — 留白.\r\n';
const license = 'MIT License\n\nCopyright (c) 2026 VoltAgent\n';
function upstream(overrides = {}) {
  const responses = {
    [`${api}/git/ref/heads/main`]: {
      object: { type: 'commit', sha: revision },
    },
    [`${raw}/design-md/wired/DESIGN.md`]: original,
    [`${raw}/LICENSE`]: license,
    ...overrides,
  };
  const requests = [];
  const client = createGetDesign({
    fetch: async (url, options) => {
      assert.ok(typeof url === 'string');
      requests.push({ url, options });
      if (!(url in responses)) throw new Error('Unexpected public-source request');
      const value = responses[url];
      if (value instanceof Response) return value;
      return typeof value === 'string'
        ? new Response(value)
        : Response.json(value);
    },
  });
  return { client, requests };
}

void test('fetching a public guide preserves its exact version and license and prepares an unapproved import', async (t) => {
  const project = await mkdtemp(join(tmpdir(), 'incline-source-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  await writeFile(join(project, 'DESIGN.md'), 'Existing project direction');
  const { client, requests } = upstream();
  const result = await client.fetchGuide('wired', { project });
  assert.equal(await readFile(result.guidePath, 'utf8'), original);
  assert.equal(await readFile(result.licensePath, 'utf8'), license);
  assert.equal(result.revision, revision);
  assert.equal(
    result.sourceUrl,
    `https://github.com/VoltAgent/awesome-design-md/blob/${revision}/design-md/wired/DESIGN.md`,
  );
  const provenance = JSON.parse(await readFile(result.provenancePath, 'utf8'));
  assert.equal(provenance.sourceUrl, result.sourceUrl);
  assert.equal(provenance.revision, revision);
  assert.match(provenance.sha256, /^[a-f0-9]{64}$/);
  const input = JSON.parse(await readFile(result.inputPath, 'utf8'));
  input.references[0].note = 'Keep the typography, try a different palette.';
  await writeFile(result.inputPath, JSON.stringify(input));
  const imported = await prepareImport(result.inputPath);
  const ref = imported.session.collection.references[0];
  assert.equal(ref.kind, 'guide');
  assert.equal(ref.intent, 'inspiration');
  assert.equal(ref.note, input.references[0].note);
  assert.equal(ref.url, result.sourceUrl);
  assert.equal(imported.session.complete, false);
  assert.deepEqual(imported.assets[0].bytes, Buffer.from(original));
  assert.equal(
    await readFile(join(project, 'DESIGN.md'), 'utf8'),
    'Existing project direction',
  );
  await assert.rejects(readFile(join(project, '.incline', 'state.json')), {
    code: 'ENOENT',
  });
  assert.ok(
    requests.every((request) => !request.options.headers.Authorization),
  );
  const next = await client.fetchGuide('wired', { project });
  assert.notEqual(next.inputPath, result.inputPath);
  assert.equal(
    JSON.parse(await readFile(result.inputPath, 'utf8')).references[0].note,
    input.references[0].note,
  );
});

void test('catalog search filters public entries by name and description without sending the query upstream', async () => {
  const { client, requests } = upstream({
    [`${api}/contents/design-md?ref=${revision}`]: [
      { type: 'dir', name: 'wired' },
      { type: 'dir', name: 'dell-1996' },
      { type: 'dir', name: '../escape' },
      { type: 'file', name: 'README.md' },
    ],
    [`${raw}/README.md`]: [
      '- [**WIRED**](https://getdesign.md/wired/design-md) - Editorial magazine, expressive serif.',
      '- [**Dell (1996)**](https://getdesign.md/dell-1996/design-md) - Retro computer catalog.',
      '- [**Paid example**](https://getdesign.md/paid/design-md) - Editorial serif.',
    ].join('\n'),
  });
  const result = await client.list('editorial serif');
  assert.equal(result.revision, revision);
  assert.equal(result.total, 2);
  assert.equal(result.designs.length, 1);
  assert.equal(result.designs[0].slug, 'wired');
  assert.equal(result.designs[0].name, 'WIRED');
  assert.equal(
    result.designs[0].description,
    'Editorial magazine, expressive serif.',
  );
  assert.ok(requests.every((request) => !request.url.includes('editorial')));
});

void test('invalid identifiers fail before any request; a chosen catalog revision remains pinned', async (t) => {
  const project = await mkdtemp(join(tmpdir(), 'incline-pinned-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  const { client, requests } = upstream();
  for (const slug of [
    '../wired',
    '/wired',
    'https://example.com',
    'wired?token=value',
  ])
    await assert.rejects(client.fetchGuide(slug, { project }), /slug/);
  await assert.rejects(
    client.fetchGuide('wired', { project, revision: '../main' }),
    /revision/,
  );
  assert.equal(requests.length, 0);
  const result = await client.fetchGuide('wired', { project, revision });
  assert.equal(result.revision, revision);
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.url.includes(revision)));
});

void test('unavailable, redirected, oversized and invalid source files do not alter existing taste data', async (t) => {
  const project = await mkdtemp(join(tmpdir(), 'incline-source-fail-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  const directory = join(project, '.incline');
  await mkdir(directory);
  await writeFile(join(directory, 'state.json'), 'existing evidence');
  const url = `${raw}/design-md/wired/DESIGN.md`;
  for (const [response, expected] of [
    [new Response('No file', { status: 404 }), /not in the public collection/],
    [new Response('Slow down', { status: 429 }), /rate limit/],
    [new Response('Redirect', { status: 302 }), /HTTP 302/],
    [
      new Response('<html>Unavailable</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
      /did not return/,
    ],
    [new Response('x'.repeat(200_001)), /exceeds/],
    [new Response(Buffer.from([0xff, 0x00])), /UTF-8/],
    [new Response('   '), /UTF-8/],
  ]) {
    const { client } = upstream({ [url]: response });
    await assert.rejects(client.fetchGuide('wired', { project }), expected);
  }
  const noLicense = upstream({
    [`${raw}/LICENSE`]: new Response('Missing', { status: 404 }),
  });
  await assert.rejects(
    noLicense.client.fetchGuide('wired', { project }),
    /not in the public collection/,
  );
  assert.deepEqual(await readdir(directory), ['state.json']);
  assert.equal(
    await readFile(join(directory, 'state.json'), 'utf8'),
    'existing evidence',
  );
});
