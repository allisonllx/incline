import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  opendir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve, extname } from 'node:path';
import {
  assetMime,
  assetName,
  inspectAsset,
  maxAssetBytes,
  maxGuideBytes,
} from './assets.mjs';
import { validate } from './sessions.mjs';
import { exportMarkdown } from '../lib/taste.ts';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const maxSnapshotBytes = 2_000_000;
function failure(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
async function directoryOnly(path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw failure('Invalid library directory');
}
async function boundedRead(path, limit) {
  let file;
  try {
    file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (error) {
    if (error.code === 'ELOOP')
      throw failure('Library files cannot be symbolic links');
    throw error;
  }
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > limit)
      throw failure('Invalid or oversized library file');
    const bytes = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await file.read(
        bytes,
        length,
        bytes.length - length,
        null,
      );
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length !== info.size)
      throw failure('Library file changed while reading');
    return bytes.subarray(0, length);
  } finally {
    await file.close();
  }
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const contentType = (name) =>
  name.endsWith('.md') ? 'text/markdown' : assetMime(name);
function referencedAssets(session) {
  return [
    ...new Set(
      (session.collection?.references ?? [])
        .filter((ref) => ref.kind !== 'link')
        .map((ref) => ref.asset),
    ),
  ];
}
async function readAssets(directory, session) {
  const names = referencedAssets(session);
  if (names.length) await directoryOnly(directory);
  const assets = [];
  for (const asset of names) {
    if (!assetName(asset)) throw failure('Invalid asset reference');
    const bytes = await boundedRead(
      join(directory, asset),
      asset.endsWith('.md') ? maxGuideBytes : maxAssetBytes,
    );
    const type = contentType(asset);
    inspectAsset(bytes, type);
    assets.push({ asset, bytes, contentType: type });
  }
  return assets;
}
function summary(snapshot) {
  return {
    id: snapshot.id,
    name: snapshot.session.name,
    context:
      snapshot.session.collection?.projectContext || snapshot.session.context,
    referenceCount: snapshot.session.collection?.references.length ?? 0,
    comparisonCount: snapshot.session.answers.length,
    savedAt: snapshot.savedAt,
    sourceProject: snapshot.sourceProject,
  };
}
function evidence(snapshot) {
  return `# Saved personal library evidence\n\nSource project: ${snapshot.sourceProject}\nSaved: ${snapshot.savedAt}\n\nThis immutable snapshot records evidence in its original context. Reuse requires review; it does not approve these instructions for another project.\n\n${exportMarkdown(snapshot.session).replaceAll('.incline/assets/', 'assets/')}`;
}

