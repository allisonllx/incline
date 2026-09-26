import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createPromptStore, copyPrompt } from './prompts.mjs';
import { readPromptSettings, savePromptSettings } from './prompt-settings.mjs';
import { inspectAsset } from './assets.mjs';

const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const allowedScopes = new Set(['project', 'personal']);
const editable = new Set([
  'title',
  'prompt',
  'origin',
  'source',
  'tags',
  'assets',
]);
const maxBodyBytes = 12_000_000;

function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw fail('Invalid prompt request');
  if (Object.keys(value).some((key) => !fields.includes(key)))
    throw fail('Unknown prompt request field');
  return value;
}

async function json(req) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw fail('JSON required', 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw fail('Prompt upload is too large', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw fail('Invalid JSON');
  }
}

function queryRevision(value) {
  if (value === null) return undefined;
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1 || revision > 100)
    throw fail('Invalid revision');
  return revision;
}

function upload(item) {
  object(item, ['id', 'contentType', 'base64']);
  if (
    typeof item.id !== 'string' ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(item.id)
  )
    throw fail('Invalid asset ID');
  if (
    typeof item.base64 !== 'string' ||
    item.base64.length > 10_700_000 ||
    item.base64.length % 4 !== 0 ||
    /[^A-Za-z0-9+/=]/.test(item.base64)
  )
    throw fail('Invalid asset upload');
  const bytes = Buffer.from(item.base64, 'base64');
  if (bytes.toString('base64') !== item.base64)
    throw fail('Invalid asset upload');
  inspectAsset(bytes, item.contentType);
  return { id: item.id, contentType: item.contentType, bytes };
}

function scopeStore(scope, project, personalDirectory, readOnly = false) {
  if (!allowedScopes.has(scope)) throw fail('Invalid prompt scope');
  if (scope === 'personal') {
    if (personalDirectory === null)
      throw fail('Personal prompt library is disabled', 404);
    return createPromptStore(resolve(personalDirectory), { readOnly });
  }
  return createPromptStore(join(project, '.incline', 'prompts'), {
    projectDirectory: project,
    readOnly,
  });
}

async function retainedAssets(store, entry) {
  const assets = [];
  for (const descriptor of entry.assets) {
    if (descriptor.missingReason) {
      assets.push({
        id: descriptor.id,
        missingReason: descriptor.missingReason,
      });
    } else {
      const asset = await store.asset(entry.id, entry.revision, descriptor.id);
      assets.push({
        id: descriptor.id,
        contentType: asset.contentType,
        bytes: asset.bytes,
      });
    }
  }
  return assets;
}

function sendAsset(res, asset) {
  res.writeHead(200, {
    'Content-Type':
      asset.contentType === 'text/markdown'
        ? 'text/plain; charset=utf-8'
        : asset.contentType,
    'Content-Length': asset.bytes.length,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
  });
  res.end(asset.bytes);
}

