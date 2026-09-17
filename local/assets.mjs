import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export const maxAssetBytes = 8_000_000;
export const maxGuideBytes = 200_000;

function markdownText(bytes) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!text.trim()) return false;
    for (const character of text) {
      const code = character.charCodeAt(0);
      if (code < 32 && ![9, 10, 13].includes(code)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function normalizedType(value) {
  return String(value ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
}

const formats = {
  'text/markdown': { extension: 'md', matches: markdownText },
  'image/png': {
    extension: 'png',
    matches: (b) =>
      b.length >= 8 &&
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  'image/jpeg': {
    extension: 'jpg',
    matches: (b) =>
      b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  'image/webp': {
    extension: 'webp',
    matches: (b) =>
      b.length >= 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
  'image/gif': {
    extension: 'gif',
    matches: (b) =>
      b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.toString('ascii', 0, 6)),
  },
};

export function assetName(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp|gif|md)$/i.test(
      value,
    )
  );
}

export function inspectAsset(bytes, contentType) {
  const type = normalizedType(contentType);
  const limit = type === 'text/markdown' ? maxGuideBytes : maxAssetBytes;
  if (!Buffer.isBuffer(bytes) || bytes.length === 0)
    throw Object.assign(new Error('Reference file is empty'), { status: 400 });
  if (bytes.length > limit)
    throw Object.assign(
      new Error(
        type === 'text/markdown'
          ? 'Design guide exceeds 200 KB'
          : 'Image is too large',
      ),
      { status: 413 },
    );
  const format = formats[type];
  if (!format || !format.matches(bytes))
    throw Object.assign(
      new Error(
        type === 'text/markdown'
          ? 'Choose a non-empty UTF-8 Markdown file'
          : 'Unsupported or invalid image',
      ),
      {
        status: 415,
      },
    );
  return format;
}

export async function readRaw(req) {
  const chunks = [];
  let size = 0;
  const guide = normalizedType(req.headers['content-type']) === 'text/markdown';
  const limit = guide ? maxGuideBytes : maxAssetBytes;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit)
      throw Object.assign(
        new Error(guide ? 'Design guide exceeds 200 KB' : 'Image is too large'),
        { status: 413 },
      );
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function storeAsset(directory, bytes, contentType) {
  const format = inspectAsset(bytes, contentType);
  return storeNamedAsset(
    directory,
    `${randomUUID()}.${format.extension}`,
    bytes,
    contentType,
  );
}

export async function storeNamedAsset(directory, name, bytes, contentType) {
  const format = inspectAsset(bytes, contentType);
  if (!assetName(name) || !name.endsWith(`.${format.extension}`))
    throw new Error('Invalid asset name');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, name);
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
  } catch (error) {
    await unlink(path).catch(() => {});
    throw error;
  } finally {
    await handle.close();
  }
  return name;
}

export async function loadAsset(directory, name) {
  if (!assetName(name))
    throw Object.assign(new Error('Invalid asset name'), { status: 404 });
  try {
    return await readFile(join(directory, name));
  } catch (error) {
    if (error.code === 'ENOENT')
      throw Object.assign(new Error('Asset not found'), { status: 404 });
    throw error;
  }
}

export function assetMime(name) {
  if (name.endsWith('.md')) return 'text/plain; charset=utf-8';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  return 'image/gif';
}
