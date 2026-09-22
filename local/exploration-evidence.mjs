import { validateBatch } from './feedback.mjs';
import {
  safeBytes,
  digest,
  pathParts,
  MAX_ASSET_BYTES,
} from './exploration-files.mjs';

function unavailable(reason) {
  return { status: 'unavailable', reason };
}
async function journal(project, ref) {
  const loaded = await safeBytes(
    project,
    ['.incline', 'feedback', ref.batchId, 'record.json'],
    2_000_000,
  );
  if (!loaded) return unavailable('Feedback record missing');
  if (digest(loaded.bytes) !== ref.recordHash)
    return { status: 'changed', reason: 'Feedback record hash changed' };
  const record = JSON.parse(loaded.bytes.toString('utf8'));
  if (
    record.version !== 1 ||
    record.id !== ref.batchId ||
    !Array.isArray(record.artifacts)
  )
    throw new Error('Invalid linked feedback record');
  validateBatch({
    id: record.id,
    mode: record.mode,
    coverage: record.coverage,
    events: record.events,
    artifacts: record.artifacts.map(
      ({ snapshot: _snapshot, sha256: _sha256, ...original }) => original,
    ),
  });
  return { status: 'available', record, recordPath: loaded.path };
}
export async function resolveFeedbackLink(project, ref) {
  try {
    const loaded = await journal(project, ref);
    if (loaded.status !== 'available') return { ...ref, ...loaded };
    const matches = loaded.record.events.filter(
      (event) => event.id === ref.eventId,
    );
    if (matches.length !== 1)
      return { ...ref, ...unavailable('Missing or ambiguous feedback event') };
    return {
      ...ref,
      status: 'available',
      recordPath: loaded.recordPath,
      event: matches[0],
      coverage: loaded.record.coverage,
    };
  } catch (error) {
    return { ...ref, ...unavailable(error.message) };
  }
}
export async function resolveArtifact(project, studyId, artifact) {
  const base = {
    id: artifact.id,
    role: artifact.role,
    source: artifact.source,
    ...(artifact.locator ? { locator: artifact.locator } : {}),
  };
  try {
    const source = artifact.source;
    if (source.kind === 'unavailable')
      return { ...base, ...unavailable(source.reason) };
    let parts, expected;
    if (source.kind === 'study-file') {
      parts = ['.incline', 'studies', studyId, ...pathParts(source.path)];
      expected = source.sha256;
    } else {
      const linked = await journal(project, source);
      if (linked.status !== 'available')
        return { ...base, status: linked.status, reason: linked.reason };
      const matches = linked.record.artifacts.filter(
        (item) => item.id === source.artifactId,
      );
      if (matches.length !== 1)
        return {
          ...base,
          ...unavailable('Missing or ambiguous feedback artifact'),
        };
      const item = matches[0];
      if (!item.snapshot)
        return {
          ...base,
          ...unavailable(item.missingReason || 'No saved visual; locator only'),
        };
      if (
        !/^assets\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/.test(item.snapshot) ||
        !/^[a-f0-9]{64}$/.test(item.sha256)
      )
        throw new Error('Invalid feedback snapshot metadata');
      parts = [
        '.incline',
        'feedback',
        source.batchId,
        ...pathParts(item.snapshot),
      ];
      expected = item.sha256;
    }
    const loaded = await safeBytes(project, parts, MAX_ASSET_BYTES);
    if (!loaded) return { ...base, ...unavailable('Artifact file missing') };
    const actual = digest(loaded.bytes);
    if (actual !== expected)
      return {
        ...base,
        status: 'changed',
        reason: 'Artifact hash changed',
        expectedHash: expected,
        actualHash: actual,
      };
    return { ...base, status: 'available', path: loaded.path, sha256: actual };
  } catch (error) {
    return { ...base, ...unavailable(error.message) };
  }
}
export function relatedEvidence(snapshot, nodeId) {
  const nodes = new Map(snapshot.hypotheses.map((node) => [node.id, node]));
  if (!nodes.has(nodeId)) throw new Error('Unknown hypothesis ID');
  const ids = new Set(),
    pending = [nodeId];
  while (pending.length) {
    const id = pending.pop();
    if (ids.has(id)) continue;
    ids.add(id);
    pending.push(...nodes.get(id).parentIds);
  }
  const observationIds = new Set(
    [...ids].flatMap((id) => nodes.get(id).observationIds),
  );
  const artifactIds = new Set(
    snapshot.observations
      .filter((o) => observationIds.has(o.id))
      .map((o) => o.artifactId),
  );
  const directAttempts = snapshot.attempts.filter((a) =>
    a.hypothesisIds.some((id) => ids.has(id)),
  );
  const attemptIds = new Set(directAttempts.map((a) => a.id));
  const decisions = snapshot.decisions.filter(
    (d) =>
      [...d.nodeIds, ...d.returnToIds].some((id) => ids.has(id)) ||
      d.attemptIds.some((id) => attemptIds.has(id)),
  );
  // One explicit expansion preserves a comparison's evidence without following
  // every decision or attempt belonging to its sibling hypotheses.
  for (const decision of decisions)
    for (const id of decision.attemptIds) attemptIds.add(id);
  const attempts = snapshot.attempts.filter((a) => attemptIds.has(a.id));
  for (const attempt of attempts)
    for (const id of attempt.artifactIds) artifactIds.add(id);
  const refs = new Map();
  for (const row of [...attempts, ...decisions])
    for (const ref of row.feedbackLinks)
      refs.set(`${ref.batchId}/${ref.eventId}/${ref.recordHash}`, ref);
  return {
    artifacts: snapshot.artifacts.filter((a) => artifactIds.has(a.id)),
    feedback: [...refs.values()],
  };
}
export async function verifyNewEvidence(project, input, previous) {
  const existingArtifacts = new Set(previous?.artifacts.map((a) => a.id));
  for (const artifact of input.artifacts) {
    if (
      existingArtifacts.has(artifact.id) ||
      artifact.source.kind === 'unavailable'
    )
      continue;
    const result = await resolveArtifact(project, input.id, artifact);
    if (result.status !== 'available')
      throw new Error(
        `Artifact ${artifact.id}: ${result.status}: ${result.reason}`,
      );
  }
  const resolved = new Map();
  // Structural validation already guarantees immutable rows and feedback
  // prefixes. Exempt only old attachments on the same row, never global refs.
  for (const table of ['attempts', 'decisions']) {
    const previousRows = new Map(
      (previous?.[table] ?? []).map((row) => [row.id, row]),
    );
    for (const row of input[table])
      for (const ref of row.feedbackLinks.slice(
        previousRows.get(row.id)?.feedbackLinks.length ?? 0,
      )) {
        const key = JSON.stringify(ref);
        if (resolved.has(key)) continue;
        const result = await resolveFeedbackLink(project, ref);
        if (result.status !== 'available')
          throw new Error(
            `Feedback ${ref.eventId}: ${result.status}: ${result.reason}`,
          );
        resolved.set(key, result);
      }
  }
  for (const row of input.decisions.slice(previous?.decisions.length ?? 0)) {
    if (row.basis !== 'user-instruction') continue;
    let supported = false;
    for (const ref of row.feedbackLinks) {
      const result =
        resolved.get(JSON.stringify(ref)) ??
        (await resolveFeedbackLink(project, ref));
      if (
        result.status === 'available' &&
        ['directed-edit', 'reversion'].includes(result.event.kind) &&
        ['verbatim', 'summary'].includes(result.event.evidence)
      )
        supported = true;
    }
    if (!supported)
      throw new Error(
        'A user-instruction decision needs a linked user instruction',
      );
  }
}
