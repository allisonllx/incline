import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { inspectAsset } from './assets.mjs';

const mimeByExtension = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function text(value, max, field, fallback = '') {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'string' || result.length > max)
    throw new Error(`Invalid import ${field}`);
  return result;
}

function link(value) {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error();
    return url.toString();
  } catch {
    throw new Error('Import links must be HTTP(S) URLs without credentials');
  }
}

export async function prepareImport(inputPath) {
  const path = resolve(inputPath);
  let value;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read import JSON at ${path}`, { cause: error });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid import document');
  const allowed = new Set([
    'name',
    'description',
    'projectContext',
    'references',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw new Error('Invalid import field');
  const refs = value.references ?? [];
  if (!Array.isArray(refs) || refs.length > 24)
    throw new Error('Invalid import references');
  const prepared = [];
  for (const ref of refs) {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref))
      throw new Error('Invalid import reference');
    const allowedRef = new Set(['file', 'url', 'title', 'note', 'sourceUrl']);
    if (
      Object.keys(ref).some((key) => !allowedRef.has(key)) ||
      (typeof ref.file === 'string') === (typeof ref.url === 'string')
    )
      throw new Error('Each import reference needs exactly one file or URL');
    const note = text(ref.note, 2000, 'reference note');
    if (ref.file !== undefined) {
      const filePath = resolve(dirname(path), ref.file);
      const bytes = await readFile(filePath);
      const contentType = mimeByExtension[extname(filePath).toLowerCase()];
      const format = inspectAsset(bytes, contentType);
      const guide = contentType === 'text/markdown';
      if (!guide && ref.sourceUrl !== undefined)
        throw new Error('sourceUrl is only supported for Markdown guides');
      const sourceUrl =
        ref.sourceUrl === undefined
          ? undefined
          : link(text(ref.sourceUrl, 4000, 'source URL'));
      prepared.push({
        id: randomUUID(),
        kind: guide ? 'guide' : 'image',
        title: text(ref.title, 160, 'reference title', basename(filePath)),
        note,
        intent: 'inspiration',
        asset: `${randomUUID()}.${format.extension}`,
        bytes,
        contentType,
        ...(sourceUrl ? { url: sourceUrl } : {}),
      });
    } else {
      if (ref.sourceUrl !== undefined)
        throw new Error('sourceUrl is only supported for Markdown guides');
      const url = link(ref.url);
      prepared.push({
        id: randomUUID(),
        kind: 'link',
        title: text(ref.title, 160, 'reference title', new URL(url).hostname),
        note,
        intent: 'inspiration',
        url,
      });
    }
  }
  const session = {
    id: randomUUID(),
    catalogVersion: 3,
    followUps: [],
    name: text(value.name, 80, 'name', 'Imported collection'),
    context: 'portfolio',
    exploration: 'stretch',
    answers: [],
    keep: [],
    explore: [],
    notes: '',
    complete: false,
    createdAt: new Date().toISOString(),
    collection: {
      version: 1,
      description: text(value.description, 6000, 'description'),
      projectContext: text(value.projectContext, 300, 'project context'),
      references: prepared.map(
        ({ bytes: _bytes, contentType: _contentType, ...ref }) => ref,
      ),
    },
  };
  return { session, assets: prepared.filter((ref) => ref.kind !== 'link') };
}
