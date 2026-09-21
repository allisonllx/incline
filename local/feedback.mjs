import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';

const digest = (data) => createHash('sha256').update(data).digest('hex');
const fail = (message) => {
  throw new Error(`Invalid feedback: ${message}`);
};
function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('expected object');
  for (const key of Object.keys(value))
    if (!fields.includes(key)) fail(`unknown field ${key}`);
}
function text(value, name, max = 10000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail(name);
}
function id(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    fail('unsafe ID');
}
function list(value, name, max) {
  if (!Array.isArray(value) || value.length > max) fail(name);
}
export function validateBatch(data) {
  object(data, ['id', 'mode', 'coverage', 'artifacts', 'events']);
  id(data.id);
  if (!['live', 'retrospective'].includes(data.mode)) fail('mode');
  object(data.coverage, ['source', 'limitations']);
  text(data.coverage.source, 'coverage source');
  list(data.coverage.limitations, 'limitations', 100);
  data.coverage.limitations.forEach((value) => text(value, 'limitation'));
  list(data.artifacts, 'artifacts', 24);
  list(data.events, 'events', 100);
  if (!data.events.length) fail('at least one event required');
  const artifactIds = new Set();
  for (const artifact of data.artifacts) {
    object(artifact, ['id', 'path', 'locator', 'missingReason']);
    id(artifact.id);
    if (artifactIds.has(artifact.id)) fail('duplicate artifact ID');
    artifactIds.add(artifact.id);
    if (artifact.path !== undefined) {
      text(artifact.path, 'artifact path');
      if (artifact.missingReason !== undefined)
        fail('snapshot cannot be missing');
    } else
      text(artifact.missingReason, 'missingReason required without a snapshot');
    if (artifact.locator !== undefined)
      text(artifact.locator, 'artifact locator');
  }
  const eventIds = new Set();
  for (const event of data.events) {
    object(event, [
      'id',
      'kind',
      'evidence',
      'text',
      'source',
      'occurredAt',
      'context',
      'artifactIds',
      'disposition',
    ]);
    if (event.disposition !== undefined) {
      object(event.disposition, ['publication', 'readiness', 'aesthetic', 'basis']);
      for (const [axis, values] of Object.entries({
        publication: ['unknown', 'authorized'],
        readiness: ['unknown', 'acceptable'],
        aesthetic: ['unknown', 'positive', 'preferred'],
      })) if (!values.includes(event.disposition[axis])) fail(`disposition ${axis}`);
      text(event.disposition.basis, 'disposition basis');
    }
    id(event.id);
    if (eventIds.has(event.id)) fail('duplicate event ID');
    eventIds.add(event.id);
    const kinds = [
      'positive',
      'negative',
      'directed-edit',
      'reversion',
      'acceptance',
      'preservation',
      'hypothesis',
      'pause',
    ];
    if (!kinds.includes(event.kind)) fail('event kind');
    if (
      !['verbatim', 'summary', 'observation', 'inference'].includes(
        event.evidence,
      )
    )
      fail('evidence type');
    if (
      [
        'positive',
        'negative',
        'directed-edit',
        'reversion',
        'acceptance',
      ].includes(event.kind) &&
      !['verbatim', 'summary'].includes(event.evidence)
    )
      fail(`${event.kind} requires explicit user evidence`);
    if (event.kind === 'hypothesis' && event.evidence !== 'inference')
      fail('hypothesis must be inference');
    if (event.kind === 'preservation' && event.evidence !== 'observation')
      fail('preservation is only an observation');
    for (const field of ['text', 'source', 'context'])
      text(event[field], field);
    if (
      event.occurredAt !== null &&
      (typeof event.occurredAt !== 'string' ||
        Number.isNaN(Date.parse(event.occurredAt)))
    )
      fail('occurredAt must be a known timestamp or null');
    list(event.artifactIds, 'artifact references', 24);
    if (event.artifactIds.some((value) => !artifactIds.has(value)))
      fail('unknown artifact reference');
  }
  return data;
}

