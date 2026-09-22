const ID = /^[a-zA-Z0-9_-]{1,80}$/;
const HASH = /^[a-f0-9]{64}$/;
const TABLES = [
  'artifacts',
  'observations',
  'hypotheses',
  'attempts',
  'decisions',
];
const INPUT_KEYS = ['version', 'id', 'expectedRevision', 'brief', ...TABLES];
const compareIds = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function fail(message) {
  throw new Error(`Invalid exploration: ${message}`);
}
function object(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('expected object');
  for (const key of required)
    if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
  for (const key of Object.keys(value))
    if (![...required, ...optional].includes(key)) fail(`unknown field ${key}`);
}
function content(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000)
    fail('content must be 1–4000 characters');
}
function id(value) {
  if (typeof value !== 'string' || !ID.test(value)) fail('invalid identifier');
}
function hash(value) {
  if (typeof value !== 'string' || !HASH.test(value)) fail('invalid hash');
}
function array(value) {
  if (!Array.isArray(value)) fail('expected array');
}
function choice(value, allowed) {
  if (!allowed.includes(value)) fail(`invalid value ${value}`);
}
function ids(value, min = 0) {
  array(value);
  value.forEach(id);
  if (value.length < min || new Set(value).size !== value.length)
    fail('empty or duplicate identifier list');
}
function strings(value) {
  array(value);
  value.forEach(content);
}
function links(value) {
  array(value);
  const seen = new Set();
  for (const row of value) {
    object(row, ['batchId', 'eventId', 'recordHash']);
    id(row.batchId);
    id(row.eventId);
    hash(row.recordHash);
    const key = `${row.batchId}/${row.eventId}`;
    if (seen.has(key)) fail('duplicate feedback link');
    seen.add(key);
  }
}
function refs(values, table) {
  for (const key of values)
    if (!table.has(key)) fail(`dangling reference ${key}`);
}
function replacements(rows) {
  const seen = new Set(),
    result = new Map();
  for (const row of rows) {
    if (row.supersedesId !== undefined) {
      id(row.supersedesId);
      if (!seen.has(row.supersedesId) || result.has(row.supersedesId))
        fail('supersedesId must name an unreplaced prior row');
      result.set(row.supersedesId, row.id);
    }
    seen.add(row.id);
  }
  return result;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function same(a, b) {
  return canonical(a) === canonical(b);
}
function states(input) {
  const attempted = new Set(input.attempts.flatMap((a) => a.hypothesisIds));
  const state = new Map(
    input.hypotheses.map((h) => [
      h.id,
      {
        searchState: attempted.has(h.id) ? 'attempted' : 'untested',
        latestDecision: -1,
      },
    ]),
  );
  let finished = false;
  input.decisions.forEach((d, index) => {
    if (finished && d.action !== 'reopen')
      fail('finished session requires reopen before further decisions');
    if (d.action === 'finish') {
      finished = true;
      return;
    }
    if (d.action === 'reopen') finished = false;
    const update = (node, searchState) =>
      state.set(node, { searchState, latestDecision: index });
    d.nodeIds.forEach((node) =>
      update(node, ['park', 'return'].includes(d.action) ? 'parked' : 'active'),
    );
    d.returnToIds.forEach((node) => update(node, 'active'));
  });
  return { state, finished };
}

/** Pure structural validation; journal evidence and snapshot envelopes belong to the store. */
export function validateExploration(input, previous = null) {
  object(input, INPUT_KEYS);
  if (input.version !== 1) fail('unsupported version');
  id(input.id);
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  )
    fail('invalid expectedRevision');
  object(input.brief, ['goal', 'scope', 'constraints']);
  content(input.brief.goal);
  content(input.brief.scope);
  strings(input.brief.constraints);
  const maps = {};
  for (const name of TABLES) {
    array(input[name]);
    maps[name] = new Map();
    for (const row of input[name]) {
      if (!row || typeof row !== 'object') fail('invalid row');
      id(row.id);
      if (maps[name].has(row.id)) fail(`duplicate ${name} ID`);
      maps[name].set(row.id, row);
    }
  }
  for (const a of input.artifacts) {
    object(a, ['id', 'role', 'source'], ['locator']);
    choice(a.role, ['reference', 'original', 'sample', 'implementation']);
    if (a.locator !== undefined) content(a.locator);
    const s = a.source;
    if (!s || typeof s !== 'object') fail('invalid artifact source');
    if (s.kind === 'study-file') {
      object(s, ['kind', 'path', 'sha256']);
      content(s.path);
      hash(s.sha256);
      if (
        s.path.startsWith('/') ||
        s.path.includes('\\') ||
        /^[a-zA-Z]:/.test(s.path) ||
        s.path.includes('\0') ||
        s.path.split('/').some((p) => !p || p === '.' || p === '..')
      )
        fail('study-file path must stay relative to study');
    } else if (s.kind === 'feedback') {
      object(s, ['kind', 'batchId', 'artifactId', 'recordHash']);
      id(s.batchId);
      id(s.artifactId);
      hash(s.recordHash);
    } else if (s.kind === 'unavailable') {
      object(s, ['kind', 'reason']);
      content(s.reason);
    } else fail('unknown artifact source');
  }
  for (const o of input.observations) {
    object(
      o,
      ['id', 'artifactId', 'basis', 'region', 'state', 'description'],
      ['supersedesId'],
    );
    id(o.artifactId);
    refs([o.artifactId], maps.artifacts);
    choice(o.basis, ['inspected', 'user-reported']);
    [o.region, o.state, o.description].forEach(content);
  }
  replacements(input.observations);
  for (const h of input.hypotheses) {
    object(
      h,
      [
        'id',
        'parentIds',
        'observationIds',
        'claim',
        'expectedChange',
        'openQuestions',
      ],
      ['supersedesId'],
    );
    ids(h.parentIds);
    ids(h.observationIds, 1);
    refs(h.parentIds, maps.hypotheses);
    refs(h.observationIds, maps.observations);
    content(h.claim);
    content(h.expectedChange);
    strings(h.openQuestions);
  }
  replacements(input.hypotheses);
  // Iterative topological traversal avoids stack exhaustion on a long valid history.
  const degrees = new Map(
    input.hypotheses.map((h) => [h.id, h.parentIds.length]),
  );
  const children = new Map(input.hypotheses.map((h) => [h.id, []]));
  input.hypotheses.forEach((h) =>
    h.parentIds.forEach((p) => children.get(p).push(h.id)),
  );
  const ready = input.hypotheses
    .filter((h) => !degrees.get(h.id))
    .map((h) => h.id);
  for (let i = 0; i < ready.length; i++)
    for (const child of children.get(ready[i])) {
      degrees.set(child, degrees.get(child) - 1);
      if (!degrees.get(child)) ready.push(child);
    }
  if (ready.length !== input.hypotheses.length)
    fail('hypothesis derivation cycle');
  for (const a of input.attempts) {
    object(a, ['id', 'hypothesisIds', 'artifactIds', 'feedbackLinks']);
    ids(a.hypothesisIds, 1);
    ids(a.artifactIds, 1);
    refs(a.hypothesisIds, maps.hypotheses);
    refs(a.artifactIds, maps.artifacts);
    links(a.feedbackLinks);
  }
  for (const d of input.decisions) {
    object(d, [
      'id',
      'action',
      'nodeIds',
      'attemptIds',
      'returnToIds',
      'explanation',
      'uncertainty',
      'revisitWhen',
      'basis',
      'feedbackLinks',
    ]);
    choice(d.action, [
      'explore',
      'refine',
      'combine',
      'park',
      'return',
      'reopen',
      'finish',
    ]);
    ids(d.nodeIds);
    ids(d.attemptIds);
    ids(d.returnToIds);
    refs(d.nodeIds, maps.hypotheses);
    refs(d.returnToIds, maps.hypotheses);
    refs(d.attemptIds, maps.attempts);
    [d.explanation, d.uncertainty, d.revisitWhen].forEach(content);
    choice(d.basis, ['inference', 'user-instruction']);
    links(d.feedbackLinks);
    if (d.basis === 'user-instruction' && !d.feedbackLinks.length)
      fail('user instruction requires feedback evidence');
    if ((d.action === 'return') !== d.returnToIds.length > 0)
      fail('return target mismatch');
    if (d.nodeIds.some((n) => d.returnToIds.includes(n)))
      fail('return targets must be disjoint');
    if (d.action === 'combine' && d.nodeIds.length < 2)
      fail('combine requires two nodes');
  }
  states(input);
  if (previous) {
    if (input.id !== previous.id || !same(input.brief, previous.brief))
      fail('study identity and brief are immutable');
    if (input.expectedRevision !== previous.revision)
      fail('expectedRevision does not match previous revision');
    for (const name of TABLES) {
      if (input[name].length < previous[name].length)
        fail(`${name} cannot be removed`);
      previous[name].forEach((row, index) => {
        const next = input[name][index];
        if (name !== 'attempts') {
          if (!same(row, next))
            fail(`${name} must append without changing existing rows`);
        } else {
          const { feedbackLinks: oldLinks, ...oldBody } = row;
          const { feedbackLinks: newLinks, ...newBody } = next;
          if (
            !same(oldBody, newBody) ||
            newLinks.length < oldLinks.length ||
            !same(oldLinks, newLinks.slice(0, oldLinks.length))
          )
            fail('attempts only permit appended feedback links');
        }
      });
    }
  }
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 1_000_000)
    fail('record exceeds 1,000,000 bytes');
  return structuredClone(input);
}

