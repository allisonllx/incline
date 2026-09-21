import { readdir, readFile, lstat, mkdir, writeFile, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateBatch } from './feedback.mjs';
import { readInsightRevision } from './insights.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const key = (ref) => `${ref.batchId}/${ref.eventId}/${ref.recordHash}`;
function check(ok, message) { if (!ok) throw new Error(`Invalid review: ${message}`); }
function id(value) { check(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value), 'ID'); }
function fields(value, names) {
  check(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => names.includes(k)), 'fields');
}
function refs(values) {
  check(Array.isArray(values) && values.length > 0 && values.length <= 100, 'events');
  for (const ref of values) {
    fields(ref, ['batchId', 'eventId', 'recordHash']);
    id(ref.batchId); id(ref.eventId);
    check(typeof ref.recordHash === 'string' && /^[a-f0-9]{64}$/.test(ref.recordHash), 'hash');
  }
  check(new Set(values.map(key)).size === values.length, 'duplicate events');
}
function validate(data) {
  fields(data, ['id', 'events', 'outcomes']); id(data.id); refs(data.events);
  check(Array.isArray(data.outcomes) && data.outcomes.length > 0 && data.outcomes.length <= 100, 'outcomes');
  const covered = [];
  for (const outcome of data.outcomes) {
    fields(outcome, ['eventRefs', 'action', 'reason', 'insightRevisions']); refs(outcome.eventRefs);
    check(['updated', 'no-change', 'deferred'].includes(outcome.action), 'action');
    check(typeof outcome.reason === 'string' && outcome.reason.trim() && outcome.reason.length <= 10000, 'reason');
    check(Array.isArray(outcome.insightRevisions) && outcome.insightRevisions.length <= 100, 'insight revisions');
    check(outcome.action !== 'updated' || outcome.insightRevisions.length > 0, 'updated requires revision');
    for (const ref of outcome.insightRevisions) {
      fields(ref, ['id', 'revision']); id(ref.id);
      check(Number.isSafeInteger(ref.revision) && ref.revision > 0, 'revision');
    }
    covered.push(...outcome.eventRefs.map(key));
  }
  check(covered.length === data.events.length && new Set(covered).size === covered.length && data.events.every(ref => covered.includes(key(ref))), 'each event must be covered exactly once');
}
async function names(path) {
  try { check((await lstat(path)).isDirectory(), 'directory must not be a symlink'); return (await readdir(path)).sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function json(path) {
  const info = await lstat(path);
  check(info.isFile() && info.size <= 2_000_000, 'file or size');
  const bytes = await readFile(path); return { data: JSON.parse(bytes), recordHash: hash(bytes) };
}
async function evidence(project) {
  await names(join(project, '.incline'));
  const directory = join(project, '.incline/feedback');
  const events = [], warnings = [];
  for (const batchId of await names(directory)) {
    if (batchId.startsWith('.pending-')) continue;
    id(batchId);
    const base = join(directory, batchId);
    check((await lstat(base)).isDirectory(), 'feedback directory');
    let loaded;
    try { loaded = await json(join(base, 'record.json')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; warnings.push(`Unsupported legacy feedback folder: ${batchId}`); continue; }
    const { data, recordHash } = loaded;
    check(data.version === 1 && data.id === batchId && typeof data.recordedAt === 'string' && !Number.isNaN(Date.parse(data.recordedAt)), 'record metadata');
    validateBatch({ id: data.id, mode: data.mode, coverage: data.coverage, events: data.events,
      artifacts: data.artifacts.map(({ snapshot, sha256, ...artifact }) => {
        if (artifact.path) check(typeof snapshot === 'string' && /^assets\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/.test(snapshot) && /^[a-f0-9]{64}$/.test(sha256), 'snapshot metadata');
        return artifact;
      }) });
    events.push(...data.events.map(event => ({ batchId, eventId: event.id, recordHash })));
  }
  return { events, warnings };
}
async function receipt(path) {
  const { data } = await json(path);
  const { version, recordedAt, inputHash, ...input } = data;
  validate(input);
  check(version === 1 && typeof recordedAt === 'string' && !Number.isNaN(Date.parse(recordedAt)) && inputHash === hash(JSON.stringify(input)), 'receipt metadata');
  return input;
}
export async function listPendingEvidence(project) {
  const { events, warnings } = await evidence(project);
  const completed = new Set();
  const directory = join(project, '.incline/reviews');
  for (const name of await names(directory)) {
    if (name.startsWith('.pending-')) continue;
    check(name.endsWith('.json'), 'receipt filename');
    const data = await receipt(join(directory, name));
    check(name === `${data.id}.json`, 'receipt ID mismatch');
    for (const outcome of data.outcomes) if (outcome.action !== 'deferred') outcome.eventRefs.forEach(ref => completed.add(key(ref)));
  }
  return { pending: events.filter(ref => !completed.has(key(ref))), warnings };
}
export async function saveReview(project, data) {
  validate(data);
  check((await lstat(project)).isDirectory(), 'project directory');
  const directory = join(project, '.incline/reviews');
  await names(join(project, '.incline'));
  await names(directory);
  const reviewPath = join(directory, `${data.id}.json`);
  const replay = async () => {
    const existing = await receipt(reviewPath);
    check(JSON.stringify(existing) === JSON.stringify(data), 'conflicting receipt ID');
    return { reviewPath, status: 'already-recorded' };
  };
  try { return await replay(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const available = new Set((await evidence(project)).events.map(key));
  check(data.events.every(ref => available.has(key(ref))), 'missing or changed source event');
  for (const outcome of data.outcomes) {
    const insights = await Promise.all(outcome.insightRevisions.map(ref => readInsightRevision(project, ref.id, ref.revision)));
    if (outcome.action === 'updated') {
      const linked = new Set(insights.flatMap(i => [...i.supportingEvidence, ...i.conflictingEvidence]).map(key));
      check(outcome.eventRefs.every(ref => linked.has(key(ref))), 'revision must link each updated event and source hash');
    }
  }
  await mkdir(join(project, '.incline'), { recursive: true });
  check((await lstat(join(project, '.incline'))).isDirectory(), 'project memory directory');
  await mkdir(directory, { recursive: true });
  check((await lstat(directory)).isDirectory(), 'review directory');
  const temp = join(directory, `.pending-${randomUUID()}`);
  try {
    await writeFile(temp, JSON.stringify({ ...data, version: 1, recordedAt: new Date().toISOString(), inputHash: hash(JSON.stringify(data)) }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    try { await link(temp, reviewPath); }
    catch (error) { if (error.code === 'EEXIST') return await replay(); throw error; }
  } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  return { reviewPath, status: 'saved' };
}