export async function readFeedback(project) {
  const directory = join(project, '.incline', 'feedback');
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return { directory, batches: [] };
    throw error;
  }
  const batches = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.pending-')) continue;
    id(entry.name);
    if (!entry.isDirectory()) fail(`unexpected journal entry ${entry.name}`);
    const saved = JSON.parse(
      await readFile(join(directory, entry.name, 'record.json'), 'utf8'),
    );
    if (
      saved.version !== 1 ||
      saved.id !== entry.name ||
      !Array.isArray(saved.events) ||
      !Array.isArray(saved.artifacts)
    )
      fail(`unreadable record ${entry.name}`);
    validateBatch({
      id: saved.id,
      mode: saved.mode,
      coverage: saved.coverage,
      events: saved.events,
      artifacts: saved.artifacts.map((artifact) => {
        const { snapshot, sha256, ...original } = artifact;
        if (
          original.path &&
          (typeof snapshot !== 'string' || typeof sha256 !== 'string')
        )
          fail('missing snapshot metadata');
        return original;
      }),
    });
    if (
      typeof saved.recordedAt !== 'string' ||
      Number.isNaN(Date.parse(saved.recordedAt))
    )
      fail('invalid recordedAt');
    for (const artifact of saved.artifacts) {
      if (!artifact.snapshot) continue;
      if (
        !/^assets\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/.test(artifact.snapshot)
      )
        fail('invalid snapshot path');
      const bytes = await readFile(
        join(directory, entry.name, artifact.snapshot),
      );
      if (digest(bytes) !== artifact.sha256)
        fail(`snapshot changed: ${artifact.id}`);
    }
    batches.push(saved);
  }
  batches.sort(
    (a, b) =>
      a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id),
  );
  return { directory, batches };
}

export async function recordFeedback(project, input, inputDirectory) {
  const data = validateBatch(input);
  if (!(await stat(project)).isDirectory()) fail('project must be a directory');
  const directory = join(project, '.incline', 'feedback');
  const destination = join(directory, data.id);
  const inputHash = digest(JSON.stringify(data));
  async function existing() {
    try {
      const saved = JSON.parse(
        await readFile(join(destination, 'record.json'), 'utf8'),
      );
      if (saved.inputHash !== inputHash)
        throw new Error(
          `Feedback ${data.id} already exists with different evidence; use a new ID for corrections.`,
        );
      return {
        status: 'already-recorded',
        recordPath: join(destination, 'record.json'),
      };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }
  const prior = await existing();
  if (prior) return prior;
  await mkdir(directory, { recursive: true });
  const staging = await mkdtemp(join(directory, '.pending-'));
  try {
    const artifacts = [];
    let totalBytes = 0;
    for (const artifact of data.artifacts) {
      if (!artifact.path) {
        artifacts.push(artifact);
        continue;
      }
      const source = resolve(inputDirectory, artifact.path);
      const info = await stat(source);
      if (!info.isFile() || info.size > 8 * 1024 * 1024)
        fail('artifact must be a file of at most 8 MB');
      const bytes = await readFile(source);
      totalBytes += bytes.length;
      if (bytes.length > 8 * 1024 * 1024 || totalBytes > 32 * 1024 * 1024)
        fail('snapshot size limit exceeded');
      const extension = extname(source);
      const snapshot = `assets/${artifact.id}${/^\.[a-zA-Z0-9]{1,10}$/.test(extension) ? extension : ''}`;
      await mkdir(join(staging, 'assets'), { recursive: true });
      await writeFile(join(staging, snapshot), bytes, {
        flag: 'wx',
        mode: 0o600,
      });
      artifacts.push({
        ...artifact,
        path: source,
        snapshot,
        sha256: digest(bytes),
      });
    }
    const record = {
      version: 1,
      ...data,
      artifacts,
      inputHash,
      recordedAt: new Date().toISOString(),
    };
    await writeFile(
      join(staging, 'record.json'),
      JSON.stringify(record, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    try {
      await rename(staging, destination);
    } catch (error) {
      if (['EEXIST', 'ENOTEMPTY'].includes(error.code)) {
        const result = await existing();
        if (result) return result;
      }
      throw error;
    }
    return { status: 'recorded', recordPath: join(destination, 'record.json') };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