/** Called only after the parent server's host, origin, and bearer-token gate. */
export async function handlePromptRequest(
  req,
  res,
  url,
  {
    project,
    promptLibraryDirectory = join(homedir(), '.incline', 'prompt-library'),
    send,
  },
) {
  if (!url.pathname.startsWith('/api/prompts')) return false;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'prompts')
    throw fail('Not found', 404);
  const scope = url.searchParams.get('scope') ?? 'project';
  const store = () => scopeStore(scope, project, promptLibraryDirectory, true);

  if (parts.length === 3 && parts[2] === 'settings') {
    if (req.method === 'GET') {
      const settings = await readPromptSettings(project);
      send(res, 200, {
        settings: {
          revision: settings.revision,
          personalLookup:
            settings.personalLookup &&
            promptLibraryDirectory !== null &&
            settings.personalDirectory === resolve(promptLibraryDirectory),
          directoryChanged:
            settings.personalLookup &&
            (promptLibraryDirectory === null ||
              settings.personalDirectory !== resolve(promptLibraryDirectory)),
        },
        personalAvailable: promptLibraryDirectory !== null,
      });
      return true;
    }
    if (req.method === 'POST') {
      const data = object(await json(req), [
        'personalLookup',
        'expectedRevision',
      ]);
      if (typeof data.personalLookup !== 'boolean')
        throw fail('Invalid lookup setting');
      if (promptLibraryDirectory === null && data.personalLookup)
        throw fail('Personal prompt library is disabled', 404);
      if (!Object.hasOwn(data, 'expectedRevision'))
        throw fail('Expected settings revision required');
      let settings;
      try {
        settings = await savePromptSettings(project, {
          personalLookup: data.personalLookup,
          personalDirectory: data.personalLookup
            ? resolve(promptLibraryDirectory)
            : null,
          expectedRevision: data.expectedRevision,
        });
      } catch (error) {
        if (/Prompt settings changed|being updated/.test(error.message))
          throw fail(error.message, 409);
        throw error;
      }
      send(res, 200, {
        settings: {
          revision: settings.revision,
          personalLookup: settings.personalLookup,
        },
        personalAvailable: promptLibraryDirectory !== null,
      });
      return true;
    }
    throw fail('Method not allowed', 405);
  }

  if (parts.length === 3 && parts[2] === 'save' && req.method === 'POST') {
    const data = object(await json(req), [
      'scope',
      'id',
      'baseRevision',
      'changes',
      'uploads',
    ]);
    const target = scopeStore(data.scope, project, promptLibraryDirectory);
    const changes = object(data.changes, [...editable]);
    if (
      data.uploads !== undefined &&
      (!Array.isArray(data.uploads) || data.uploads.length > 4)
    )
      throw fail('Too many uploaded assets');
    const uploads = (data.uploads ?? []).map(upload);
    let previous;
    if (data.id !== undefined) {
      if (!Number.isInteger(data.baseRevision))
        throw fail('Base revision required');
      previous = await target.read(data.id, data.baseRevision);
    } else if (data.baseRevision !== undefined)
      throw fail('Unexpected base revision');
    if (changes.assets !== undefined) {
      if (
        !Array.isArray(changes.assets) ||
        changes.assets.some(
          (a) =>
            !a ||
            typeof a !== 'object' ||
            Array.isArray(a) ||
            Object.keys(a).some((k) => !['id', 'missingReason'].includes(k)) ||
            typeof a.id !== 'string' ||
            typeof a.missingReason !== 'string',
        )
      )
        throw fail('Assets must be explicit gaps or bounded uploads');
    }
    const baseAssets = previous ? await retainedAssets(target, previous) : [];
    const assets = [...baseAssets, ...(changes.assets ?? []), ...uploads];
    const source = { ...previous?.source };
    if (changes.source !== undefined) {
      const patch = object(changes.source, [
        'url',
        'author',
        'capturedAt',
        'license',
        'contentGap',
        'embedUrl',
      ]);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') delete source[key];
        else source[key] = value;
      }
    }
    const input = {
      ...(previous && { id: previous.id, baseRevision: data.baseRevision }),
      title: changes.title ?? previous?.title,
      prompt: changes.prompt ?? previous?.prompt,
      origin: changes.origin ?? previous?.origin,
      source,
      tags: changes.tags ?? previous?.tags ?? [],
      requirements: previous?.requirements ?? {},
      notes: previous?.notes ?? [],
      recipe: previous?.recipe ?? null,
      parent: previous?.parent ?? null,
      copyOf: previous?.copyOf ?? null,
      assets,
    };
    const entry = await target.save(input);
    send(res, 201, { entry });
    return true;
  }

  if (parts.length === 3 && parts[2] === 'copy' && req.method === 'POST') {
    const data = object(await json(req), ['from', 'to', 'id', 'revision']);
    if (data.from === data.to) throw fail('Choose a different destination');
    const from = scopeStore(data.from, project, promptLibraryDirectory, true);
    const to = scopeStore(data.to, project, promptLibraryDirectory);
    const entry = await copyPrompt(from, to, data.id, data.revision);
    send(res, 201, { entry });
    return true;
  }

  if (req.method !== 'GET') throw fail('Method not allowed', 405);
  if (parts.length === 2) {
    const tagFilters = url.searchParams.getAll('tag').map((value) => {
      const index = value.indexOf(':');
      if (index < 0) return { value: value.trim() };
      return {
        facet: value.slice(0, index).trim(),
        value: value.slice(index + 1).trim(),
      };
    });
    const exactTags = tagFilters.filter((tag) => tag.facet);
    const plainTags = tagFilters.filter((tag) => !tag.facet);
    if (plainTags.length > 1) throw fail('Use one plain tag value at a time');
    const entries =
      url.searchParams.has('text') || tagFilters.length
        ? await store().query({
            text: url.searchParams.get('text') || undefined,
            tags: exactTags,
            tagValue: plainTags[0]?.value,
            limit: 50,
          })
        : await store().list();
    send(res, 200, { entries });
    return true;
  }
  if (parts.length >= 3) {
    const id = parts[2];
    const revision = queryRevision(url.searchParams.get('revision'));
    if (parts.length === 3) {
      send(res, 200, { entry: await store().read(id, revision) });
      return true;
    }
    if (parts.length === 4 && parts[3] === 'runs') {
      const selected = revision ?? (await store().read(id)).revision;
      send(res, 200, { runs: await store().runs(id, selected) });
      return true;
    }
    if (parts.length === 5 && parts[3] === 'assets') {
      const selected = revision ?? (await store().read(id)).revision;
      sendAsset(res, await store().asset(id, selected, parts[4]));
      return true;
    }
    if (parts.length === 6 && parts[3] === 'runs' && parts[5] !== '') {
      const selected = revision ?? (await store().read(id)).revision;
      sendAsset(res, await store().runAsset(id, selected, parts[4], parts[5]));
      return true;
    }
  }
  throw fail('Not found', 404);
}
