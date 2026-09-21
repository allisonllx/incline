import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  lstat,
  rename,
  rm,
} from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readInsights } from './insights.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const safeId = /^[a-zA-Z0-9_-]{1,80}$/;
const safeGeneration = /^[a-f0-9-]{36}$/;
const digest = /^[a-f0-9]{64}$/;
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const tokens = (value) => [
  ...new Set(
    value
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [],
  ),
];
const escape = (value) =>
  value.replace(/[\\`*_{}[\]()#>!|<]/g, '\\$&').replace(/\r?\n/g, ' ');

// Freshness deliberately uses metadata rather than rereading every revision.
// Nanosecond ctime catches ordinary in-place changes even if mtime is restored.
// This is cache invalidation, not an integrity audit or evidence verification.
async function manifest(project) {
  const root = join(project, '.incline/insights');
  let ids;
  try {
    ids = await readdir(root);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const result = [];
  for (const id of ids.sort(compare)) {
    if (!safeId.test(id)) throw new Error('Invalid insight ID in source');
    const directory = join(root, id);
    if (!(await lstat(directory)).isDirectory())
      throw new Error('Invalid insight source directory');
    const revisions = (await readdir(directory))
      .filter((name) => /^[1-9][0-9]*\.json$/.test(name))
      .map((name) => Number(name.slice(0, -5)));
    if (!revisions.length) continue;
    const revision = Math.max(...revisions);
    if (!Number.isSafeInteger(revision))
      throw new Error('Invalid insight revision');
    const info = await lstat(join(directory, `${revision}.json`), {
      bigint: true,
    });
    if (!info.isFile()) throw new Error('Invalid insight source file');
    result.push({
      id,
      revision,
      size: String(info.size),
      mtimeNs: String(info.mtimeNs),
      ctimeNs: String(info.ctimeNs),
    });
  }
  return result;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const topicName = (aspect) => hash(aspect) + '.md';
const revisionRelative = (entry) =>
  `.incline/insights/${entry.id}/${entry.revision}.json`;
function compact(entry) {
  const {
    id,
    revision,
    aspect,
    scope,
    finding,
    status,
    qualifications,
    openQuestions,
    supportingEvidence,
    conflictingEvidence,
  } = entry;
  return {
    id,
    revision,
    aspect,
    scope,
    finding,
    status,
    qualifications,
    openQuestions,
    supportingEvidence,
    conflictingEvidence,
    revisionPath: revisionRelative(entry),
    topicPath: `topics/${topicName(aspect)}`,
  };
}
async function sources(project, before) {
  const { insights } = await readInsights(project);
  if (!same(before, await manifest(project)))
    throw new Error('Insight sources changed during read; retry');
  return insights
    .filter((entry) => entry.status !== 'superseded')
    .map(compact)
    .sort((a, b) => compare(a.id, b.id));
}
function sourceLink(from, project, path) {
  return relative(from, join(project, path)).split('\\').join('/');
}
function topicMarkdown(project, directory, aspect, entries) {
  const lines = [
    `# ${escape(aspect)}`,
    '',
    'Generated view. Edit authoritative insight revisions, then rebuild. These findings are interpretations with scoped evidence; repeated generated views are not new evidence.',
    '',
  ];
  for (const entry of entries) {
    lines.push(
      `## ${escape(entry.id)}`,
      '',
      escape(entry.finding),
      '',
      `Scope: ${escape(entry.scope)}. Status: ${entry.status}. Revision: ${entry.revision}.`,
      '',
      `[Authoritative revision](${sourceLink(directory, project, entry.revisionPath)})`,
      '',
    );
    for (const [label, values] of [
      ['Qualifications', entry.qualifications],
      ['Open questions', entry.openQuestions],
    ]) {
      lines.push(
        `### ${label}`,
        '',
        ...(values.length
          ? values.map((text) => `- ${escape(text)}`)
          : ['None recorded.']),
        '',
      );
    }
    for (const [label, refs] of [
      ['Supporting evidence', entry.supportingEvidence],
      ['Conflicting evidence', entry.conflictingEvidence],
    ]) {
      lines.push(`### ${label}`, '');
      for (const ref of refs)
        lines.push(
          `- [${ref.batchId}/${ref.eventId}](${sourceLink(directory, project, `.incline/feedback/${ref.batchId}/record.json`)}) — event ID: ${ref.eventId}; recorded SHA-256: ${ref.recordHash}`,
        );
      if (!refs.length) lines.push('None recorded.');
      lines.push('');
    }
    lines.push(
      `Inspect exact events and current artifact availability with: \`insights.mjs evidence --id ${entry.id} --project <project>\`. A link does not establish that an image exists or has been inspected.`,
      '',
    );
  }
  return lines.join('\n') + '\n';
}
async function directory(path) {
  await mkdir(path, { recursive: true });
  if (!(await lstat(path)).isDirectory())
    throw new Error('Knowledge output must be a real directory');
}
export async function rebuildKnowledge(project) {
  project = resolve(project);
  if (!(await lstat(project)).isDirectory())
    throw new Error('Project must be a directory');
  const before = await manifest(project);
  const entries = await sources(project, before);
  const root = join(project, '.incline/knowledge');
  await directory(join(project, '.incline'));
  await directory(root);
  await directory(join(root, 'generations'));
  const generation = randomUUID();
  const output = join(root, 'generations', generation);
  const pointerTemp = join(root, `.pending-${generation}`);
  let published = false;
  try {
    await mkdir(output);
    await mkdir(join(output, 'topics'));
    const aspects = [...new Set(entries.map((entry) => entry.aspect))].sort(
      compare,
    );
    const topicHashes = {};
    for (const aspect of aspects) {
      const path = `topics/${topicName(aspect)}`;
      const content = topicMarkdown(
        project,
        join(output, 'topics'),
        aspect,
        entries.filter((entry) => entry.aspect === aspect),
      );
      await writeFile(join(output, path), content, { flag: 'wx', mode: 0o600 });
      topicHashes[path] = hash(content);
    }
    const indexMarkdown = [
      '# Incline knowledge',
      '',
      'Generated navigation for current, non-superseded insights. Evidence and insight revisions remain authoritative. Freshness of this index does not mean pending feedback has been reviewed.',
      '',
      ...aspects.map(
        (aspect) => `- [${escape(aspect)}](topics/${topicName(aspect)})`,
      ),
      '',
    ].join('\n');
    await writeFile(join(output, 'index.md'), indexMarkdown, {
      flag: 'wx',
      mode: 0o600,
    });
    const index = {
      version: 1,
      manifest: before,
      entries,
      topicHashes,
      indexMarkdownHash: hash(indexMarkdown),
    };
    const bytes = json(index);
    await writeFile(join(output, 'index.json'), bytes, {
      flag: 'wx',
      mode: 0o600,
    });
    if (!same(before, await manifest(project)))
      throw new Error('Insight sources changed during rebuild; retry');
    await writeFile(
      pointerTemp,
      json({ version: 1, generation, indexHash: hash(bytes) }),
      { flag: 'wx', mode: 0o600 },
    );
    await rename(pointerTemp, join(root, 'current.json'));
    published = true;
    return {
      status: 'rebuilt',
      indexPath: join(output, 'index.json'),
      indexMarkdownPath: join(output, 'index.md'),
      topicPaths: aspects.map((aspect) =>
        join(output, 'topics', topicName(aspect)),
      ),
    };
  } finally {
    await rm(pointerTemp, { force: true });
    if (!published) await rm(output, { recursive: true, force: true });
  }
}
async function checkedRead(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > 20_000_000)
    throw new Error('Invalid knowledge cache file');
  return readFile(path);
}
async function cache(project, currentManifest) {
  const root = join(project, '.incline/knowledge');
  let pointerBytes;
  try {
    pointerBytes = await checkedRead(join(root, 'current.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return { freshness: 'missing' };
    return { freshness: 'corrupt' };
  }
  try {
    const pointer = JSON.parse(pointerBytes);
    if (
      pointer.version !== 1 ||
      !safeGeneration.test(pointer.generation) ||
      !digest.test(pointer.indexHash)
    )
      throw new Error('Invalid pointer');
    const output = join(root, 'generations', pointer.generation);
    if (!(await lstat(output)).isDirectory())
      throw new Error('Invalid generation');
    const bytes = await checkedRead(join(output, 'index.json'));
    if (hash(bytes) !== pointer.indexHash) throw new Error('Changed index');
    const index = JSON.parse(bytes);
    if (
      index.version !== 1 ||
      !Array.isArray(index.entries) ||
      !Array.isArray(index.manifest) ||
      !index.topicHashes ||
      !digest.test(index.indexMarkdownHash)
    )
      throw new Error('Invalid index');
    if (!same(index.manifest, currentManifest)) return { freshness: 'stale' };
    if (
      hash(await checkedRead(join(output, 'index.md'))) !==
      index.indexMarkdownHash
    )
      throw new Error('Changed navigation');
    for (const entry of index.entries) {
      if (
        !safeId.test(entry.id) ||
        !Number.isSafeInteger(entry.revision) ||
        entry.revision < 1 ||
        typeof entry.aspect !== 'string' ||
        typeof entry.scope !== 'string' ||
        typeof entry.finding !== 'string' ||
        !['tentative', 'explicit'].includes(entry.status) ||
        !Array.isArray(entry.qualifications) ||
        !Array.isArray(entry.openQuestions) ||
        !Array.isArray(entry.supportingEvidence) ||
        !Array.isArray(entry.conflictingEvidence) ||
        entry.revisionPath !== revisionRelative(entry) ||
        entry.topicPath !== `topics/${topicName(entry.aspect)}` ||
        !digest.test(index.topicHashes[entry.topicPath])
      )
        throw new Error('Invalid indexed insight');
    }
    return { freshness: 'current', index, output };
  } catch {
    return { freshness: 'corrupt' };
  }
}
function matches(entries, options) {
  const terms = tokens(options.query);
  if (options.query.trim() && !terms.length) return [];
  return entries
    .filter(
      (entry) =>
        (options.aspect === undefined || entry.aspect === options.aspect) &&
        (options.scope === undefined || entry.scope === options.scope),
    )
    .map((entry) => {
      const fields = [
        'aspect',
        'scope',
        'finding',
        'qualifications',
        'openQuestions',
      ];
      const sets = Object.fromEntries(
        fields.map((field) => [
          field,
          new Set(
            tokens(
              Array.isArray(entry[field])
                ? entry[field].join(' ')
                : entry[field],
            ),
          ),
        ]),
      );
      const matched = terms.filter((term) =>
        fields.some((field) => sets[field].has(term)),
      );
      const matchReasons = [];
      if (options.aspect !== undefined)
        matchReasons.push('Exact aspect filter');
      if (options.scope !== undefined) matchReasons.push('Exact scope filter');
      for (const field of fields) {
        const hits = matched.filter((term) => sets[field].has(term));
        if (hits.length) matchReasons.push(`${field}: ${hits.join(', ')}`);
      }
      return {
        ...entry,
        matchReasons,
        matchStrength: terms.length
          ? matched.length === terms.length
            ? 'all-tokens'
            : 'partial'
          : 'browse',
        matchedTokens: matched,
        requestedTokens: terms,
        score: matched.length,
      };
    })
    .filter((entry) => !terms.length || entry.score > 0)
    .sort((a, b) => b.score - a.score || compare(a.id, b.id));
}
export async function queryKnowledge(
  project,
  { query = '', aspect, scope, limit = 5 } = {},
) {
  if (
    typeof query !== 'string' ||
    query.length > 2000 ||
    (aspect !== undefined && typeof aspect !== 'string') ||
    (scope !== undefined && typeof scope !== 'string') ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 20
  )
    throw new Error('Invalid knowledge query; limit must be 1–20');
  project = resolve(project);
  const before = await manifest(project);
  let loaded = await cache(project, before);
  let ranked;
  if (loaded.freshness === 'current') {
    ranked = matches(loaded.index.entries, { query, aspect, scope });
    try {
      for (const topicPath of new Set(
        ranked.slice(0, limit).map((entry) => entry.topicPath),
      )) {
        if (
          hash(await checkedRead(join(loaded.output, topicPath))) !==
          loaded.index.topicHashes[topicPath]
        )
          throw new Error('Changed topic');
      }
    } catch {
      loaded = { freshness: 'corrupt' };
    }
  }
  if (loaded.freshness !== 'current')
    ranked = matches(await sources(project, before), { query, aspect, scope });
  if (!same(before, await manifest(project)))
    throw new Error('Insight sources changed during query; retry');
  return {
    freshness: loaded.freshness,
    source: loaded.freshness === 'current' ? 'index' : 'insights',
    warnings:
      loaded.freshness === 'current'
        ? []
        : [
            `Knowledge cache is ${loaded.freshness}; using authoritative insights. Run rebuild to refresh generated views.`,
          ],
    totalMatches: ranked.length,
    results: ranked.slice(0, limit).map(({ topicPath, ...entry }) => ({
      ...entry,
      revisionPath: join(project, entry.revisionPath),
      ...(loaded.freshness === 'current'
        ? { topicPath: join(loaded.output, topicPath) }
        : {}),
    })),
  };
}
