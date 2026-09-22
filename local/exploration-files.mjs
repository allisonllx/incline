import { lstat, realpath, mkdir, readdir, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const MAX_JSON_BYTES = 1_000_000;
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;
export const digest = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function safeId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    throw new Error('Invalid exploration ID');
  return value;
}
export function pathParts(relative) {
  if (
    typeof relative !== 'string' ||
    !relative ||
    relative.includes('\\') ||
    relative.includes('\0')
  )
    throw new Error('Unsafe relative path');
  const parts = relative.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..'))
    throw new Error('Unsafe relative path');
  return parts;
}
// Project roots may themselves be aliases; every path within the resolved root
// is checked component by component, and file opens refuse symlink leaves.
export async function safeDirectory(project, parts, create = false) {
  let current = await realpath(project);
  if (!(await lstat(current)).isDirectory())
    throw new Error('Project must be a directory');
  for (const part of parts) {
    pathParts(part);
    if (part.includes('/')) throw new Error('Unsafe directory component');
    current = join(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create) return null;
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (failure) {
        if (failure.code !== 'EEXIST') throw failure;
      }
      info = await lstat(current);
    }
    if (info.isSymbolicLink()) throw new Error('Unsafe symlink directory');
    if (!info.isDirectory()) throw new Error('Expected storage directory');
  }
  return current;
}
export async function safeEntries(project, parts) {
  const directory = await safeDirectory(project, parts);
  return directory === null
    ? null
    : readdir(directory, { withFileTypes: true });
}
export async function safeBytes(project, parts, maxBytes = MAX_JSON_BYTES) {
  const directory = await safeDirectory(project, parts.slice(0, -1));
  if (directory === null) return null;
  const name = parts.at(-1);
  pathParts(name);
  if (name.includes('/')) throw new Error('Unsafe file component');
  const path = join(directory, name);
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (info.isSymbolicLink()) throw new Error('Unsafe symlink file');
  if (!info.isFile()) throw new Error('Expected regular file');
  if (info.size > maxBytes) throw new Error('File size limit exceeded');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > maxBytes)
      throw new Error('File size limit exceeded');
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > maxBytes) throw new Error('File size limit exceeded');
    return { path, bytes: buffer.subarray(0, length) };
  } finally {
    await handle.close();
  }
}
