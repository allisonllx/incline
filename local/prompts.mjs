import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  opendir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { inspectAsset, maxAssetBytes, maxGuideBytes } from './assets.mjs';
import { assertPromptRecording } from './prompt-settings.mjs';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slug = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const hashPattern = /^[0-9a-f]{64}$/;
const maxEntries = 1000;
const maxRevisions = 100;
const maxMetadata = 1_000_000;
const maxPrompt = 300_000;
const maxAssets = 24;
const maxTotalAssets = 32_000_000;
const maxRuns = 1000;
const media = {
  'text/markdown': 'md',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const origins = [
  'published',
  'user-authored',
  'agent-authored',
  'agent-reconstructed',
];
const provenances = [
  'user',
  'source-text',
  'inspected-visual',
  'agent-hypothesis',
];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function plain(value, name, fields) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw fail(`${name} must be an object`);
  for (const field of Object.keys(value))
    if (!fields.includes(field)) throw fail(`${name}: unknown field ${field}`);
  return value;
}
function string(value, name, max, { empty = false } = {}) {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value) > max ||
    (!empty && !value.trim()) ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      value,
    )
  )
    throw fail(`Invalid ${name}`);
  return value;
}
function optionalString(value, name, max) {
  return value === undefined
    ? null
    : value === null
      ? null
      : string(value, name, max);
}
function boundedList(value, name, max) {
  if (!Array.isArray(value) || value.length > max)
    throw fail(`Invalid ${name}`);
  return value;
}
function safeId(value, name = 'ID') {
  if (typeof value !== 'string' || !uuid.test(value))
    throw fail(`Invalid ${name}`);
  return value;
}
function safeSlug(value, name) {
  if (typeof value !== 'string' || !slug.test(value))
    throw fail(`Invalid ${name}`);
  return value;
}
function revisionNumber(value) {
  if (!Number.isInteger(value) || value < 1 || value > maxRevisions)
    throw fail('Invalid revision');
  return value;
}
function revisionName(value) {
  return String(revisionNumber(value)).padStart(4, '0');
}
function exactKeys(value, fields, name) {
  return plain(value, name, fields);
}
function textList(value, name, count = 24, length = 240) {
  return boundedList(value ?? [], name, count).map((item) =>
    string(item, name, length),
  );
}
function normalizeSource(value) {
  const source = exactKeys(
    value ?? {},
    ['url', 'author', 'capturedAt', 'license', 'contentGap', 'embedUrl'],
    'source',
  );
  const result = {};
  for (const key of ['url', 'embedUrl'])
    if (source[key] !== undefined) {
      const url = string(source[key], `source ${key}`, 2000);
      if (!/^https?:\/\//i.test(url))
        throw fail(`source ${key} must be an http(s) URL`);
      result[key] = url;
    }
  for (const key of ['author', 'license', 'contentGap'])
    if (source[key] !== undefined)
      result[key] = string(source[key], `source ${key}`, 500);
  if (source.capturedAt !== undefined) {
    string(source.capturedAt, 'source capturedAt', 40);
    if (Number.isNaN(Date.parse(source.capturedAt)))
      throw fail('Invalid source capturedAt');
    result.capturedAt = source.capturedAt;
  }
  return result;
}
function normalizeTags(value) {
  const seen = new Set();
  return boundedList(value ?? [], 'tags', 40).map((tag) => {
    exactKeys(tag, ['facet', 'value', 'provenance'], 'tag');
    const facet = safeSlug(tag.facet, 'tag facet');
    const label = string(tag.value, 'tag value', 100);
    if (!provenances.includes(tag.provenance))
      throw fail('Invalid tag provenance');
    const key = `${facet}\0${label.toLowerCase()}\0${tag.provenance}`;
    if (seen.has(key)) throw fail('Duplicate tag');
    seen.add(key);
    return { facet, value: label, provenance: tag.provenance };
  });
}
function normalizeRequirements(value) {
  const data = exactKeys(
    value ?? {},
    [
      'effect',
      'roles',
      'medium',
      'inputs',
      'tools',
      'runtime',
      'limitations',
      'unknowns',
      'checks',
    ],
    'requirements',
  );
  return {
    effect: optionalString(data.effect, 'effect', 1000),
    roles: textList(data.roles, 'roles'),
    medium: optionalString(data.medium, 'medium', 120),
    inputs: textList(data.inputs, 'inputs'),
    tools: textList(data.tools, 'tools'),
    runtime: optionalString(data.runtime, 'runtime', 240),
    limitations: textList(data.limitations, 'limitations'),
    unknowns: textList(data.unknowns, 'unknowns'),
    checks: textList(data.checks, 'checks'),
  };
}
function normalizeNotes(value) {
  return boundedList(value ?? [], 'notes', 30).map((item) => {
    exactKeys(item, ['text', 'provenance'], 'note');
    if (!provenances.includes(item.provenance))
      throw fail('Invalid note provenance');
    return {
      text: string(item.text, 'note text', 3000),
      provenance: item.provenance,
    };
  });
}
function normalizeLink(value, name) {
  if (value === undefined || value === null) return null;
  exactKeys(value, ['id', 'revision', 'promptSha256'], name);
  if (
    typeof value.promptSha256 !== 'string' ||
    !hashPattern.test(value.promptSha256)
  )
    throw fail(`Invalid ${name} hash`);
  return {
    id: safeId(value.id, `${name} ID`),
    revision: revisionNumber(value.revision),
    promptSha256: value.promptSha256,
  };
}
function normalizeRecipe(value) {
  if (value === undefined || value === null) return null;
  exactKeys(value, ['stages'], 'recipe');
  const stages = boundedList(value.stages, 'recipe stages', 24).map((stage) => {
    exactKeys(
      stage,
      ['id', 'role', 'dependsOn', 'inputs', 'outputs', 'checks'],
      'recipe stage',
    );
    return {
      id: safeSlug(stage.id, 'stage ID'),
      role: string(stage.role, 'stage role', 200),
      dependsOn: boundedList(
        stage.dependsOn ?? [],
        'stage dependencies',
        24,
      ).map((id) => safeSlug(id, 'stage dependency')),
      inputs: textList(stage.inputs, 'stage inputs'),
      outputs: textList(stage.outputs, 'stage outputs'),
      checks: textList(stage.checks, 'stage checks'),
    };
  });
  const ids = new Set(stages.map((stage) => stage.id));
  if (ids.size !== stages.length) throw fail('Duplicate recipe stage ID');
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const state = new Map();
  function visit(id) {
    if (state.get(id) === 'visiting') throw fail('Recipe dependency cycle');
    if (state.get(id) === 'done') return;
    state.set(id, 'visiting');
    for (const dep of byId.get(id).dependsOn) {
      if (!ids.has(dep)) throw fail(`Unknown recipe dependency ${dep}`);
      visit(dep);
    }
    state.set(id, 'done');
  }
  for (const id of ids) visit(id);
  return { stages };
}
function normalizeEditable(input) {
  exactKeys(
    input,
    [
      'id',
      'baseRevision',
      'title',
      'prompt',
      'origin',
      'source',
      'tags',
      'requirements',
      'notes',
      'assets',
      'recipe',
      'parent',
      'copyOf',
    ],
    'prompt input',
  );
  const prompt = string(input.prompt, 'prompt', maxPrompt, { empty: true });
  if (!prompt.length && !input.source?.contentGap)
    throw fail(
      'Empty prompt requires source.contentGap explaining unavailable text',
    );
  if (!origins.includes(input.origin)) throw fail('Invalid prompt origin');
  if (input.id !== undefined) safeId(input.id);
  if (input.baseRevision !== undefined) revisionNumber(input.baseRevision);
  if (has(input, 'id') !== has(input, 'baseRevision'))
    throw fail('Updates require id and baseRevision together');
  return {
    title: string(input.title, 'title', 200),
    prompt,
    origin: input.origin,
    source: normalizeSource(input.source),
    tags: normalizeTags(input.tags),
    requirements: normalizeRequirements(input.requirements),
    notes: normalizeNotes(input.notes),
    recipe: normalizeRecipe(input.recipe),
    parent: normalizeLink(input.parent, 'parent'),
    copyOf: normalizeLink(input.copyOf, 'copyOf'),
    assets: boundedList(input.assets ?? [], 'assets', maxAssets),
  };
}
async function safeExisting(path, { missing = false } = {}) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const segment of absolute
    .slice(current.length)
    .split(sep)
    .filter(Boolean)) {
    current = join(current, segment);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (missing && error.code === 'ENOENT') return;
      throw error;
    }
    if (info.isSymbolicLink())
      throw fail(`Symbolic links are not allowed: ${current}`);
    if (current !== absolute && !info.isDirectory())
      throw fail(`Expected a directory: ${current}`);
  }
}
async function directory(path, { missing = false } = {}) {
  try {
    await safeExisting(path);
    if (!(await lstat(path)).isDirectory())
      throw fail(`Expected a directory: ${path}`);
    return true;
  } catch (error) {
    if (missing && error.code === 'ENOENT') return false;
    throw error;
  }
}
async function boundedRead(path, limit) {
  await safeExisting(dirname(path));
  let handle;
  try {
    handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (error) {
    if (error.code === 'ELOOP') throw fail(`Symbolic link refused: ${path}`);
    throw error;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit)
      throw fail(`Invalid or oversized file: ${path}`, 413);
    const bytes = await handle.readFile();
    if (bytes.length !== info.size || bytes.length > limit)
      throw fail(`File changed while reading: ${path}`);
    return bytes;
  } finally {
    await handle.close();
  }
}
async function writeJson(path, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  if (bytes.length > maxMetadata)
    throw fail('Prompt metadata exceeds 1 MB', 413);
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
}
async function withPublicationLock(folder, work) {
  const path = join(folder, '.pending-publication.lock');
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST')
      throw fail('Prompt publication is in progress; retry the write', 409);
    throw error;
  }
  try {
    return await work();
  } finally {
    try {
      await handle.close();
    } finally {
      await rm(path, { force: true });
    }
  }
}
async function assertPublishedBelow(folder, limit, kind) {
  let count = 0;
  const handle = await opendir(folder);
  for await (const item of handle) {
    if (item.name.startsWith('.pending-')) continue;
    if (!uuid.test(item.name) || !item.isDirectory())
      throw fail(`Unexpected ${kind} entry: ${item.name}`);
    if (++count >= limit) throw fail(`${kind} limit of ${limit} reached`, 413);
  }
}
function assetLimit(type) {
  return type === 'text/markdown' ? maxGuideBytes : maxAssetBytes;
}
async function incomingAssets(items) {
  let total = 0;
  const seen = new Set();
  const result = [];
  for (const item of items) {
    exactKeys(
      item,
      ['id', 'path', 'contentType', 'missingReason', 'bytes'],
      'asset',
    );
    const id = safeSlug(item.id, 'asset ID');
    if (seen.has(id)) throw fail('Duplicate asset ID');
    seen.add(id);
    if (item.missingReason !== undefined) {
      if (
        item.path !== undefined ||
        item.bytes !== undefined ||
        item.contentType !== undefined
      )
        throw fail('Asset gap cannot include file data');
      result.push({
        descriptor: {
          id,
          missingReason: string(item.missingReason, 'asset missingReason', 500),
        },
      });
      continue;
    }
    if ((item.path === undefined) === (item.bytes === undefined))
      throw fail('Asset requires exactly one of path or bytes');
    const contentType = string(
      item.contentType,
      'asset contentType',
      80,
    ).toLowerCase();
    if (!media[contentType])
      throw fail(`Unsupported asset type ${contentType}`, 415);
    let bytes;
    if (item.path !== undefined) {
      if (typeof item.path !== 'string' || !isAbsolute(item.path))
        throw fail('Asset path must be absolute');
      bytes = await boundedRead(item.path, assetLimit(contentType));
    } else {
      if (!Buffer.isBuffer(item.bytes))
        throw fail('Asset bytes must be a Buffer');
      bytes = item.bytes;
    }
    inspectAsset(bytes, contentType);
    total += bytes.length;
    if (total > maxTotalAssets) throw fail('Assets exceed 32 MB', 413);
    result.push({
      descriptor: {
        id,
        filename: `${id}.${media[contentType]}`,
        contentType,
        size: bytes.length,
        sha256: sha256(bytes),
      },
      bytes,
    });
  }
  return result;
}
function validateMetadata(meta, id, revision) {
  exactKeys(
    meta,
    [
      'version',
      'id',
      'revision',
      'createdAt',
      'title',
      'origin',
      'source',
      'tags',
      'requirements',
      'notes',
      'recipe',
      'parent',
      'copyOf',
      'assets',
      'promptSha256',
      'metadataSha256',
    ],
    'revision metadata',
  );
  const { metadataSha256, ...body } = meta;
  if (
    typeof metadataSha256 !== 'string' ||
    metadataSha256 !== sha256(Buffer.from(JSON.stringify(body)))
  )
    throw fail('Prompt metadata hash mismatch');
  if (
    !meta ||
    meta.version !== 1 ||
    meta.id !== id ||
    meta.revision !== revision ||
    !uuid.test(meta.id) ||
    typeof meta.createdAt !== 'string' ||
    Number.isNaN(Date.parse(meta.createdAt)) ||
    typeof meta.promptSha256 !== 'string' ||
    !hashPattern.test(meta.promptSha256)
  )
    throw fail('Corrupt prompt revision metadata');
  normalizeEditable({
    title: meta.title,
    prompt: 'x',
    origin: meta.origin,
    source: meta.source,
    tags: meta.tags,
    requirements: meta.requirements,
    notes: meta.notes,
    recipe: meta.recipe,
    parent: meta.parent,
    copyOf: meta.copyOf,
    assets: [],
  });
  if (!Array.isArray(meta.assets) || meta.assets.length > maxAssets)
    throw fail('Corrupt asset manifest');
  const names = new Set();
  for (const asset of meta.assets) {
    exactKeys(
      asset,
      ['id', 'filename', 'contentType', 'size', 'sha256', 'missingReason'],
      'asset descriptor',
    );
    safeSlug(asset.id, 'asset ID');
    if (names.has(asset.id)) throw fail('Duplicate asset descriptor');
    names.add(asset.id);
    if (asset.missingReason !== undefined) {
      if (
        asset.filename !== undefined ||
        asset.contentType !== undefined ||
        asset.size !== undefined ||
        asset.sha256 !== undefined
      )
        throw fail('Corrupt asset gap');
      string(asset.missingReason, 'asset missingReason', 500);
    } else if (
      !media[asset.contentType] ||
      asset.filename !== `${asset.id}.${media[asset.contentType]}` ||
      !Number.isInteger(asset.size) ||
      asset.size < 1 ||
      asset.size > assetLimit(asset.contentType) ||
      typeof asset.sha256 !== 'string' ||
      !hashPattern.test(asset.sha256)
    )
      throw fail('Corrupt asset descriptor');
  }
  return meta;
}
function summary(meta) {
  return {
    id: meta.id,
    revision: meta.revision,
    title: meta.title,
    origin: meta.origin,
    createdAt: meta.createdAt,
    source: meta.source,
    tags: meta.tags,
    requirements: meta.requirements,
    assetCount: meta.assets.length,
    promptSha256: meta.promptSha256,
    promptAvailable: meta.promptSha256 !== sha256(Buffer.alloc(0)),
  };
}
function normalizeRun(input, meta) {
  exactKeys(
    input,
    [
      'inputs',
      'tools',
      'artifacts',
      'execution',
      'inspection',
      'tester',
      'userReview',
      'stageId',
      'dependencies',
      'briefRevision',
      'planRevision',
    ],
    'run',
  );
  const inputs = boundedList(input.inputs ?? [], 'run inputs', 24).map(
    (entry) => {
      exactKeys(entry, ['name', 'value', 'sha256'], 'run input');
      const value = string(entry.value, 'run input value', 10000, {
        empty: true,
      });
      if (
        entry.sha256 !== undefined &&
        entry.sha256 !== sha256(Buffer.from(value))
      )
        throw fail('Run input hash mismatch');
      return {
        name: safeSlug(entry.name, 'run input name'),
        value,
        sha256: sha256(Buffer.from(value)),
      };
    },
  );
  const tools = boundedList(input.tools ?? [], 'run tools', 24).map((tool) => {
    exactKeys(tool, ['name', 'version', 'settings'], 'run tool');
    return {
      name: string(tool.name, 'tool name', 120),
      version: optionalString(tool.version, 'tool version', 120),
      settings: optionalString(tool.settings, 'tool settings', 2000),
    };
  });
  function observation(value, name, statuses) {
    if (value === undefined || value === null) return null;
    exactKeys(value, ['status', 'notes', 'evidence', 'by'], name);
    if (!statuses.includes(value.status)) throw fail(`Invalid ${name} status`);
    const evidence = textList(value.evidence, `${name} evidence`, 20, 1000);
    let by = null;
    if (name === 'tester') {
      if (
        value.by !== undefined &&
        ![
          'agent-run',
          'author-reported',
          'user-reported',
          'user-observed',
        ].includes(value.by)
      )
        throw fail('Invalid tester provenance');
      if (value.status !== 'not-tested' && !value.by)
        throw fail('Tester result requires by provenance');
      by = value.by ?? null;
    } else if (value.by !== undefined) throw fail(`${name} cannot include by`);
    if (
      name === 'userReview' &&
      value.status !== 'not-reviewed' &&
      evidence.length === 0
    )
      throw fail('User review requires actual evidence text or locator');
    return {
      status: value.status,
      notes: optionalString(value.notes, `${name} notes`, 3000),
      evidence,
      ...(name === 'tester' ? { by } : {}),
    };
  }
  const stageId =
    input.stageId === undefined
      ? null
      : safeSlug(input.stageId, 'run stage ID');
  if (stageId && !meta.recipe?.stages.some((stage) => stage.id === stageId))
    throw fail('Run stage is absent from this revision');
  const dependencies = boundedList(
    input.dependencies ?? [],
    'run dependencies',
    24,
  ).map((dep) => {
    exactKeys(dep, ['stageId', 'runId'], 'run dependency');
    return {
      stageId: safeSlug(dep.stageId, 'dependency stage ID'),
      runId: safeId(dep.runId, 'dependency run ID'),
    };
  });
  if (dependencies.length && !stageId)
    throw fail('Run dependencies require a stage ID');
  if (stageId) {
    const stage = meta.recipe.stages.find((item) => item.id === stageId);
    const allowed = new Set(stage.dependsOn);
    for (const dep of dependencies)
      if (!allowed.has(dep.stageId))
        throw fail('Run dependency does not match recipe');
    if (
      new Set(dependencies.map((d) => d.stageId)).size !== dependencies.length
    )
      throw fail('Duplicate run dependency stage');
  }
  return {
    inputs,
    tools,
    artifacts: boundedList(input.artifacts ?? [], 'run artifacts', 24),
    stageId,
    dependencies,
    briefRevision: optionalString(input.briefRevision, 'brief revision', 120),
    planRevision: optionalString(input.planRevision, 'plan revision', 120),
    execution: observation(input.execution, 'execution', [
      'not-run',
      'succeeded',
      'failed',
      'partial',
    ]),
    inspection: observation(input.inspection, 'inspection', [
      'not-inspected',
      'passed',
      'failed',
      'inconclusive',
    ]),
    tester: observation(input.tester, 'tester', [
      'not-tested',
      'passed',
      'failed',
      'inconclusive',
    ]),
    userReview: observation(input.userReview, 'userReview', [
      'not-reviewed',
      'positive',
      'negative',
      'mixed',
      'accepted',
    ]),
  };
}
async function incomingRunArtifacts(items) {
  let total = 0;
  const seen = new Set();
  const result = [];
  for (const item of items) {
    exactKeys(
      item,
      ['id', 'path', 'contentType', 'locator', 'missingReason'],
      'run artifact',
    );
    const id = safeSlug(item.id, 'run artifact ID');
    if (seen.has(id)) throw fail('Duplicate run artifact ID');
    seen.add(id);
    const locator =
      item.locator === undefined
        ? null
        : string(item.locator, 'artifact locator', 2000);
    if (item.path === undefined) {
      result.push({
        descriptor: {
          id,
          locator,
          missingReason: string(
            item.missingReason,
            'artifact missingReason',
            500,
          ),
        },
      });
      continue;
    }
    if (item.missingReason !== undefined)
      throw fail('Captured run artifact cannot have missingReason');
    if (typeof item.path !== 'string' || !isAbsolute(item.path))
      throw fail('Run artifact path must be absolute');
    const contentType = string(
      item.contentType,
      'run artifact contentType',
      80,
    ).toLowerCase();
    if (!media[contentType])
      throw fail(
        `Unsupported run artifact type ${contentType}; record a missingReason for uncaptured media`,
        415,
      );
    const bytes = await boundedRead(item.path, assetLimit(contentType));
    inspectAsset(bytes, contentType);
    total += bytes.length;
    if (total > maxTotalAssets) throw fail('Run artifacts exceed 32 MB', 413);
    result.push({
      descriptor: {
        id,
        locator,
        filename: `${id}.${media[contentType]}`,
        contentType,
        size: bytes.length,
        sha256: sha256(bytes),
      },
      bytes,
    });
  }
  return result;
}

