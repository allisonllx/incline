import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  link,
  unlink,
  stat,
} from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function id(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    throw new Error('Invalid insight/evidence ID');
}
function text(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000)
    throw new Error('Invalid insight text');
}
function validate(data) {
  const keys = [
    'id',
    'aspect',
    'finding',
    'scope',
    'status',
    'qualifications',
    'openQuestions',
    'supportingEvidence',
    'conflictingEvidence',
    'expectedRevision',
  ];
  if (
    !data ||
    typeof data !== 'object' ||
    Object.keys(data).some((k) => !keys.includes(k))
  )
    throw new Error('Invalid insight fields');
  id(data.id);
  for (const key of ['aspect', 'finding', 'scope']) text(data[key]);
  if (!['tentative', 'explicit', 'superseded'].includes(data.status))
    throw new Error('Invalid insight status');
  if (!Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0)
    throw new Error('Invalid expected revision');
  for (const key of ['qualifications', 'openQuestions']) {
    if (!Array.isArray(data[key]) || data[key].length > 20)
      throw new Error('Invalid insight notes');
    data[key].forEach(text);
  }
  for (const key of ['supportingEvidence', 'conflictingEvidence']) {
    if (!Array.isArray(data[key]) || data[key].length > 50)
      throw new Error('Invalid evidence links');
    for (const ref of data[key]) {
      if (
        !ref ||
        Object.keys(ref).some((k) => !['batchId', 'eventId'].includes(k))
      )
        throw new Error('Invalid evidence reference');
      id(ref.batchId);
      id(ref.eventId);
    }
  }
  if (!data.supportingEvidence.length)
    throw new Error('An insight needs supporting evidence');
}
async function loadJson(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size > 2_000_000)
    throw new Error('Invalid or oversized evidence file');
  const raw = await readFile(path);
  return { data: JSON.parse(raw.toString('utf8')), hash: hash(raw) };
}
async function resolveEvidence(project, ref, inspectArtifacts = false) {
  id(ref.batchId);
  id(ref.eventId);
  const base = join(project, '.incline/feedback', ref.batchId);
  const recordPath = join(base, 'record.json');
  const loaded = await loadJson(recordPath);
  const record = loaded.data;
  if (
    record.version !== 1 ||
    record.id !== ref.batchId ||
    !Array.isArray(record.events) ||
    !Array.isArray(record.artifacts)
  )
    throw new Error('Invalid linked record');
  const matches = record.events.filter((e) => e.id === ref.eventId);
  if (matches.length !== 1)
    throw new Error(`Missing or ambiguous event ${ref.batchId}/${ref.eventId}`);
  const event = matches[0];
  const result = {
    batchId: ref.batchId,
    eventId: ref.eventId,
    recordHash: loaded.hash,
    recordPath,
    event,
    coverage: record.coverage,
  };
  if (ref.recordHash)
    result.changedSinceInsight = ref.recordHash !== loaded.hash;
  if (inspectArtifacts) {
    result.artifacts = [];
    for (const artifactId of event.artifactIds ?? []) {
      const artifact = record.artifacts.find((a) => a.id === artifactId);
      if (!artifact) throw new Error('Missing linked artifact entry');
      let availability = artifact.locator
        ? 'external-reference-only'
        : 'unavailable';
      let snapshotPath;
      if (artifact.missingReason) availability = 'unavailable';
      if (artifact.snapshot) {
        if (
          !/^assets\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/.test(artifact.snapshot)
        )
          throw new Error('Unsafe artifact snapshot path');
        snapshotPath = join(base, artifact.snapshot);
        try {
          availability =
            hash(await readFile(snapshotPath)) === artifact.sha256
              ? 'snapshot-saved'
              : 'snapshot-changed';
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          availability = 'snapshot-missing';
        }
      }
      result.artifacts.push({
        ...artifact,
        availability,
        ...(snapshotPath ? { snapshotPath } : {}),
      });
    }
  }
  return result;
}
async function latest(project, insightId, requestedRevision) {
  id(insightId);
  const directory = join(project, '.incline/insights', insightId);
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const revisions = names
    .filter((n) => /^[1-9][0-9]*\.json$/.test(n))
    .map((n) => Number(n.slice(0, -5)));
  if (!revisions.length) return null;
  const revision = requestedRevision ?? Math.max(...revisions);
  const path = join(directory, `${revision}.json`);
  const { data } = await loadJson(path);
  const {
    version,
    revision: savedRevision,
    recordedAt,
    supportingEvidence,
    conflictingEvidence,
    ...input
  } = data;
  const strip = (refs) =>
    refs.map(({ recordHash, ...ref }) => {
      if (!/^[a-f0-9]{64}$/.test(recordHash))
        throw new Error('Invalid evidence hash');
      return ref;
    });
  validate({
    ...input,
    supportingEvidence: strip(supportingEvidence),
    conflictingEvidence: strip(conflictingEvidence),
  });
  if (
    version !== 1 ||
    savedRevision !== revision ||
    data.id !== insightId ||
    !recordedAt ||
    Number.isNaN(Date.parse(recordedAt))
  )
    throw new Error('Invalid saved insight');
  return { ...data, revisionPath: path };
}
export async function readInsights(project, { id: insightId, aspect } = {}) {
  let ids;
  if (insightId) {
    id(insightId);
    ids = [insightId];
  } else {
    try {
      ids = await readdir(join(project, '.incline/insights'));
    } catch (error) {
      if (error.code === 'ENOENT') return { insights: [] };
      throw error;
    }
  }
  const insights = [];
  for (const value of ids.sort((a, b) => a.localeCompare(b))) {
    const current = await latest(project, value);
    if (current && (!aspect || current.aspect === aspect))
      insights.push(current);
  }
  return { insights };
}
export async function saveInsight(project, data) {
  validate(data);
  if (!(await stat(project)).isDirectory())
    throw new Error('Project must be a directory');
  const current = await latest(project, data.id);
  if ((current?.revision ?? 0) !== data.expectedRevision)
    throw new Error(
      'Stale insight revision; read current insight before updating',
    );
  const supporting = await Promise.all(
    data.supportingEvidence.map((ref) => resolveEvidence(project, ref)),
  );
  const conflicting = await Promise.all(
    data.conflictingEvidence.map((ref) => resolveEvidence(project, ref)),
  );
  if (
    data.status === 'explicit' &&
    !supporting.some(
      ({ event }) =>
        ['verbatim', 'summary'].includes(event.evidence) &&
        ['directed-edit', 'reversion'].includes(event.kind),
    )
  )
    throw new Error(
      'An explicit instruction needs a linked user instruction; inference or acceptance alone is insufficient',
    );
  const compact = (items) =>
    items.map(({ batchId, eventId, recordHash }) => ({
      batchId,
      eventId,
      recordHash,
    }));
  const record = {
    version: 1,
    ...data,
    revision: data.expectedRevision + 1,
    recordedAt: new Date().toISOString(),
    supportingEvidence: compact(supporting),
    conflictingEvidence: compact(conflicting),
  };
  const directory = join(project, '.incline/insights', data.id);
  await mkdir(directory, { recursive: true });
  const temp = join(directory, `.pending-${randomUUID()}`);
  const revisionPath = join(directory, `${record.revision}.json`);
  try {
    await writeFile(temp, JSON.stringify(record, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    try {
      await link(temp, revisionPath);
    } catch (error) {
      if (error.code === 'EEXIST')
        throw new Error(
          'Concurrent insight revision; read current insight before updating',
        );
      throw error;
    }
  } finally {
    await unlink(temp).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  return { status: 'saved', revision: record.revision, revisionPath };
}
export async function insightEvidence(project, insightId) {
  const insight = await latest(project, insightId);
  if (!insight) throw new Error('Insight not found');
  return {
    insight,
    supporting: await Promise.all(
      insight.supportingEvidence.map((ref) =>
        resolveEvidence(project, ref, true),
      ),
    ),
    conflicting: await Promise.all(
      insight.conflictingEvidence.map((ref) =>
        resolveEvidence(project, ref, true),
      ),
    ),
  };
}

export async function readInsightRevision(project, insightId, revision) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid revision');
  const result = await latest(project, insightId, revision);
  if (!result) throw new Error('Missing insight revision');
  return result;
}
