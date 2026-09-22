import { writeFile, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateExploration } from './exploration-model.mjs';
import {
  MAX_JSON_BYTES,
  canonical,
  digest,
  safeId,
  safeDirectory,
  safeEntries,
  safeBytes,
} from './exploration-files.mjs';
import {
  verifyNewEvidence,
  relatedEvidence,
  resolveArtifact,
  resolveFeedbackLink,
} from './exploration-evidence.mjs';

const parts = (id) => ['.incline', 'studies', safeId(id), 'exploration'];
function revisionNumber(revision) {
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new Error('Invalid revision');
}
async function revisions(project, id) {
  const entries = await safeEntries(project, parts(id));
  if (entries === null) return [];
  const numbers = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error('Unsafe symlink revision');
    if (/^\.pending-[a-f0-9-]+$/.test(entry.name) && entry.isFile()) continue;
    if (!entry.isFile() || !/^[1-9][0-9]*\.json$/.test(entry.name))
      throw new Error('Invalid exploration revision entry');
    const n = Number(entry.name.slice(0, -5));
    revisionNumber(n);
    numbers.push(n);
  }
  numbers.sort((a, b) => a - b);
  if (numbers.some((n, i) => n !== i + 1))
    throw new Error('Missing exploration revision');
  return numbers;
}
async function loadRevision(project, id, revision) {
  const loaded = await safeBytes(project, [...parts(id), `${revision}.json`]);
  if (!loaded) return null;
  const raw = JSON.parse(loaded.bytes.toString('utf8'));
  const { revision: savedRevision, recordedAt, requestHash, ...input } = raw;
  if (
    savedRevision !== revision ||
    input.expectedRevision !== revision - 1 ||
    input.id !== id ||
    typeof recordedAt !== 'string' ||
    Number.isNaN(Date.parse(recordedAt)) ||
    !/^[a-f0-9]{64}$/.test(requestHash)
  )
    throw new Error('Invalid exploration snapshot envelope');
  const valid = validateExploration(input);
  if (digest(canonical(valid)) !== requestHash)
    throw new Error('Exploration request hash integrity failure');
  return { ...valid, revision, recordedAt, requestHash };
}
export async function readExploration(project, { id, revision } = {}) {
  safeId(id);
  if (revision !== undefined) revisionNumber(revision);
  const available = await revisions(project, id);
  if (!available.length) return null;
  const requested = revision ?? available.at(-1);
  if (!available.includes(requested)) return null;
  const result = await loadRevision(project, id, requested);
  if (!result)
    throw new Error('Exploration revision disappeared while reading');
  return result;
}
export async function saveExploration(project, input) {
  const data = validateExploration(input);
  const current = await readExploration(project, { id: data.id });
  const revision = data.expectedRevision + 1;
  revisionNumber(revision);
  const requestHash = digest(canonical(data));
  const revisionPath = join(
    await safeDirectory(project, []),
    ...parts(data.id),
    `${revision}.json`,
  );
  const alreadySaved = async () => {
    const saved = await loadRevision(project, data.id, revision);
    if (saved?.requestHash === requestHash)
      return { status: 'already-saved', revision, revisionPath };
    throw new Error(
      'Conflicting exploration revision; read the latest checkpoint',
    );
  };
  if (current && revision <= current.revision) return alreadySaved();
  if ((current?.revision ?? 0) !== data.expectedRevision)
    throw new Error('Stale exploration revision; read before updating');
  validateExploration(data, current);
  await verifyNewEvidence(project, data, current);
  const snapshot = {
    ...data,
    revision,
    recordedAt: new Date().toISOString(),
    requestHash,
  };
  const bytes = JSON.stringify(snapshot, null, 2) + '\n';
  if (Buffer.byteLength(bytes) > MAX_JSON_BYTES)
    throw new Error('Exploration snapshot size limit exceeded');
  const directory = await safeDirectory(project, parts(data.id), true);
  const temp = join(directory, `.pending-${randomUUID()}`);
  try {
    await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
    // Recheck the parent immediately before publication; never follow a replaced
    // study directory into another project.
    await safeDirectory(project, parts(data.id));
    try {
      await link(temp, revisionPath);
    } catch (error) {
      if (error.code === 'EEXIST') return await alreadySaved();
      throw error;
    }
  } finally {
    await unlink(temp).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  return { status: 'saved', revision, revisionPath };
}
export async function listExplorations(project) {
  const entries = await safeEntries(project, ['.incline', 'studies']);
  const studies = [];
  for (const entry of entries ?? []) {
    safeId(entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink())
      throw new Error('Unsafe study directory');
    const snapshot = await readExploration(project, { id: entry.name });
    if (snapshot)
      studies.push({
        id: snapshot.id,
        revision: snapshot.revision,
        goal: snapshot.brief.goal,
      });
  }
  studies.sort((a, b) => a.id.localeCompare(b.id));
  return { studies };
}
export async function explorationEvidence(project, { id, nodeId }) {
  safeId(nodeId);
  const snapshot = await readExploration(project, { id });
  if (!snapshot) throw new Error('Exploration not found');
  const refs = relatedEvidence(snapshot, nodeId);
  const artifacts = [],
    feedback = [];
  for (const artifact of refs.artifacts)
    artifacts.push(await resolveArtifact(project, id, artifact));
  for (const ref of refs.feedback)
    feedback.push(await resolveFeedbackLink(project, ref));
  const warnings = [...artifacts, ...feedback]
    .filter((item) => item.status !== 'available')
    .map((item) => ({
      ...(item.id
        ? { artifactId: item.id }
        : { batchId: item.batchId, eventId: item.eventId }),
      status: item.status,
      reason: item.reason,
    }));
  return { artifacts, feedback, warnings };
}
