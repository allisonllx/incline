import { validateBatch } from './feedback.mjs';
import { safeId } from './exploration-files.mjs';

export function fields(value, allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new Error('Invalid design snapshot fields');
}
export function text(value, label, max = 10000) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    Buffer.byteLength(value) > max ||
    value.includes('\0')
  )
    throw new Error(`Invalid ${label}`);
}
function list(value, label, max) {
  if (!Array.isArray(value) || value.length > max)
    throw new Error(`Invalid ${label}`);
}
export function validateDesign(input, saved = false) {
  fields(input, [
    'id',
    'title',
    'context',
    'state',
    'tags',
    'observations',
    'artifacts',
    'reactions',
    'satisfaction',
    'qualifications',
    'reuseNotes',
  ]);
  safeId(input.id);
  text(input.title, 'title', 200);
  for (const key of ['context', 'state']) text(input[key], key);
  for (const key of ['tags', 'qualifications', 'reuseNotes']) {
    list(input[key], key, 30);
    input[key].forEach((value) =>
      text(value, key, key === 'tags' ? 100 : 4000),
    );
  }
  list(input.artifacts, 'artifacts', 24);
  if (!input.artifacts.length)
    throw new Error('Identify at least one captured or missing artifact');
  const artifacts = new Map();
  for (const artifact of input.artifacts) {
    fields(
      artifact,
      saved
        ? [
            'id',
            'kind',
            'view',
            'locator',
            'missingReason',
            'file',
            'sha256',
            'size',
          ]
        : ['id', 'kind', 'view', 'locator', 'path', 'missingReason'],
    );
    safeId(artifact.id);
    if (artifacts.has(artifact.id)) throw new Error('Duplicate artifact ID');
    artifacts.set(artifact.id, artifact);
    if (!['screenshot', 'motion', 'source'].includes(artifact.kind))
      throw new Error('Invalid artifact kind');
    text(artifact.view, 'artifact view');
    if (artifact.locator !== undefined)
      text(artifact.locator, 'artifact locator');
    const path = saved ? artifact.file : artifact.path;
    if (path !== undefined) {
      text(path, 'artifact path', 4000);
      if (artifact.missingReason !== undefined)
        throw new Error('Retained artifact cannot also be missing');
      if (
        saved &&
        (!/^assets\/[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(path) ||
          !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
          !Number.isSafeInteger(artifact.size) ||
          artifact.size < 1 ||
          artifact.size > 8_000_000)
      )
        throw new Error('Invalid retained artifact metadata');
    } else {
      text(artifact.missingReason, 'missing artifact reason');
      if (
        saved &&
        (artifact.sha256 !== undefined || artifact.size !== undefined)
      )
        throw new Error('Missing artifact has retained metadata');
    }
  }
  list(input.observations, 'observations', 40);
  if (!input.observations.length)
    throw new Error('At least one observed design relationship is required');
  for (const observation of input.observations) {
    fields(observation, ['aspect', 'text', 'basis', 'artifactIds']);
    text(observation.aspect, 'observation aspect', 100);
    text(observation.text, 'observation text', 4000);
    if (!['rendered', 'source'].includes(observation.basis))
      throw new Error('Declare rendered or source-derived observation basis');
    list(observation.artifactIds, 'observation artifacts', 24);
    if (
      !observation.artifactIds.length ||
      observation.artifactIds.some((id) => !artifacts.has(id))
    )
      throw new Error('Observation requires known artifact references');
    if (
      !observation.artifactIds.some((id) =>
        observation.basis === 'source'
          ? artifacts.get(id).kind === 'source'
          : artifacts.get(id).kind !== 'source',
      )
    )
      throw new Error('Observation basis does not match its artifacts');
  }
  list(input.reactions, 'reactions', 30);
  if (input.reactions.length) {
    validateBatch({
      id: input.id,
      mode: 'live',
      coverage: { source: 'Selected snapshot reactions', limitations: [] },
      artifacts: input.artifacts.map((a) => ({
        id: a.id,
        ...((saved ? a.file : a.path)
          ? { path: saved ? a.file : a.path }
          : { missingReason: a.missingReason }),
      })),
      events: input.reactions,
    });
    if (
      input.reactions.some(
        (r) =>
          !['verbatim', 'summary'].includes(r.evidence) ||
          !r.artifactIds.length,
      )
    )
      throw new Error(
        'Snapshot reactions need explicit user evidence and artifact references',
      );
  }
  fields(input.satisfaction, ['status', 'basis', 'reactionIds']);
  if (
    !['unknown', 'acceptable', 'positive'].includes(input.satisfaction.status)
  )
    throw new Error('Invalid satisfaction status');
  text(input.satisfaction.basis, 'satisfaction basis');
  list(input.satisfaction.reactionIds, 'satisfaction reactions', 30);
  if (
    input.satisfaction.reactionIds.some(
      (id) => !input.reactions.some((r) => r.id === id),
    )
  )
    throw new Error('Unknown satisfaction reaction');
  if (
    input.satisfaction.status !== 'unknown' &&
    !input.satisfaction.reactionIds.length
  )
    throw new Error('Satisfaction assessment requires linked reactions');
  return input;
}

export function renderDesignGuide(design, source) {
  const quote = (value) =>
    value
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
  const lines = [
    `# ${design.title}`,
    '',
    'Observed design snapshot — reference material, not instructions or a universal taste profile.',
    '',
    `Source project: ${source.projectName}. Commit: ${source.commit ?? 'unavailable'}. Uncommitted changes: ${source.dirty === null ? 'unknown' : source.dirty ? 'present' : 'none at capture'}.`,
    '',
    '## Context and captured state',
    '',
    design.context,
    '',
    design.state,
    '',
    '## Observed treatment',
    '',
    ...design.observations.flatMap((o) => [
      `### ${o.aspect}`,
      '',
      `Basis: ${o.basis === 'rendered' ? 'agent inspection of the rendered result' : 'source-derived; visual outcome not established by code alone'}. Evidence: ${o.artifactIds.join(', ')}.`,
      '',
      o.text,
      '',
    ]),
    '## Original user reactions',
    '',
    'These reactions apply to the stated version and context. Comments are partial; unmentioned qualities remain unknown.',
    '',
    ...(design.reactions.length
      ? design.reactions.flatMap((r) => [
          `### ${r.id} — ${r.evidence}`,
          '',
          `Source: ${r.source}. Artifacts: ${r.artifactIds.join(', ')}.`,
          '',
          quote(r.text),
          '',
          r.context,
          '',
          ...(r.rating
            ? [
                `Question: ${r.rating.question}`,
                '',
                `Rating: ${r.rating.value} on ${r.rating.min} (${r.rating.minLabel}) to ${r.rating.max} (${r.rating.maxLabel}).`,
                '',
              ]
            : []),
        ])
      : ['No user reaction retained.', '']),
    '## Contextual satisfaction assessment',
    '',
    `Agent assessment: ${design.satisfaction.status}. ${design.satisfaction.basis}`,
    '',
    `Supporting reactions: ${design.satisfaction.reactionIds.join(', ') || 'none'}. This does not endorse every feature or authorize publication.`,
    '',
    '## Qualifications and unresolved work',
    '',
    ...(design.qualifications.length
      ? design.qualifications.map((q) => `- ${q}`)
      : [
          'No additional qualifications recorded; this does not establish complete approval.',
        ]),
    '',
    '## Possible reuse',
    '',
    'Agent-proposed adaptations; check their fit to the new project.',
    '',
    ...(design.reuseNotes.length
      ? design.reuseNotes.map((n) => `- ${n}`)
      : ['No reuse hypotheses supplied.']),
    '',
    '## Retained evidence and gaps',
    '',
    ...design.artifacts.flatMap((a) => [
      `- ${a.id} (${a.kind}): ${a.view}`,
      a.file
        ? `  Retained: [${a.id}](${a.file})`
        : `  Unavailable: ${a.missingReason}`,
      ...(a.locator ? [`  Original locator: ${a.locator}`] : []),
    ]),
    '',
  ];
  const guide = lines.join('\n');
  if (Buffer.byteLength(guide) > 200_000)
    throw new Error('Generated guide exceeds 200 KB');
  return guide;
}