// A store constructor only remembers paths. Even directory existence is checked lazily.
export function createPromptStore(
  directoryPath,
  { projectDirectory, readOnly = false } = {},
) {
  let root = resolve(directoryPath);
  let project =
    projectDirectory === undefined ? null : resolve(projectDirectory);
  const requestedRoot = root;
  const requestedProject = project;
  let canonicalizing;
  async function canonicalizeRoot() {
    canonicalizing ??= (async () => {
      // The caller's project or personal-parent path is trusted, but every
      // .incline/store component below it must still pass lstat checks.
      if (
        requestedProject &&
        requestedRoot === join(requestedProject, '.incline', 'prompts')
      ) {
        project = await realpath(requestedProject);
        root = join(project, '.incline', 'prompts');
      } else {
        let parent = dirname(requestedRoot);
        const tail = [];
        while (true) {
          try {
            parent = join(await realpath(parent), ...tail.reverse());
            break;
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            const next = dirname(parent);
            if (next === parent) throw error;
            tail.push(parent.slice(next.length + (next.endsWith(sep) ? 0 : 1)));
            parent = next;
          }
        }
        root = join(
          parent,
          requestedRoot.slice(dirname(requestedRoot).length + 1),
        );
        if (requestedProject) project = await realpath(requestedProject);
      }
    })();
    await canonicalizing;
  }
  async function ensureWritable() {
    await canonicalizeRoot();
    if (readOnly) throw fail('Prompt store is read-only', 403);
    await safeExisting(root, { missing: true });
    await mkdir(root, { recursive: true, mode: 0o700 });
    await directory(root);
  }
  async function revisionFiles(id, revision) {
    await canonicalizeRoot();
    safeId(id);
    revisionNumber(revision);
    const path = join(root, id, 'revisions', revisionName(revision));
    try {
      await directory(path);
    } catch (error) {
      if (error.code === 'ENOENT')
        throw fail(`Prompt ${id} revision ${revision} not found`, 404);
      throw error;
    }
    let meta;
    try {
      meta = JSON.parse(
        (await boundedRead(join(path, 'meta.json'), maxMetadata)).toString(
          'utf8',
        ),
      );
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError)
        throw fail(
          `Missing or corrupt prompt metadata for ${id} revision ${revision}`,
        );
      throw error;
    }
    return { path, meta: validateMetadata(meta, id, revision) };
  }
  async function revisions(id) {
    await canonicalizeRoot();
    safeId(id);
    const path = join(root, id, 'revisions');
    if (!(await directory(path, { missing: true }))) return [];
    const values = [];
    const handle = await opendir(path);
    for await (const entry of handle) {
      if (entry.name.startsWith('.pending-')) continue;
      if (!/^\d{4}$/.test(entry.name) || !entry.isDirectory())
        throw fail(`Unexpected prompt revision entry: ${entry.name}`);
      const revision = Number(entry.name);
      revisionNumber(revision);
      values.push(revision);
      if (values.length > maxRevisions)
        throw fail('Prompt exceeds revision limit', 413);
    }
    return values.sort((a, b) => a - b);
  }
  async function latest(id) {
    const values = await revisions(id);
    if (!values.length) throw fail('Prompt not found', 404);
    return values.at(-1);
  }
  async function allLatest() {
    await canonicalizeRoot();
    if (!(await directory(root, { missing: true }))) return [];
    const entries = [];
    const handle = await opendir(root);
    for await (const item of handle) {
      if (item.name.startsWith('.pending-')) continue;
      if (!uuid.test(item.name) || !item.isDirectory())
        throw fail(`Unexpected prompt store entry: ${item.name}`);
      if (entries.length >= maxEntries)
        throw fail('Prompt store exceeds 1,000 entries', 413);
      const revision = await latest(item.name);
      entries.push(summary((await revisionFiles(item.name, revision)).meta));
    }
    return entries.sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );
  }
  async function read(id, revision) {
    const number =
      revision === undefined ? await latest(id) : revisionNumber(revision);
    const { path, meta } = await revisionFiles(id, number);
    let promptBytes;
    try {
      promptBytes = await boundedRead(join(path, 'prompt.txt'), maxPrompt);
    } catch (error) {
      if (error.code === 'ENOENT')
        throw fail(`Missing prompt text for ${id} revision ${number}`);
      throw error;
    }
    if (sha256(promptBytes) !== meta.promptSha256)
      throw fail(`Prompt text hash mismatch for ${id} revision ${number}`);
    let prompt;
    try {
      prompt = new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: true,
      }).decode(promptBytes);
    } catch {
      throw fail('Prompt text is not UTF-8');
    }
    for (const descriptor of meta.assets)
      if (descriptor.filename) await asset(id, number, descriptor.id);
    return {
      ...meta,
      prompt,
      integrity: {
        promptSha256: meta.promptSha256,
        metadataSha256: meta.metadataSha256,
      },
    };
  }
  async function asset(id, revision, assetId) {
    safeSlug(assetId, 'asset ID');
    const { path, meta } = await revisionFiles(id, revisionNumber(revision));
    const descriptor = meta.assets.find((item) => item.id === assetId);
    if (!descriptor) throw fail('Prompt asset not found', 404);
    if (descriptor.missingReason)
      throw fail(`Prompt asset unavailable: ${descriptor.missingReason}`, 404);
    let bytes;
    try {
      bytes = await boundedRead(
        join(path, 'assets', descriptor.filename),
        assetLimit(descriptor.contentType),
      );
    } catch (error) {
      if (error.code === 'ENOENT')
        throw fail(`Missing prompt asset ${assetId}`);
      throw error;
    }
    if (bytes.length !== descriptor.size || sha256(bytes) !== descriptor.sha256)
      throw fail(`Prompt asset hash mismatch: ${assetId}`);
    inspectAsset(bytes, descriptor.contentType);
    return { ...descriptor, bytes };
  }
  async function save(input) {
    const editable = normalizeEditable(input);
    const assets = await incomingAssets(editable.assets);
    const id = input.id ?? randomUUID();
    const previous = input.baseRevision ?? null;
    let revision = 1;
    if (previous !== null) {
      const current = await latest(id);
      if (current !== previous)
        throw fail(
          `Prompt ${id} changed; expected revision ${previous}, found ${current}`,
          409,
        );
      if (current >= maxRevisions)
        throw fail('Prompt exceeds revision limit', 413);
      revision = current + 1;
    }
    const promptBytes = Buffer.from(editable.prompt, 'utf8');
    const meta = {
      version: 1,
      id,
      revision,
      createdAt: new Date().toISOString(),
      title: editable.title,
      origin: editable.origin,
      source: editable.source,
      tags: editable.tags,
      requirements: editable.requirements,
      notes: editable.notes,
      recipe: editable.recipe,
      parent: editable.parent,
      copyOf: editable.copyOf,
      assets: assets.map((item) => item.descriptor),
      promptSha256: sha256(promptBytes),
    };
    meta.metadataSha256 = sha256(Buffer.from(JSON.stringify(meta)));
    await ensureWritable();
    let staging;
    let destination;
    if (previous === null) {
      staging = await mkdtemp(join(root, '.pending-'));
      destination = join(root, id);
      await mkdir(join(staging, 'revisions', revisionName(1)), {
        recursive: true,
        mode: 0o700,
      });
    } else {
      await directory(join(root, id, 'revisions'));
      staging = await mkdtemp(join(root, id, 'revisions', '.pending-'));
      destination = join(root, id, 'revisions', revisionName(revision));
    }
    const payload =
      previous === null ? join(staging, 'revisions', revisionName(1)) : staging;
    try {
      await writeJson(join(payload, 'meta.json'), meta);
      await writeFile(join(payload, 'prompt.txt'), promptBytes, {
        flag: 'wx',
        mode: 0o600,
      });
      if (assets.some((item) => item.bytes))
        await mkdir(join(payload, 'assets'), { mode: 0o700 });
      for (const item of assets)
        if (item.bytes)
          await writeFile(
            join(payload, 'assets', item.descriptor.filename),
            item.bytes,
            { flag: 'wx', mode: 0o600 },
          );
      if (previous === null) {
        await withPublicationLock(root, async () => {
          await assertPublishedBelow(root, maxEntries, 'Prompt entry');
          if (await directory(destination, { missing: true }))
            throw fail('Prompt entry already exists', 409);
          await rename(staging, destination);
        });
      } else {
        if ((await latest(id)) !== previous)
          throw fail('Prompt changed before revision was published', 409);
        if (await directory(destination, { missing: true }))
          throw fail('Prompt revision already exists', 409);
        await rename(staging, destination);
      }
    } catch (error) {
      if (['EEXIST', 'ENOTEMPTY'].includes(error.code))
        throw fail('Prompt revision already exists', 409);
      throw error;
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    return read(id, revision);
  }
  async function query(options = {}) {
    exactKeys(options, ['text', 'tags', 'limit'], 'query');
    const words =
      options.text === undefined
        ? []
        : string(options.text, 'query text', 200)
            .toLocaleLowerCase()
            .split(/\s+/u)
            .filter(Boolean)
            .slice(0, 20);
    const tags = boundedList(options.tags ?? [], 'query tags', 20).map(
      (tag) => {
        exactKeys(tag, ['facet', 'value', 'provenance'], 'query tag');
        return {
          facet: safeSlug(tag.facet, 'query tag facet'),
          value: string(tag.value, 'query tag value', 100).toLocaleLowerCase(),
          provenance:
            tag.provenance === undefined
              ? null
              : provenances.includes(tag.provenance)
                ? tag.provenance
                : (() => {
                    throw fail('Invalid query provenance');
                  })(),
        };
      },
    );
    const limit = options.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw fail('Query limit must be 1–50');
    const candidates = await allLatest();
    return candidates
      .filter((entry) => {
        const haystack = [
          entry.title,
          entry.requirements.effect ?? '',
          entry.requirements.medium ?? '',
          ...entry.requirements.roles,
          ...entry.requirements.inputs,
          ...entry.requirements.tools,
          ...entry.tags.map((tag) => tag.value),
          entry.source.author ?? '',
        ]
          .join(' ')
          .toLocaleLowerCase();
        return (
          words.every((word) => haystack.includes(word)) &&
          tags.every((wanted) =>
            entry.tags.some(
              (tag) =>
                tag.facet === wanted.facet &&
                tag.value.toLocaleLowerCase() === wanted.value &&
                (!wanted.provenance || tag.provenance === wanted.provenance),
            ),
          )
        );
      })
      .slice(0, limit);
  }
  async function runs(id, revision) {
    await canonicalizeRoot();
    const number =
      revision === undefined ? await latest(id) : revisionNumber(revision);
    await revisionFiles(id, number);
    const path = join(root, id, 'runs', revisionName(number));
    if (!(await directory(path, { missing: true }))) return [];
    const result = [];
    const handle = await opendir(path);
    for await (const item of handle) {
      if (item.name.startsWith('.pending-')) continue;
      if (!uuid.test(item.name) || !item.isDirectory())
        throw fail(`Unexpected prompt run entry: ${item.name}`);
      if (result.length >= maxRuns)
        throw fail('Prompt run limit exceeded', 413);
      let run;
      try {
        run = JSON.parse(
          (
            await boundedRead(join(path, item.name, 'record.json'), maxMetadata)
          ).toString('utf8'),
        );
      } catch (error) {
        if (error instanceof SyntaxError)
          throw fail(`Corrupt prompt run ${item.name}`);
        throw error;
      }
      if (
        run.version !== 1 ||
        run.id !== item.name ||
        run.promptId !== id ||
        run.revision !== number ||
        !Array.isArray(run.artifacts)
      )
        throw fail(`Corrupt prompt run ${item.name}`);
      const { recordSha256, ...runBody } = run;
      if (
        typeof recordSha256 !== 'string' ||
        recordSha256 !== sha256(Buffer.from(JSON.stringify(runBody))) ||
        typeof run.recordedAt !== 'string' ||
        Number.isNaN(Date.parse(run.recordedAt))
      )
        throw fail(`Run record hash mismatch: ${item.name}`);
      for (const artifact of run.artifacts) {
        safeSlug(artifact.id, 'run artifact ID');
        if (artifact.missingReason) continue;
        if (
          !media[artifact.contentType] ||
          artifact.filename !==
            `${artifact.id}.${media[artifact.contentType]}` ||
          !Number.isInteger(artifact.size) ||
          !hashPattern.test(artifact.sha256 ?? '')
        )
          throw fail(`Corrupt run artifact ${artifact.id}`);
        let bytes;
        try {
          bytes = await boundedRead(
            join(path, item.name, 'artifacts', artifact.filename),
            assetLimit(artifact.contentType),
          );
        } catch (error) {
          if (error.code === 'ENOENT')
            throw fail(`Missing run artifact ${artifact.id}`);
          throw error;
        }
        if (bytes.length !== artifact.size || sha256(bytes) !== artifact.sha256)
          throw fail(`Run artifact hash mismatch: ${artifact.id}`);
      }
      result.push(run);
    }
    return result.sort(
      (a, b) =>
        a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id),
    );
  }
  async function saveRun(id, revision, input) {
    await canonicalizeRoot();
    if (readOnly) throw fail('Prompt store is read-only', 403);
    if (!project) throw fail('Run recording requires projectDirectory');
    if (root !== join(project, '.incline', 'prompts'))
      throw fail('Runs belong in the project-local prompt store');
    await assertPromptRecording(project);
    const number = revisionNumber(revision);
    const { meta } = await revisionFiles(id, number);
    const data = normalizeRun(input, meta);
    const artifacts = await incomingRunArtifacts(data.artifacts);
    const existing = await runs(id, number);
    if (existing.length >= maxRuns)
      throw fail(`Prompt run limit of ${maxRuns} reached`, 413);
    for (const dependency of data.dependencies) {
      const run = existing.find((item) => item.id === dependency.runId);
      if (!run || run.stageId !== dependency.stageId)
        throw fail(`Unknown run dependency ${dependency.runId}`);
    }
    const record = {
      version: 1,
      id: randomUUID(),
      promptId: id,
      revision: number,
      promptSha256: meta.promptSha256,
      recordedAt: new Date().toISOString(),
      ...data,
      artifacts: artifacts.map((item) => item.descriptor),
    };
    record.recordSha256 = sha256(Buffer.from(JSON.stringify(record)));
    const path = join(root, id, 'runs', revisionName(number));
    await safeExisting(path, { missing: true });
    await mkdir(path, { recursive: true, mode: 0o700 });
    await directory(path);
    const staging = await mkdtemp(join(path, '.pending-'));
    try {
      await writeJson(join(staging, 'record.json'), record);
      if (artifacts.some((item) => item.bytes))
        await mkdir(join(staging, 'artifacts'), { mode: 0o700 });
      for (const item of artifacts)
        if (item.bytes)
          await writeFile(
            join(staging, 'artifacts', item.descriptor.filename),
            item.bytes,
            { flag: 'wx', mode: 0o600 },
          );
      await withPublicationLock(path, async () => {
        await assertPublishedBelow(path, maxRuns, 'Prompt run');
        await assertPromptRecording(project);
        await rename(staging, join(path, record.id));
      });
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    return record;
  }
  async function runAsset(id, revision, runId, artifactId) {
    safeId(runId, 'run ID');
    safeSlug(artifactId, 'run artifact ID');
    const number = revisionNumber(revision);
    const record = (await runs(id, number)).find((item) => item.id === runId);
    if (!record) throw fail('Prompt run not found', 404);
    const descriptor = record.artifacts.find((item) => item.id === artifactId);
    if (!descriptor) throw fail('Run artifact not found', 404);
    if (descriptor.missingReason)
      throw fail(`Run artifact unavailable: ${descriptor.missingReason}`, 404);
    const bytes = await boundedRead(
      join(
        root,
        id,
        'runs',
        revisionName(number),
        runId,
        'artifacts',
        descriptor.filename,
      ),
      assetLimit(descriptor.contentType),
    );
    if (bytes.length !== descriptor.size || sha256(bytes) !== descriptor.sha256)
      throw fail(`Run artifact hash mismatch: ${artifactId}`);
    return { ...descriptor, bytes };
  }
  return {
    get directory() {
      return root;
    },
    get projectDirectory() {
      return project;
    },
    readOnly,
    save,
    list: allLatest,
    read,
    query,
    saveRun,
    runs,
    asset,
    runAsset,
  };
}

export async function copyPrompt(source, destination, id, revision) {
  const from =
    typeof source === 'string'
      ? createPromptStore(source, { readOnly: true })
      : source;
  const to =
    typeof destination === 'string'
      ? createPromptStore(destination)
      : destination;
  if (!from?.read || !from?.asset || !to?.save)
    throw fail('copyPrompt requires prompt stores');
  const entry = await from.read(id, revision);
  const assets = [];
  for (const descriptor of entry.assets) {
    if (descriptor.missingReason)
      assets.push({
        id: descriptor.id,
        missingReason: descriptor.missingReason,
      });
    else {
      const original = await from.asset(
        entry.id,
        entry.revision,
        descriptor.id,
      );
      assets.push({
        id: descriptor.id,
        contentType: descriptor.contentType,
        bytes: original.bytes,
      });
    }
  }
  return to.save({
    title: entry.title,
    prompt: entry.prompt,
    origin: entry.origin,
    source: entry.source,
    tags: entry.tags,
    requirements: entry.requirements,
    notes: entry.notes,
    recipe: entry.recipe,
    parent: entry.parent,
    assets,
    copyOf: {
      id: entry.id,
      revision: entry.revision,
      promptSha256: entry.promptSha256,
    },
  });
}
