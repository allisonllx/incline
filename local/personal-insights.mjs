import {
  lstat,
  readFile,
  writeFile,
  mkdir,
  readdir,
  link,
  unlink,
} from 'node:fs/promises';
import { join, resolve, parse, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readInsightRevision } from './insights.mjs';
import { validateBatch } from './feedback.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digestPattern = /^[a-f0-9]{64}$/;
function id(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    throw new Error('Unsafe personal insight ID');
}
function text(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 10000)
    throw new Error('Invalid personal insight text');
}
function revision(value, zero = false) {
  if (!Number.isSafeInteger(value) || value < (zero ? 0 : 1))
    throw new Error('Invalid revision');
}
// Inspect each ancestor, including nonexistent destinations, before reads/writes.
async function safe(path) {
  path = resolve(path);
  let cursor = parse(path).root;
  for (const part of relative(cursor, path).split('/').filter(Boolean)) {
    cursor = join(cursor, part);
    try {
      if ((await lstat(cursor)).isSymbolicLink())
        throw new Error('Symlinks are not allowed');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return path;
}
async function bytes(path, limit = 48 * 1024 * 1024) {
  await safe(path);
  const info = await lstat(path);
  if (!info.isFile() || info.size > limit)
    throw new Error('Invalid or oversized snapshot file');
  const raw = await readFile(path);
  if (raw.length > limit) throw new Error('Oversized snapshot file');
  return raw;
}
function directory(value) {
  if (typeof value !== 'string' || !value)
    throw new Error('Personal operations are disabled by --local-only');
  return resolve(value);
}
function fields(value, allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new Error('Invalid selection fields');
}
function validateSelection(selection) {
  if (!selection || typeof selection !== 'object')
    throw new Error('Invalid selection');
  id(selection.id);
  revision(selection.expectedRevision, true);
  for (const key of ['aspect', 'finding', 'scope']) text(selection[key]);
  if (typeof selection.reviewed !== 'boolean')
    throw new Error('Selection must declare its human-reviewed state');
  if (!['tentative', 'explicit', 'superseded'].includes(selection.status))
    throw new Error('Invalid status');
  if (!Array.isArray(selection.exceptions) || selection.exceptions.length > 20)
    throw new Error('Invalid exceptions');
  selection.exceptions.forEach(text);
  if (
    !Array.isArray(selection.sources) ||
    !selection.sources.length ||
    selection.sources.length > 20
  )
    throw new Error('Select 1–20 sources');
}
async function collect(selection) {
  validateSelection(selection);
  fields(selection, [
    'id',
    'expectedRevision',
    'reviewed',
    'aspect',
    'finding',
    'scope',
    'exceptions',
    'status',
    'sources',
    'selectionHash',
  ]);
  const sources = [];
  let total = 0;
  for (const source of selection.sources) {
    fields(source, [
      'project',
      'id',
      'revision',
      'label',
      'context',
      'evidence',
      'gapReason',
      'sha256',
    ]);
    id(source.id);
    revision(source.revision);
    text(source.label);
    text(source.context);
    if (!Array.isArray(source.evidence) || source.evidence.length > 50)
      throw new Error('Invalid selected evidence');
    const project = directory(source.project);
    const path = join(
      project,
      '.incline/insights',
      source.id,
      `${source.revision}.json`,
    );
    let insight;
    let sourceHash;
    try {
      const raw = await bytes(path, 2_000_000);
      sourceHash = hash(raw);
      insight = await readInsightRevision(project, source.id, source.revision);
      if (hash(await bytes(path, 2_000_000)) !== sourceHash)
        throw new Error('Source insight changed during selection');
    } catch (error) {
      if (error.code !== 'ENOENT' || !source.gapReason) throw error;
      text(source.gapReason);
      if (source.evidence.length)
        throw new Error('Unavailable source cannot resolve selected evidence');
      sources.push({
        id: source.id,
        revision: source.revision,
        label: source.label,
        context: source.context,
        gapReason: source.gapReason,
        evidence: [],
      });
      continue;
    }
    if (source.sha256 !== undefined && source.sha256 !== sourceHash)
      throw new Error('Source insight hash mismatch');
    if (!source.evidence.length)
      throw new Error(
        'Select at least one evidence event for each available source',
      );
    const evidence = [];
    const seen = new Set();
    for (const ref of source.evidence) {
      fields(ref, ['batchId', 'eventId', 'role']);
      id(ref.batchId);
      id(ref.eventId);
      if (!['supporting', 'conflicting'].includes(ref.role))
        throw new Error('Select evidence role');
      const key = `${ref.batchId}/${ref.eventId}`;
      if (seen.has(key)) throw new Error('Duplicate selected evidence');
      seen.add(key);
      const original = insight[`${ref.role}Evidence`].find(
        (e) => e.batchId === ref.batchId && e.eventId === ref.eventId,
      );
      if (!original)
        throw new Error(
          'Evidence must be linked to the selected source revision with its original role',
        );
      const base = join(project, '.incline/feedback', ref.batchId);
      const raw = await bytes(join(base, 'record.json'), 2_000_000);
      if (hash(raw) !== original.recordHash)
        throw new Error('Source evidence hash mismatch');
      const record = JSON.parse(raw);
      const matches = record.events?.filter((e) => e.id === ref.eventId);
      if (
        record.version !== 1 ||
        record.id !== ref.batchId ||
        matches?.length !== 1 ||
        !Array.isArray(record.artifacts)
      )
        throw new Error('Invalid source evidence');
      const event = matches[0];
      const selectedArtifacts = record.artifacts.filter((a) =>
        event.artifactIds?.includes(a.id),
      );
      validateBatch({
        id: record.id,
        mode: record.mode,
        coverage: record.coverage,
        events: [event],
        artifacts: selectedArtifacts.map(
          ({ snapshot: _snapshot, sha256: _sha256, ...original }) => original,
        ),
      });
      if (
        typeof record.recordedAt !== 'string' ||
        Number.isNaN(Date.parse(record.recordedAt))
      )
        throw new Error('Invalid source evidence timestamp');
      const artifacts = [];
      for (const artifactId of new Set(event.artifactIds ?? [])) {
        const matches = record.artifacts.filter((a) => a.id === artifactId);
        if (matches.length !== 1)
          throw new Error('Missing or ambiguous artifact');
        const artifact = matches[0];
        const { path: originalPath, snapshot, ...metadata } = artifact;
        const saved = {
          ...metadata,
          ...(originalPath ? { originalPath } : {}),
        };
        if (snapshot) {
          if (!/^assets\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/.test(snapshot))
            throw new Error('Unsafe artifact path');
          try {
            const asset = await bytes(join(base, snapshot), 8 * 1024 * 1024);
            if (hash(asset) !== artifact.sha256)
              throw new Error('Source artifact hash mismatch');
            total += asset.length;
            if (total > 32 * 1024 * 1024)
              throw new Error('Selected assets exceed 32 MB');
            saved.availability = 'snapshot-saved';
            saved.contentBase64 = asset.toString('base64');
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            saved.availability = 'snapshot-missing';
            saved.missingReason = 'Source snapshot missing at selection time';
          }
        } else saved.availability = 'unavailable';
        artifacts.push(saved);
      }
      evidence.push({
        ...ref,
        recordHash: original.recordHash,
        event,
        coverage: record.coverage,
        mode: record.mode,
        recordedAt: record.recordedAt,
        artifacts,
      });
    }
    const {
      revisionPath: _revisionPath,
      supportingEvidence: _supportingEvidence,
      conflictingEvidence: _conflictingEvidence,
      ...sourceFinding
    } = insight;
    sources.push({
      id: source.id,
      revision: source.revision,
      label: source.label,
      context: source.context,
      sha256: sourceHash,
      finding: sourceFinding,
      evidence,
    });
  }
  return {
    version: 1,
    id: selection.id,
    revision: selection.expectedRevision + 1,
    aspect: selection.aspect,
    finding: selection.finding,
    scope: selection.scope,
    exceptions: selection.exceptions,
    status: selection.status,
    reviewed: selection.reviewed,
    sources,
  };
}
function compactSnapshot(snapshot) {
  return {
    ...snapshot,
    sources: snapshot.sources.map((source) => ({
      ...source,
      evidence: source.evidence.map((event) => ({
        ...event,
        artifacts: event.artifacts.map(({ contentBase64, ...artifact }) => ({
          ...artifact,
          bytes: contentBase64
            ? Buffer.from(contentBase64, 'base64').length
            : 0,
        })),
      })),
    })),
  };
}
const selectionHash = (snapshot) =>
  hash(JSON.stringify({ ...snapshot, reviewed: true }));
export async function previewPersonalInsight(directoryPath, selection) {
  directory(directoryPath);
  const snapshot = await collect(selection);
  const compact = compactSnapshot(snapshot);
  return {
    operation: 'preview',
    snapshot: compact,
    selectionHash: selectionHash(snapshot),
    copiedAssets: compact.sources.flatMap((s) =>
      s.evidence.flatMap((e) =>
        e.artifacts.map((a) => ({
          source: s.label,
          batchId: e.batchId,
          eventId: e.eventId,
          ...a,
        })),
      ),
    ),
  };
}
async function publish(path, value) {
  await safe(path);
  await mkdir(resolve(path, '..'), { recursive: true });
  const temp = join(resolve(path, '..'), `.pending-${randomUUID()}`);
  try {
    const content = JSON.stringify(value, null, 2) + '\n';
    if (Buffer.byteLength(content) > 48 * 1024 * 1024)
      throw new Error('Personal snapshot exceeds 48 MB');
    await writeFile(temp, content, { flag: 'wx', mode: 0o600 });
    await link(temp, path);
  } finally {
    await unlink(temp).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
  }
}
async function revisions(base) {
  await safe(base);
  try {
    return (await readdir(base))
      .filter((n) => /^[1-9][0-9]*\.json$/.test(n))
      .map((n) => Number(n.slice(0, -5)));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}
export async function savePersonalInsight(directoryPath, selection) {
  if (selection?.reviewed !== true)
    throw new Error('Selection must be explicitly human-reviewed');
  const base = directory(directoryPath);
  const collected = await collect(selection);
  if (
    selection.selectionHash !== undefined &&
    selection.selectionHash !== selectionHash(collected)
  )
    throw new Error('Selection changed since preview');
  const current = Math.max(0, ...(await revisions(join(base, selection.id))));
  if (current !== selection.expectedRevision)
    throw new Error('Stale personal insight revision');
  const snapshot = {
    ...collected,
    recordedAt: new Date().toISOString(),
  };
  validateSnapshot(snapshot);
  const snapshotPath = join(base, snapshot.id, `${snapshot.revision}.json`);
  await publish(snapshotPath, {
    snapshot,
    sha256: hash(JSON.stringify(snapshot)),
  });
  return { id: snapshot.id, revision: snapshot.revision, snapshotPath };
}
function validateSnapshot(s) {
  fields(s, [
    'version',
    'id',
    'revision',
    'aspect',
    'finding',
    'scope',
    'exceptions',
    'status',
    'reviewed',
    'sources',
    'recordedAt',
  ]);
  validateSelection({ ...s, expectedRevision: s.revision - 1 });
  const timestamp = (value) => {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
      throw new Error('Invalid personal snapshot timestamp');
  };
  timestamp(s.recordedAt);
  for (const source of s.sources) {
    fields(source, [
      'id',
      'revision',
      'label',
      'context',
      'gapReason',
      'evidence',
      'sha256',
      'finding',
    ]);
    id(source.id);
    revision(source.revision);
    text(source.label);
    text(source.context);
    if (!Array.isArray(source.evidence) || source.evidence.length > 50)
      throw new Error('Invalid personal snapshot evidence');
    if (source.gapReason !== undefined) {
      text(source.gapReason);
      if (source.evidence.length || source.finding || source.sha256)
        throw new Error('Invalid personal source gap');
      continue;
    }
    if (!digestPattern.test(source.sha256) || !source.evidence.length)
      throw new Error('Invalid source attribution');
    const f = source.finding;
    fields(f, [
      'version',
      'id',
      'aspect',
      'finding',
      'scope',
      'status',
      'qualifications',
      'openQuestions',
      'expectedRevision',
      'revision',
      'recordedAt',
    ]);
    if (
      f.version !== 1 ||
      f.id !== source.id ||
      f.revision !== source.revision ||
      f.expectedRevision !== f.revision - 1 ||
      !['tentative', 'explicit', 'superseded'].includes(f.status)
    )
      throw new Error('Invalid source finding');
    for (const key of ['aspect', 'finding', 'scope']) text(f[key]);
    for (const key of ['qualifications', 'openQuestions']) {
      if (!Array.isArray(f[key]) || f[key].length > 20)
        throw new Error('Invalid source finding notes');
      f[key].forEach(text);
    }
    timestamp(f.recordedAt);
    const seen = new Set();
    for (const e of source.evidence) {
      fields(e, [
        'batchId',
        'eventId',
        'role',
        'recordHash',
        'event',
        'coverage',
        'mode',
        'recordedAt',
        'artifacts',
      ]);
      id(e.batchId);
      id(e.eventId);
      timestamp(e.recordedAt);
      const key = `${e.batchId}/${e.eventId}`;
      if (
        seen.has(key) ||
        !['supporting', 'conflicting'].includes(e.role) ||
        !digestPattern.test(e.recordHash) ||
        e.event?.id !== e.eventId ||
        !Array.isArray(e.artifacts)
      )
        throw new Error('Invalid personal evidence bundle');
      seen.add(key);
      for (const a of e.artifacts) {
        fields(a, [
          'id',
          'locator',
          'missingReason',
          'sha256',
          'originalPath',
          'availability',
          'contentBase64',
        ]);
        if (
          !['snapshot-saved', 'snapshot-missing', 'unavailable'].includes(
            a.availability,
          )
        )
          throw new Error('Invalid personal asset availability');
        if (a.availability === 'snapshot-saved') {
          if (
            typeof a.contentBase64 !== 'string' ||
            !digestPattern.test(a.sha256)
          )
            throw new Error('Invalid personal asset content');
          const content = Buffer.from(a.contentBase64, 'base64');
          if (
            content.toString('base64') !== a.contentBase64 ||
            hash(content) !== a.sha256
          )
            throw new Error('Personal asset hash mismatch');
        } else if (a.contentBase64 !== undefined)
          throw new Error('Unavailable personal asset has content');
        if (
          a.availability === 'snapshot-missing' &&
          (!digestPattern.test(a.sha256) || !a.missingReason)
        )
          throw new Error('Invalid missing snapshot metadata');
      }
      validateBatch({
        id: e.batchId,
        mode: e.mode,
        coverage: e.coverage,
        events: [e.event],
        artifacts: e.artifacts.map((a) => ({
          id: a.id,
          ...(a.locator ? { locator: a.locator } : {}),
          ...(a.originalPath
            ? { path: a.originalPath }
            : { missingReason: a.missingReason }),
        })),
      });
      if (e.artifacts.some((a) => !e.event.artifactIds.includes(a.id)))
        throw new Error('Unselected personal asset');
    }
  }
}
export async function readPersonalInsight(
  directoryPath,
  insightId,
  requestedRevision,
) {
  const base = directory(directoryPath);
  id(insightId);
  const rev =
    requestedRevision ??
    Math.max(0, ...(await revisions(join(base, insightId))));
  revision(rev);
  const envelope = JSON.parse(
    await bytes(join(base, insightId, `${rev}.json`)),
  );
  fields(envelope, ['snapshot', 'sha256']);
  const s = envelope.snapshot;
  if (
    !s ||
    s.version !== 1 ||
    s.id !== insightId ||
    s.revision !== rev ||
    s.reviewed !== true ||
    hash(JSON.stringify(s)) !== envelope.sha256
  )
    throw new Error('Personal snapshot integrity check failed');
  validateSnapshot(s);
  return s;
}
export async function listPersonalInsights(directoryPath) {
  const base = directory(directoryPath);
  await safe(base);
  let names;
  try {
    names = await readdir(base);
  } catch (e) {
    if (e.code === 'ENOENT') return { insights: [] };
    throw e;
  }
  const insights = [];
  for (const name of names.sort()) {
    if (name.startsWith('.pending-')) continue;
    id(name);
    if (!(await revisions(join(base, name))).length) continue;
    const s = await readPersonalInsight(base, name);
    insights.push({
      id: s.id,
      revision: s.revision,
      finding: s.finding,
      scope: s.scope,
      exceptions: s.exceptions,
      status: s.status,
      sources: s.sources.map(({ id, revision, label, context, gapReason }) => ({
        id,
        revision,
        label,
        context,
        ...(gapReason ? { gapReason } : {}),
      })),
    });
  }
  return { insights };
}
export async function importPersonalInsight(
  directoryPath,
  insightId,
  project,
  { revision: selectedRevision, relevance } = {},
) {
  text(relevance);
  const snapshot = await readPersonalInsight(
    directoryPath,
    insightId,
    selectedRevision,
  );
  await safe(project);
  if (!(await lstat(project)).isDirectory())
    throw new Error('Project must be a directory');
  const draft = {
    version: 1,
    id: snapshot.id,
    status: 'tentative',
    aspect: snapshot.aspect,
    finding: snapshot.finding,
    scope: snapshot.scope,
    exceptions: snapshot.exceptions,
    relevance,
    requiresProjectReview: true,
    precedence:
      'Project-specific instructions take precedence within scope; this draft is not an explicit instruction.',
    provenance: {
      personalId: snapshot.id,
      revision: snapshot.revision,
      sha256: hash(JSON.stringify(snapshot)),
      importedAt: new Date().toISOString(),
    },
    snapshot,
  };
  const draftPath = join(
    project,
    '.incline/drafts/personal',
    snapshot.id,
    `${snapshot.revision}.json`,
  );
  await publish(draftPath, draft);
  const { snapshot: _snapshot, ...summary } = draft;
  return { draftPath, draft: summary, provenance: draft.provenance };
}