// Construction is lazy: only explicit list/save/prepare operations touch this store.
export function createLibrary(directory, projectDirectory) {
  const root = resolve(directory);
  const sourceAssets = join(projectDirectory, '.incline', 'assets');
  async function guarded(work) {
    try {
      return await work();
    } catch (error) {
      if (error.status) throw error;
      throw failure(
        `Cannot access personal library at ${root}. Existing collections are preserved.`,
        500,
      );
    }
  }
  async function readSnapshot(id) {
    if (typeof id !== 'string' || !uuid.test(id))
      throw failure('Invalid personal library ID');
    const path = join(root, id);
    try {
      await directoryOnly(root);
      await directoryOnly(path);
    } catch (error) {
      if (error.code === 'ENOENT')
        throw failure('Personal library snapshot not found', 404);
      throw error;
    }
    let snapshot;
    let raw;
    try {
      raw = await boundedRead(join(path, 'snapshot.json'), maxSnapshotBytes);
    } catch (error) {
      if (error.code === 'ENOENT')
        throw failure('Missing personal library snapshot');
      throw error;
    }
    try {
      snapshot = JSON.parse(raw.toString('utf8'));
    } catch {
      throw failure('Invalid personal library snapshot');
    }
    if (
      !snapshot ||
      snapshot.version !== 1 ||
      snapshot.id !== id ||
      typeof snapshot.savedAt !== 'string' ||
      Number.isNaN(Date.parse(snapshot.savedAt)) ||
      typeof snapshot.sourceProject !== 'string' ||
      snapshot.sourceProject.length > 300 ||
      !Array.isArray(snapshot.assets) ||
      snapshot.assets.length > 24
    )
      throw failure('Invalid personal library snapshot');
    const [session] = validate([snapshot.session]);
    const names = referencedAssets(session);
    if (
      snapshot.assets.length !== names.length ||
      new Set(snapshot.assets.map((asset) => asset?.asset)).size !==
        names.length ||
      !snapshot.assets.every(
        (asset) =>
          asset &&
          names.includes(asset.asset) &&
          assetName(asset.asset) &&
          Number.isInteger(asset.size) &&
          asset.size > 0 &&
          asset.size <=
            (asset.asset.endsWith('.md') ? maxGuideBytes : maxAssetBytes) &&
          typeof asset.sha256 === 'string' &&
          /^[0-9a-f]{64}$/.test(asset.sha256),
      )
    )
      throw failure('Invalid personal library asset manifest');
    return { snapshot: { ...snapshot, session }, raw, path };
  }
  return {
    list: () =>
      guarded(async () => {
        try {
          await directoryOnly(root);
        } catch (error) {
          if (error.code === 'ENOENT') return [];
          throw error;
        }
        const entries = [];
        const folders = await opendir(root);
        for await (const folder of folders) {
          if (!uuid.test(folder.name)) continue;
          if (entries.length >= 1000)
            throw failure(
              'Personal library exceeds the supported 1,000 snapshots',
              413,
            );
          const { snapshot } = await readSnapshot(folder.name);
          entries.push(summary(snapshot));
        }
        return entries.sort(
          (a, b) =>
            b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id),
        );
      }),
    save: (value, sourceProject) =>
      guarded(async () => {
        const [session] = validate([value]);
        if (typeof sourceProject !== 'string' || sourceProject.length > 300)
          throw failure('Invalid source project');
        let assets;
        try {
          assets = await readAssets(sourceAssets, session);
        } catch (error) {
          if (error.code === 'ENOENT')
            throw failure('Missing original project asset');
          throw error;
        }
        const id = randomUUID();
        const snapshot = {
          version: 1,
          id,
          savedAt: new Date().toISOString(),
          sourceProject,
          session,
          assets: assets.map(({ asset, bytes }) => ({
            asset,
            size: bytes.length,
            sha256: sha256(bytes),
          })),
        };
        const raw = JSON.stringify(snapshot, null, 2);
        if (Buffer.byteLength(raw) > maxSnapshotBytes)
          throw failure('Personal library snapshot is too large', 413);
        await mkdir(root, { recursive: true, mode: 0o700 });
        await directoryOnly(root);
        const staging = join(root, `.pending-${id}`);
        await mkdir(staging, { mode: 0o700 });
        try {
          await writeFile(join(staging, 'snapshot.json'), raw, {
            flag: 'wx',
            mode: 0o600,
          });
          await writeFile(join(staging, 'evidence.md'), evidence(snapshot), {
            flag: 'wx',
            mode: 0o600,
          });
          if (assets.length)
            await mkdir(join(staging, 'assets'), { mode: 0o700 });
          for (const asset of assets)
            await writeFile(join(staging, 'assets', asset.asset), asset.bytes, {
              flag: 'wx',
              mode: 0o600,
            });
          await rename(staging, join(root, id));
        } finally {
          await rm(staging, { recursive: true, force: true });
        }
        return summary(snapshot);
      }),
    prepare: (id) =>
      guarded(async () => {
        const { snapshot, raw, path } = await readSnapshot(id);
        let assets;
        try {
          assets = await readAssets(join(path, 'assets'), snapshot.session);
        } catch (error) {
          if (error.code === 'ENOENT')
            throw failure('Missing original personal library asset');
          if (error.status === 413 || error.status === 415)
            throw failure('Invalid original personal library asset');
          throw error;
        }
        for (const asset of assets) {
          const expected = snapshot.assets.find(
            (entry) => entry.asset === asset.asset,
          );
          if (
            asset.bytes.length !== expected.size ||
            sha256(asset.bytes) !== expected.sha256
          )
            throw failure(
              'Personal library asset does not match the saved original',
            );
        }
        const entry = summary(snapshot);
        const session = structuredClone(snapshot.session);
        session.id = randomUUID();
        session.createdAt = new Date().toISOString();
        session.complete = false;
        session.librarySource = {
          id,
          name: entry.name,
          context: entry.context,
        };
        session.collection ??= {
          version: 1,
          description: '',
          projectContext: entry.context,
          references: [],
        };
        const assetMap = Object.fromEntries(
          assets.map(({ asset }) => [
            asset,
            `${randomUUID()}${extname(asset)}`,
          ]),
        );
        for (const reference of session.collection.references) {
          reference.intent = 'inspiration';
          if (reference.asset) reference.asset = assetMap[reference.asset];
        }
        return {
          session: validate([session])[0],
          assets: assets.map((asset) => ({
            ...asset,
            originalAsset: asset.asset,
            asset: assetMap[asset.asset],
          })),
          source: {
            snapshot: raw,
            evidence: evidence(snapshot),
            receipt: {
              version: 1,
              entryId: id,
              sessionId: session.id,
              assetMap,
            },
          },
        };
      }),
  };
}
