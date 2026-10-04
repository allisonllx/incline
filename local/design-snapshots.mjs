import {
  mkdir,
  mkdtemp,
  writeFile,
  rename,
  rm,
  open,
  unlink,
  realpath,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  join,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import {
  safeDirectory,
  safeBytes,
  safeEntries,
  safeId,
  canonical,
  digest,
} from './exploration-files.mjs';
import { inspectAsset } from './assets.mjs';
import { assertPromptRecording } from './prompt-settings.mjs';
import {
  fields,
  text,
  validateDesign,
  renderDesignGuide,
} from './design-snapshot-model.mjs';

const execute = promisify(execFile);
const hashPattern = /^[a-f0-9]{64}$/;
function location(
  project,
  { scope = 'project', library, localOnly = false } = {},
) {
  if (scope === 'personal') {
    if (localOnly)
      throw new Error('--local-only forbids personal design library access');
    if (!library) throw new Error('Select a personal design library');
    const path = resolve(library);
    const root = parse(path).root;
    return {
      root,
      parts: relative(root, path).split(sep).filter(Boolean),
      scope,
    };
  }
  if (!['project', 'imported'].includes(scope))
    throw new Error('Invalid design snapshot scope');
  return {
    root: project,
    parts: [
      '.incline',
      scope === 'project' ? 'design-snapshots' : 'design-references',
    ],
    scope,
  };
}
export async function readDesignInput(path) {
  const directory = await realpath(dirname(resolve(path)));
  const loaded = await safeBytes(directory, [basename(path)]);
  if (!loaded) throw new Error('Design input file not found');
  return {
    input: JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(loaded.bytes),
    ),
    directory,
  };
}
function assetExtension(bytes, kind, extension) {
  const images = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  if (kind === 'screenshot') {
    if (!images[extension])
      throw new Error('Screenshot must be a retained raster image');
    return inspectAsset(bytes, images[extension]).extension;
  }
  if (kind === 'motion') {
    if (extension === '.gif') return inspectAsset(bytes, 'image/gif').extension;
    if (
      extension === '.mp4' &&
      bytes.length >= 12 &&
      bytes.toString('ascii', 4, 8) === 'ftyp'
    )
      return 'mp4';
    if (
      extension === '.webm' &&
      bytes.length >= 4 &&
      bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    )
      return 'webm';
    throw new Error('Motion capture must be GIF, MP4 or WebM');
  }
  if (
    ![
      '.md',
      '.txt',
      '.html',
      '.css',
      '.scss',
      '.svg',
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
      '.json',
    ].includes(extension)
  )
    throw new Error('Unsupported selected source file');
  const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!content.trim() || content.includes('\0'))
    throw new Error('Source must be nonempty UTF-8 text');
  return extension.slice(1);
}
async function prepareArtifacts(input, inputDirectory) {
  const files = new Map();
  const artifacts = [];
  let total = 0;
  for (const artifact of input.artifacts) {
    if (!artifact.path) {
      artifacts.push({ ...artifact });
      continue;
    }
    const source = resolve(inputDirectory, artifact.path);
    const root = parse(source).root;
    const loaded = await safeBytes(
      root,
      relative(root, source).split(sep),
      8_000_000,
    );
    if (!loaded || !loaded.bytes.length)
      throw new Error(
        'Artifact is missing or empty; supply an explicit gap instead',
      );
    total += loaded.bytes.length;
    if (total > 32_000_000) throw new Error('Snapshot assets exceed 32 MB');
    const extension = assetExtension(
      loaded.bytes,
      artifact.kind,
      extname(source).toLowerCase(),
    );
    const file = `assets/${artifact.id}.${extension}`;
    const { path: _path, ...metadata } = artifact;
    artifacts.push({
      ...metadata,
      file,
      sha256: digest(loaded.bytes),
      size: loaded.bytes.length,
    });
    files.set(file, loaded.bytes);
  }
  return { files, artifacts };
}
async function projectIdentity(project) {
  const projectName = basename(await realpath(project));
  try {
    const { stdout: head } = await execute(
      'git',
      ['-C', project, 'rev-parse', '--verify', 'HEAD'],
      { timeout: 5000 },
    );
    const { stdout: changes } = await execute(
      'git',
      ['-C', project, 'status', '--porcelain', '--', '.', ':(exclude).incline'],
      { timeout: 5000, maxBuffer: 1_000_000 },
    );
    return { projectName, commit: head.trim(), dirty: Boolean(changes.trim()) };
  } catch {
    return { projectName, commit: null, dirty: null };
  }
}
function validateManifest(manifest) {
  fields(manifest, [
    'version',
    'createdAt',
    'source',
    'design',
    'inputHash',
    'guideHash',
    'hash',
  ]);
  if (
    manifest.version !== 1 ||
    typeof manifest.createdAt !== 'string' ||
    Number.isNaN(Date.parse(manifest.createdAt))
  )
    throw new Error('Invalid snapshot version or date');
  fields(manifest.source, ['projectName', 'commit', 'dirty']);
  text(manifest.source.projectName, 'source project', 200);
  if (
    manifest.source.commit !== null &&
    (typeof manifest.source.commit !== 'string' ||
      !/^[a-f0-9]{40,64}$/.test(manifest.source.commit))
  )
    throw new Error('Invalid source commit');
  if (
    manifest.source.dirty !== null &&
    typeof manifest.source.dirty !== 'boolean'
  )
    throw new Error('Invalid source dirty state');
  for (const field of ['inputHash', 'guideHash', 'hash'])
    if (!hashPattern.test(manifest[field]))
      throw new Error('Invalid snapshot hash');
  validateDesign(manifest.design, true);
  const { hash, ...body } = manifest;
  if (digest(canonical(body)) !== hash)
    throw new Error('Snapshot manifest integrity failed');
  if (
    digest(renderDesignGuide(manifest.design, manifest.source)) !==
    manifest.guideHash
  )
    throw new Error('Snapshot guide metadata integrity failed');
}
function validateReuse(reuse, hash) {
  fields(reuse, [
    'version',
    'intent',
    'sourceHash',
    'relevance',
    'targetProject',
    'importedAt',
  ]);
  if (
    reuse.version !== 1 ||
    reuse.intent !== 'inspiration' ||
    reuse.sourceHash !== hash ||
    typeof reuse.importedAt !== 'string' ||
    Number.isNaN(Date.parse(reuse.importedAt))
  )
    throw new Error('Invalid design reuse receipt');
  text(reuse.relevance, 'reuse relevance');
  text(reuse.targetProject, 'target project', 200);
}
async function loadBundle(loc, id, metadataOnly = false) {
  safeId(id);
  const parts = [...loc.parts, id];
  const raw = await safeBytes(loc.root, [...parts, 'snapshot.json']);
  if (!raw) {
    if (await safeDirectory(loc.root, parts))
      throw new Error(
        'Incomplete design snapshot; preserve it and choose another capture ID',
      );
    throw Object.assign(new Error('Design snapshot not found'), {
      code: 'ENOENT',
    });
  }
  const manifest = JSON.parse(raw.bytes.toString('utf8'));
  validateManifest(manifest);
  if ((loc.scope === 'project' ? manifest.design.id : manifest.hash) !== id)
    throw new Error('Snapshot directory identity mismatch');
  const directory = await safeDirectory(loc.root, parts);
  let reuse = null;
  if (loc.scope === 'imported') {
    const receipt = await safeBytes(loc.root, [...parts, 'reuse.json'], 32000);
    if (!receipt) throw new Error('Missing design reuse receipt');
    const envelope = JSON.parse(receipt.bytes.toString('utf8'));
    fields(envelope, ['reuse', 'hash']);
    if (digest(canonical(envelope.reuse)) !== envelope.hash)
      throw new Error('Reuse receipt integrity failed');
    validateReuse(envelope.reuse, manifest.hash);
    reuse = envelope.reuse;
  }
  const files = new Map();
  let guide;
  if (!metadataOnly) {
    const retained = await safeBytes(
      loc.root,
      [...parts, 'DESIGN.md'],
      200_000,
    );
    if (!retained || digest(retained.bytes) !== manifest.guideHash)
      throw new Error('Design guide integrity failed');
    guide = retained.bytes.toString('utf8');
    files.set('DESIGN.md', retained.bytes);
    let total = 0;
    for (const artifact of manifest.design.artifacts) {
      if (!artifact.file) continue;
      const asset = await safeBytes(
        loc.root,
        [...parts, ...artifact.file.split('/')],
        8_000_000,
      );
      if (
        !asset ||
        asset.bytes.length !== artifact.size ||
        digest(asset.bytes) !== artifact.sha256
      )
        throw new Error(`Artifact integrity failed: ${artifact.id}`);
      total += asset.bytes.length;
      if (total > 32_000_000) throw new Error('Snapshot assets exceed 32 MB');
      assetExtension(asset.bytes, artifact.kind, extname(artifact.file));
      files.set(artifact.file, asset.bytes);
    }
  }
  return { id, directory, manifest, guide, reuse, files };
}
async function publishBundle(
  loc,
  id,
  manifest,
  files,
  reuse = null,
  beforePublish = null,
) {
  safeId(id);
  const store = await safeDirectory(loc.root, loc.parts, true);
  const lockPath = join(store, '.snapshot-write.lock');
  let lock;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      lock = await open(lockPath, 'wx', 0o600);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await delay(25);
    }
  }
  if (!lock)
    throw new Error('Design store is busy; retry after the current write');
  let staging;
  try {
    // Waiting on another writer must not preserve a revoked recording scope.
    if (beforePublish) await beforePublish();
    try {
      const existing = await loadBundle(loc, id);
      const same =
        loc.scope === 'project'
          ? existing.manifest.inputHash === manifest.inputHash
          : existing.manifest.hash === manifest.hash;
      if (!same || (reuse && existing.reuse?.relevance !== reuse.relevance))
        throw new Error(
          'Snapshot already exists with different content; choose a new capture ID or reuse the original import',
        );
      return {
        status: 'already-saved',
        id,
        hash: existing.manifest.hash,
        directory: existing.directory,
        guidePath: join(existing.directory, 'DESIGN.md'),
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const entries = await safeEntries(loc.root, loc.parts);
    const visible = entries.filter((e) => !e.name.startsWith('.'));
    if (visible.length >= 1000)
      throw new Error('Design store limit of 1000 snapshots reached');
    // A selected path must contain only this store's schema, never collections
    // or prompts. Do not silently mix unrelated libraries at a mistaken path.
    for (const entry of visible) {
      if (!entry.isDirectory() || entry.isSymbolicLink())
        throw new Error('Invalid design store entry');
      await loadBundle(loc, entry.name, true);
    }
    staging = await mkdtemp(join(store, '.pending-'));
    for (const [name, bytes] of files) {
      if (name.startsWith('assets/'))
        await mkdir(join(staging, 'assets'), { recursive: true, mode: 0o700 });
      await writeFile(join(staging, name), bytes, { flag: 'wx', mode: 0o600 });
    }
    const raw = JSON.stringify(manifest, null, 2) + '\n';
    if (Buffer.byteLength(raw) > 1_000_000)
      throw new Error('Snapshot manifest exceeds 1 MB');
    await writeFile(join(staging, 'snapshot.json'), raw, {
      flag: 'wx',
      mode: 0o600,
    });
    if (reuse)
      await writeFile(
        join(staging, 'reuse.json'),
        JSON.stringify({ reuse, hash: digest(canonical(reuse)) }, null, 2) +
          '\n',
        { flag: 'wx', mode: 0o600 },
      );
    await safeDirectory(loc.root, loc.parts);
    if (beforePublish) await beforePublish();
    await rename(staging, join(store, id));
    staging = null;
    return {
      status: 'saved',
      id,
      hash: manifest.hash,
      directory: join(store, id),
      guidePath: join(store, id, 'DESIGN.md'),
    };
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    await lock.close();
    await unlink(lockPath);
  }
}
export async function captureDesign(
  project,
  input,
  { inputDirectory = project, automatic = false } = {},
) {
  validateDesign(input);
  input = structuredClone(input);
  if (automatic) {
    await assertPromptRecording(project);
    if (input.satisfaction.status === 'unknown')
      throw new Error(
        'Automatic capture needs a reaction-linked satisfaction assessment',
      );
  }
  const { files, artifacts } = await prepareArtifacts(
    input,
    await realpath(inputDirectory),
  );
  const design = structuredClone({ ...input, artifacts });
  const inputHash = digest(canonical({ input, artifacts }));
  const source = await projectIdentity(project);
  const guide = renderDesignGuide(design, source);
  files.set('DESIGN.md', Buffer.from(guide));
  const body = {
    version: 1,
    createdAt: new Date().toISOString(),
    source,
    design,
    inputHash,
    guideHash: digest(guide),
  };
  const manifest = { ...body, hash: digest(canonical(body)) };
  validateManifest(manifest);
  if (automatic) await assertPromptRecording(project);
  return publishBundle(
    location(project),
    design.id,
    manifest,
    files,
    null,
    automatic ? () => assertPromptRecording(project) : null,
  );
}
export async function readDesign(project, id, options = {}) {
  const { files: _files, ...result } = await loadBundle(
    location(project, options),
    id,
  );
  return result;
}
export async function queryDesigns(project, options = {}) {
  const { text: query = '', tag, limit = 10 } = options;
  if (
    typeof query !== 'string' ||
    query.length > 1000 ||
    (tag !== undefined &&
      (typeof tag !== 'string' || !tag.trim() || tag.length > 100)) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    throw new Error('Invalid design query');
  const loc = location(project, options);
  const entries = ((await safeEntries(loc.root, loc.parts)) ?? []).filter(
    (entry) => !entry.name.startsWith('.'),
  );
  if (entries.length > 1000)
    throw new Error('Design store exceeds supported limit');
  const matches = [];
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink())
      throw new Error('Invalid design store entry');
    const saved = await loadBundle(loc, entry.name, true);
    const { design, source, createdAt, hash } = saved.manifest;
    const haystack = [
      design.title,
      design.context,
      design.state,
      ...design.tags,
    ]
      .join(' ')
      .toLowerCase();
    if (
      !terms.every((term) => haystack.includes(term)) ||
      (tag &&
        !design.tags.some((item) => item.toLowerCase() === tag.toLowerCase()))
    )
      continue;
    matches.push({
      id: entry.name,
      hash,
      title: design.title,
      context: design.context,
      state: design.state,
      tags: design.tags,
      source,
      createdAt,
      satisfaction: design.satisfaction,
      qualifications: design.qualifications,
      retained: design.artifacts.filter((a) => a.file).length,
      gaps: design.artifacts.filter((a) => !a.file).length,
      ...(saved.reuse ? { reuse: saved.reuse } : {}),
    });
  }
  matches.sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
  return {
    entries: matches.slice(0, limit),
    total: matches.length,
    verification: 'metadata-only; read a selected snapshot to verify its files',
  };
}
export async function publishDesign(
  project,
  id,
  library,
  { localOnly = false, beforePublish = null } = {},
) {
  const destination = location(project, {
    scope: 'personal',
    library,
    localOnly,
  });
  const saved = await loadBundle(location(project), id);
  return publishBundle(
    destination,
    saved.manifest.hash,
    saved.manifest,
    saved.files,
    null,
    beforePublish,
  );
}
export async function importDesign(
  project,
  id,
  library,
  relevance,
  { localOnly = false } = {},
) {
  text(relevance, 'reuse relevance');
  const source = location(project, { scope: 'personal', library, localOnly });
  const saved = await loadBundle(source, id);
  const reuse = {
    version: 1,
    intent: 'inspiration',
    sourceHash: saved.manifest.hash,
    relevance,
    targetProject: basename(await realpath(project)),
    importedAt: new Date().toISOString(),
  };
  return publishBundle(
    location(project, { scope: 'imported' }),
    id,
    saved.manifest,
    saved.files,
    reuse,
  );
}