/** Bounded working context. IDs remain complete even when embedded rows are omitted. */
export function explorationView(snapshot, { nodeId, limit = 10 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
    fail('limit must be 1–50');
  if (!Number.isSafeInteger(snapshot?.revision) || snapshot.revision < 1)
    fail('view requires a saved snapshot revision');
  const input = Object.fromEntries(
    INPUT_KEYS.map((key) => [key, snapshot[key]]),
  );
  validateExploration(input);
  const byId = new Map(input.hypotheses.map((h) => [h.id, h]));
  if (nodeId !== undefined && !byId.has(nodeId)) fail('unknown nodeId');
  const { state, finished } = states(input);
  const replaced = replacements(input.hypotheses),
    corrected = replacements(input.observations);
  const observations = new Map(input.observations.map((o) => [o.id, o]));
  const artifacts = new Map(input.artifacts.map((a) => [a.id, a]));
  const compare = (a, b) =>
    state.get(b.id).latestDecision - state.get(a.id).latestDecision ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const all = [...input.hypotheses].sort(compare);
  const ancestorIds = new Set();
  if (nodeId !== undefined) {
    const pending = [...byId.get(nodeId).parentIds];
    for (let i = 0; i < pending.length; i++)
      if (!ancestorIds.has(pending[i])) {
        ancestorIds.add(pending[i]);
        pending.push(...byId.get(pending[i]).parentIds);
      }
  }
  const requested =
    nodeId === undefined
      ? all.filter(
          (h) =>
            !replaced.has(h.id) &&
            ['active', 'attempted'].includes(state.get(h.id).searchState),
        )
      : [byId.get(nodeId), ...all.filter((h) => ancestorIds.has(h.id))];
  const alternatives = all.filter(
    (h) =>
      !replaced.has(h.id) &&
      state.get(h.id).searchState === 'untested' &&
      !requested.some((n) => n.id === h.id),
  );
  const parked = all.filter((h) => state.get(h.id).searchState === 'parked');
  const relevantIds =
    nodeId === undefined
      ? new Set(all.map((h) => h.id))
      : new Set([nodeId, ...ancestorIds]);
  const relevantAttempts = input.attempts.filter((a) =>
    a.hypothesisIds.some((n) => relevantIds.has(n)),
  );
  const attemptIds = new Set(relevantAttempts.map((a) => a.id));
  const decisions = input.decisions
    .map((d, index) => ({ d, index }))
    .filter(
      ({ d }) =>
        nodeId === undefined ||
        [...d.nodeIds, ...d.returnToIds].some((n) => relevantIds.has(n)) ||
        d.attemptIds.some((a) => attemptIds.has(a)) ||
        d.action === 'finish',
    )
    .sort((a, b) => b.index - a.index)
    .map(({ d }) => d);
  // Keep comparison evidence separate from a node's own executions. Expand only
  // these decisions' explicit attempt links, not the linked siblings' histories.
  const decisionAttemptIds = [
    ...new Set(decisions.flatMap((d) => [...d.attemptIds].sort(compareIds))),
  ];
  const attemptsById = new Map(input.attempts.map((a) => [a.id, a]));
  const summarize = (h) => {
    const attempts = input.attempts.filter((a) =>
      a.hypothesisIds.includes(h.id),
    );
    const sources = h.observationIds.map((key) => {
      const observation = observations.get(key);
      return {
        observationId: key,
        artifactId: observation.artifactId,
        source: artifacts.get(observation.artifactId).source,
        basis: observation.basis,
        region: observation.region,
        state: observation.state,
        description: observation.description,
        replacementId: corrected.get(key) ?? null,
      };
    });
    return {
      ...h,
      searchState: state.get(h.id).searchState,
      replacementId: replaced.get(h.id) ?? null,
      needsReview: h.observationIds.some((key) => corrected.has(key)),
      sources,
      attemptIds: attempts.map((a) => a.id),
      attempts: attempts.slice(-limit).reverse(),
      omittedAttempts: Math.max(0, attempts.length - limit),
    };
  };
  return structuredClone({
    id: input.id,
    revision: snapshot.revision,
    brief: input.brief,
    sessionState: finished ? 'finished' : 'open',
    selectedNodeId: nodeId ?? null,
    ancestorIds: [...ancestorIds].sort(compareIds),
    nodeIds: requested.map((h) => h.id),
    alternativeIds: alternatives.map((h) => h.id),
    parkedIds: parked.map((h) => h.id),
    nodes: requested.slice(0, limit).map(summarize),
    alternatives: alternatives.slice(0, limit).map(summarize),
    parked: parked.slice(0, limit).map(summarize),
    decisions: decisions.slice(0, limit),
    decisionIds: decisions.map((d) => d.id),
    decisionAttemptIds,
    decisionAttempts: decisionAttemptIds
      .slice(0, limit)
      .map((id) => attemptsById.get(id)),
    omitted: {
      nodes: Math.max(0, requested.length - limit),
      alternatives: Math.max(0, alternatives.length - limit),
      parked: Math.max(0, parked.length - limit),
      decisions: Math.max(0, decisions.length - limit),
      decisionAttempts: Math.max(0, decisionAttemptIds.length - limit),
    },
  });
}
