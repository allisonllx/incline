// local/exploration-cli.mjs
import { dirname as dirname2, basename } from "node:path";

// local/options.mjs
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
async function projectRoot(cwd) {
  const start = await realpath(cwd);
  let current = start;
  while (true) {
    try {
      const marker = await stat(join(current, ".git"));
      if (marker.isDirectory() || marker.isFile()) return current;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}
async function resolveOptions(args, cwd = process.cwd()) {
  const options = /* @__PURE__ */ new Map();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (![
      "--project",
      "--input",
      "--library-dir",
      "--personal-dir",
      "--prompt-library-dir",
      "--local-only"
    ].includes(flag) || options.has(flag))
      throw new Error(
        `Unknown or repeated option: ${flag}. Use --help for usage.`
      );
    if (flag === "--local-only") options.set(flag, true);
    else {
      const value = args[++index];
      if (!value || value.startsWith("--"))
        throw new Error(`Missing value for ${flag}.`);
      options.set(flag, resolve(cwd, value));
    }
  }
  if (options.has("--local-only") && (options.has("--library-dir") || options.has("--personal-dir") || options.has("--prompt-library-dir")))
    throw new Error("Choose --local-only or a shared directory, not both.");
  return {
    project: options.get("--project") ?? await projectRoot(cwd),
    personalDirectory: options.has("--local-only") ? null : options.get("--personal-dir") ?? join(homedir(), ".incline", "personal-insights"),
    libraryDirectory: options.has("--local-only") ? null : options.get("--library-dir") ?? join(homedir(), ".incline", "library"),
    promptLibraryDirectory: options.has("--local-only") ? null : options.get("--prompt-library-dir") ?? join(homedir(), ".incline", "prompt-library"),
    ...options.has("--input") ? { input: options.get("--input") } : {}
  };
}

// local/exploration-files.mjs
import { lstat, realpath as realpath2, mkdir, readdir, open } from "node:fs/promises";
import { constants } from "node:fs";
import { join as join2 } from "node:path";
import { createHash } from "node:crypto";
var MAX_JSON_BYTES = 1e6;
var MAX_ASSET_BYTES = 8 * 1024 * 1024;
var digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function safeId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    throw new Error("Invalid exploration ID");
  return value;
}
function pathParts(relative) {
  if (typeof relative !== "string" || !relative || relative.includes("\\") || relative.includes("\0"))
    throw new Error("Unsafe relative path");
  const parts2 = relative.split("/");
  if (parts2.some((part) => !part || part === "." || part === ".."))
    throw new Error("Unsafe relative path");
  return parts2;
}
async function safeDirectory(project, parts2, create = false) {
  let current = await realpath2(project);
  if (!(await lstat(current)).isDirectory())
    throw new Error("Project must be a directory");
  for (const part of parts2) {
    pathParts(part);
    if (part.includes("/")) throw new Error("Unsafe directory component");
    current = join2(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (!create) return null;
      try {
        await mkdir(current, { mode: 448 });
      } catch (failure) {
        if (failure.code !== "EEXIST") throw failure;
      }
      info = await lstat(current);
    }
    if (info.isSymbolicLink()) throw new Error("Unsafe symlink directory");
    if (!info.isDirectory()) throw new Error("Expected storage directory");
  }
  return current;
}
async function safeEntries(project, parts2) {
  const directory = await safeDirectory(project, parts2);
  return directory === null ? null : readdir(directory, { withFileTypes: true });
}
async function safeBytes(project, parts2, maxBytes = MAX_JSON_BYTES) {
  const directory = await safeDirectory(project, parts2.slice(0, -1));
  if (directory === null) return null;
  const name = parts2.at(-1);
  pathParts(name);
  if (name.includes("/")) throw new Error("Unsafe file component");
  const path = join2(directory, name);
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (info.isSymbolicLink()) throw new Error("Unsafe symlink file");
  if (!info.isFile()) throw new Error("Expected regular file");
  if (info.size > maxBytes) throw new Error("File size limit exceeded");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > maxBytes)
      throw new Error("File size limit exceeded");
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        length,
        buffer.length - length,
        null
      );
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > maxBytes) throw new Error("File size limit exceeded");
    return { path, bytes: buffer.subarray(0, length) };
  } finally {
    await handle.close();
  }
}

// local/exploration-model.mjs
var ID = /^[a-zA-Z0-9_-]{1,80}$/;
var HASH = /^[a-f0-9]{64}$/;
var TABLES = [
  "artifacts",
  "observations",
  "hypotheses",
  "attempts",
  "decisions"
];
var INPUT_KEYS = ["version", "id", "expectedRevision", "brief", ...TABLES];
var compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function fail(message) {
  throw new Error(`Invalid exploration: ${message}`);
}
function object(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("expected object");
  for (const key of required)
    if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
  for (const key of Object.keys(value))
    if (![...required, ...optional].includes(key)) fail(`unknown field ${key}`);
}
function content(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 4e3)
    fail("content must be 1\u20134000 characters");
}
function id(value) {
  if (typeof value !== "string" || !ID.test(value)) fail("invalid identifier");
}
function hash(value) {
  if (typeof value !== "string" || !HASH.test(value)) fail("invalid hash");
}
function array(value) {
  if (!Array.isArray(value)) fail("expected array");
}
function choice(value, allowed) {
  if (!allowed.includes(value)) fail(`invalid value ${value}`);
}
function ids(value, min = 0) {
  array(value);
  value.forEach(id);
  if (value.length < min || new Set(value).size !== value.length)
    fail("empty or duplicate identifier list");
}
function strings(value) {
  array(value);
  value.forEach(content);
}
function links(value) {
  array(value);
  const seen = /* @__PURE__ */ new Set();
  for (const row of value) {
    object(row, ["batchId", "eventId", "recordHash"]);
    id(row.batchId);
    id(row.eventId);
    hash(row.recordHash);
    const key = `${row.batchId}/${row.eventId}`;
    if (seen.has(key)) fail("duplicate feedback link");
    seen.add(key);
  }
}
function refs(values, table) {
  for (const key of values)
    if (!table.has(key)) fail(`dangling reference ${key}`);
}
function replacements(rows) {
  const seen = /* @__PURE__ */ new Set(), result = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (row.supersedesId !== void 0) {
      id(row.supersedesId);
      if (!seen.has(row.supersedesId) || result.has(row.supersedesId))
        fail("supersedesId must name an unreplaced prior row");
      result.set(row.supersedesId, row.id);
    }
    seen.add(row.id);
  }
  return result;
}
function canonical2(value) {
  if (Array.isArray(value)) return `[${value.map(canonical2).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical2(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
function same(a, b) {
  return canonical2(a) === canonical2(b);
}
function states(input) {
  const attempted = new Set(input.attempts.flatMap((a) => a.hypothesisIds));
  const state = new Map(
    input.hypotheses.map((h) => [
      h.id,
      {
        searchState: attempted.has(h.id) ? "attempted" : "untested",
        latestDecision: -1
      }
    ])
  );
  let finished = false;
  input.decisions.forEach((d, index) => {
    if (finished && d.action !== "reopen")
      fail("finished session requires reopen before further decisions");
    if (d.action === "finish") {
      finished = true;
      return;
    }
    if (d.action === "reopen") finished = false;
    const update = (node, searchState) => state.set(node, { searchState, latestDecision: index });
    d.nodeIds.forEach(
      (node) => update(node, ["park", "return"].includes(d.action) ? "parked" : "active")
    );
    d.returnToIds.forEach((node) => update(node, "active"));
  });
  return { state, finished };
}
function validateExploration(input, previous = null) {
  object(input, INPUT_KEYS);
  if (input.version !== 1) fail("unsupported version");
  id(input.id);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)
    fail("invalid expectedRevision");
  object(input.brief, ["goal", "scope", "constraints"]);
  content(input.brief.goal);
  content(input.brief.scope);
  strings(input.brief.constraints);
  const maps = {};
  for (const name of TABLES) {
    array(input[name]);
    maps[name] = /* @__PURE__ */ new Map();
    for (const row of input[name]) {
      if (!row || typeof row !== "object") fail("invalid row");
      id(row.id);
      if (maps[name].has(row.id)) fail(`duplicate ${name} ID`);
      maps[name].set(row.id, row);
    }
  }
  for (const a of input.artifacts) {
    object(a, ["id", "role", "source"], ["locator"]);
    choice(a.role, ["reference", "original", "sample", "implementation"]);
    if (a.locator !== void 0) content(a.locator);
    const s = a.source;
    if (!s || typeof s !== "object") fail("invalid artifact source");
    if (s.kind === "study-file") {
      object(s, ["kind", "path", "sha256"]);
      content(s.path);
      hash(s.sha256);
      if (s.path.startsWith("/") || s.path.includes("\\") || /^[a-zA-Z]:/.test(s.path) || s.path.includes("\0") || s.path.split("/").some((p) => !p || p === "." || p === ".."))
        fail("study-file path must stay relative to study");
    } else if (s.kind === "feedback") {
      object(s, ["kind", "batchId", "artifactId", "recordHash"]);
      id(s.batchId);
      id(s.artifactId);
      hash(s.recordHash);
    } else if (s.kind === "unavailable") {
      object(s, ["kind", "reason"]);
      content(s.reason);
    } else fail("unknown artifact source");
  }
  for (const o of input.observations) {
    object(
      o,
      ["id", "artifactId", "basis", "region", "state", "description"],
      ["supersedesId"]
    );
    id(o.artifactId);
    refs([o.artifactId], maps.artifacts);
    choice(o.basis, ["inspected", "user-reported"]);
    [o.region, o.state, o.description].forEach(content);
  }
  replacements(input.observations);
  for (const h of input.hypotheses) {
    object(
      h,
      [
        "id",
        "parentIds",
        "observationIds",
        "claim",
        "expectedChange",
        "openQuestions"
      ],
      ["supersedesId"]
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
  const degrees = new Map(
    input.hypotheses.map((h) => [h.id, h.parentIds.length])
  );
  const children = new Map(input.hypotheses.map((h) => [h.id, []]));
  input.hypotheses.forEach(
    (h) => h.parentIds.forEach((p) => children.get(p).push(h.id))
  );
  const ready = input.hypotheses.filter((h) => !degrees.get(h.id)).map((h) => h.id);
  for (let i = 0; i < ready.length; i++)
    for (const child of children.get(ready[i])) {
      degrees.set(child, degrees.get(child) - 1);
      if (!degrees.get(child)) ready.push(child);
    }
  if (ready.length !== input.hypotheses.length)
    fail("hypothesis derivation cycle");
  for (const a of input.attempts) {
    object(a, ["id", "hypothesisIds", "artifactIds", "feedbackLinks"]);
    ids(a.hypothesisIds, 1);
    ids(a.artifactIds, 1);
    refs(a.hypothesisIds, maps.hypotheses);
    refs(a.artifactIds, maps.artifacts);
    links(a.feedbackLinks);
  }
  for (const d of input.decisions) {
    object(d, [
      "id",
      "action",
      "nodeIds",
      "attemptIds",
      "returnToIds",
      "explanation",
      "uncertainty",
      "revisitWhen",
      "basis",
      "feedbackLinks"
    ]);
    choice(d.action, [
      "explore",
      "refine",
      "combine",
      "park",
      "return",
      "reopen",
      "finish"
    ]);
    ids(d.nodeIds);
    ids(d.attemptIds);
    ids(d.returnToIds);
    refs(d.nodeIds, maps.hypotheses);
    refs(d.returnToIds, maps.hypotheses);
    refs(d.attemptIds, maps.attempts);
    [d.explanation, d.uncertainty, d.revisitWhen].forEach(content);
    choice(d.basis, ["inference", "user-instruction"]);
    links(d.feedbackLinks);
    if (d.basis === "user-instruction" && !d.feedbackLinks.length)
      fail("user instruction requires feedback evidence");
    if (d.action === "return" !== d.returnToIds.length > 0)
      fail("return target mismatch");
    if (d.nodeIds.some((n) => d.returnToIds.includes(n)))
      fail("return targets must be disjoint");
    if (d.action === "combine" && d.nodeIds.length < 2)
      fail("combine requires two nodes");
  }
  states(input);
  if (previous) {
    if (input.id !== previous.id || !same(input.brief, previous.brief))
      fail("study identity and brief are immutable");
    if (input.expectedRevision !== previous.revision)
      fail("expectedRevision does not match previous revision");
    for (const name of TABLES) {
      if (input[name].length < previous[name].length)
        fail(`${name} cannot be removed`);
      previous[name].forEach((row, index) => {
        const next = input[name][index];
        if (name !== "attempts") {
          if (!same(row, next))
            fail(`${name} must append without changing existing rows`);
        } else {
          const { feedbackLinks: oldLinks, ...oldBody } = row;
          const { feedbackLinks: newLinks, ...newBody } = next;
          if (!same(oldBody, newBody) || newLinks.length < oldLinks.length || !same(oldLinks, newLinks.slice(0, oldLinks.length)))
            fail("attempts only permit appended feedback links");
        }
      });
    }
  }
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > 1e6)
    fail("record exceeds 1,000,000 bytes");
  return structuredClone(input);
}
function explorationView(snapshot, { nodeId, limit = 10 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
    fail("limit must be 1\u201350");
  if (!Number.isSafeInteger(snapshot?.revision) || snapshot.revision < 1)
    fail("view requires a saved snapshot revision");
  const input = Object.fromEntries(
    INPUT_KEYS.map((key) => [key, snapshot[key]])
  );
  validateExploration(input);
  const byId = new Map(input.hypotheses.map((h) => [h.id, h]));
  if (nodeId !== void 0 && !byId.has(nodeId)) fail("unknown nodeId");
  const { state, finished } = states(input);
  const replaced = replacements(input.hypotheses), corrected = replacements(input.observations);
  const observations = new Map(input.observations.map((o) => [o.id, o]));
  const artifacts = new Map(input.artifacts.map((a) => [a.id, a]));
  const compare = (a, b) => state.get(b.id).latestDecision - state.get(a.id).latestDecision || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const all = [...input.hypotheses].sort(compare);
  const ancestorIds = /* @__PURE__ */ new Set();
  if (nodeId !== void 0) {
    const pending = [...byId.get(nodeId).parentIds];
    for (let i = 0; i < pending.length; i++)
      if (!ancestorIds.has(pending[i])) {
        ancestorIds.add(pending[i]);
        pending.push(...byId.get(pending[i]).parentIds);
      }
  }
  const requested = nodeId === void 0 ? all.filter(
    (h) => !replaced.has(h.id) && ["active", "attempted"].includes(state.get(h.id).searchState)
  ) : [byId.get(nodeId), ...all.filter((h) => ancestorIds.has(h.id))];
  const alternatives = all.filter(
    (h) => !replaced.has(h.id) && state.get(h.id).searchState === "untested" && !requested.some((n) => n.id === h.id)
  );
  const parked = all.filter((h) => state.get(h.id).searchState === "parked");
  const relevantIds = nodeId === void 0 ? new Set(all.map((h) => h.id)) : /* @__PURE__ */ new Set([nodeId, ...ancestorIds]);
  const relevantAttempts = input.attempts.filter(
    (a) => a.hypothesisIds.some((n) => relevantIds.has(n))
  );
  const attemptIds = new Set(relevantAttempts.map((a) => a.id));
  const decisions = input.decisions.map((d, index) => ({ d, index })).filter(
    ({ d }) => nodeId === void 0 || [...d.nodeIds, ...d.returnToIds].some((n) => relevantIds.has(n)) || d.attemptIds.some((a) => attemptIds.has(a)) || d.action === "finish"
  ).sort((a, b) => b.index - a.index).map(({ d }) => d);
  const decisionAttemptIds = [
    ...new Set(decisions.flatMap((d) => [...d.attemptIds].sort(compareIds)))
  ];
  const attemptsById = new Map(input.attempts.map((a) => [a.id, a]));
  const summarize = (h) => {
    const attempts = input.attempts.filter(
      (a) => a.hypothesisIds.includes(h.id)
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
        replacementId: corrected.get(key) ?? null
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
      omittedAttempts: Math.max(0, attempts.length - limit)
    };
  };
  return structuredClone({
    id: input.id,
    revision: snapshot.revision,
    brief: input.brief,
    sessionState: finished ? "finished" : "open",
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
    decisionAttempts: decisionAttemptIds.slice(0, limit).map((id3) => attemptsById.get(id3)),
    omitted: {
      nodes: Math.max(0, requested.length - limit),
      alternatives: Math.max(0, alternatives.length - limit),
      parked: Math.max(0, parked.length - limit),
      decisions: Math.max(0, decisions.length - limit),
      decisionAttempts: Math.max(0, decisionAttemptIds.length - limit)
    }
  });
}

// local/exploration-store.mjs
import { writeFile, link, unlink } from "node:fs/promises";
import { join as join3 } from "node:path";
import { randomUUID } from "node:crypto";

// local/feedback.mjs
var fail2 = (message) => {
  throw new Error(`Invalid feedback: ${message}`);
};
function object2(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail2("expected object");
  for (const key of Object.keys(value))
    if (!fields.includes(key)) fail2(`unknown field ${key}`);
}
function text(value, name, max = 1e4) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail2(name);
}
function id2(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    fail2("unsafe ID");
}
function list(value, name, max) {
  if (!Array.isArray(value) || value.length > max) fail2(name);
}
function validateBatch(data) {
  object2(data, ["id", "mode", "coverage", "artifacts", "events"]);
  id2(data.id);
  if (!["live", "retrospective"].includes(data.mode)) fail2("mode");
  object2(data.coverage, ["source", "limitations"]);
  text(data.coverage.source, "coverage source");
  list(data.coverage.limitations, "limitations", 100);
  data.coverage.limitations.forEach((value) => text(value, "limitation"));
  list(data.artifacts, "artifacts", 24);
  list(data.events, "events", 100);
  if (!data.events.length) fail2("at least one event required");
  const artifactIds = /* @__PURE__ */ new Set();
  for (const artifact of data.artifacts) {
    object2(artifact, ["id", "path", "locator", "missingReason"]);
    id2(artifact.id);
    if (artifactIds.has(artifact.id)) fail2("duplicate artifact ID");
    artifactIds.add(artifact.id);
    if (artifact.path !== void 0) {
      text(artifact.path, "artifact path");
      if (artifact.missingReason !== void 0)
        fail2("snapshot cannot be missing");
    } else
      text(artifact.missingReason, "missingReason required without a snapshot");
    if (artifact.locator !== void 0)
      text(artifact.locator, "artifact locator");
  }
  const eventIds = /* @__PURE__ */ new Set();
  for (const event of data.events) {
    object2(event, [
      "id",
      "kind",
      "evidence",
      "text",
      "source",
      "occurredAt",
      "context",
      "artifactIds",
      "disposition"
    ]);
    if (event.disposition !== void 0) {
      object2(event.disposition, ["publication", "readiness", "aesthetic", "basis"]);
      for (const [axis, values] of Object.entries({
        publication: ["unknown", "authorized"],
        readiness: ["unknown", "acceptable"],
        aesthetic: ["unknown", "positive", "preferred"]
      })) if (!values.includes(event.disposition[axis])) fail2(`disposition ${axis}`);
      text(event.disposition.basis, "disposition basis");
    }
    id2(event.id);
    if (eventIds.has(event.id)) fail2("duplicate event ID");
    eventIds.add(event.id);
    const kinds = [
      "positive",
      "negative",
      "directed-edit",
      "reversion",
      "acceptance",
      "preservation",
      "hypothesis",
      "pause"
    ];
    if (!kinds.includes(event.kind)) fail2("event kind");
    if (!["verbatim", "summary", "observation", "inference"].includes(
      event.evidence
    ))
      fail2("evidence type");
    if ([
      "positive",
      "negative",
      "directed-edit",
      "reversion",
      "acceptance"
    ].includes(event.kind) && !["verbatim", "summary"].includes(event.evidence))
      fail2(`${event.kind} requires explicit user evidence`);
    if (event.kind === "hypothesis" && event.evidence !== "inference")
      fail2("hypothesis must be inference");
    if (event.kind === "preservation" && event.evidence !== "observation")
      fail2("preservation is only an observation");
    for (const field of ["text", "source", "context"])
      text(event[field], field);
    if (event.occurredAt !== null && (typeof event.occurredAt !== "string" || Number.isNaN(Date.parse(event.occurredAt))))
      fail2("occurredAt must be a known timestamp or null");
    list(event.artifactIds, "artifact references", 24);
    if (event.artifactIds.some((value) => !artifactIds.has(value)))
      fail2("unknown artifact reference");
  }
  return data;
}

// local/exploration-evidence.mjs
function unavailable(reason) {
  return { status: "unavailable", reason };
}
async function journal(project, ref) {
  const loaded = await safeBytes(
    project,
    [".incline", "feedback", ref.batchId, "record.json"],
    2e6
  );
  if (!loaded) return unavailable("Feedback record missing");
  if (digest(loaded.bytes) !== ref.recordHash)
    return { status: "changed", reason: "Feedback record hash changed" };
  const record = JSON.parse(loaded.bytes.toString("utf8"));
  if (record.version !== 1 || record.id !== ref.batchId || !Array.isArray(record.artifacts))
    throw new Error("Invalid linked feedback record");
  validateBatch({
    id: record.id,
    mode: record.mode,
    coverage: record.coverage,
    events: record.events,
    artifacts: record.artifacts.map(
      ({ snapshot: _snapshot, sha256: _sha256, ...original }) => original
    )
  });
  return { status: "available", record, recordPath: loaded.path };
}
async function resolveFeedbackLink(project, ref) {
  try {
    const loaded = await journal(project, ref);
    if (loaded.status !== "available") return { ...ref, ...loaded };
    const matches = loaded.record.events.filter(
      (event) => event.id === ref.eventId
    );
    if (matches.length !== 1)
      return { ...ref, ...unavailable("Missing or ambiguous feedback event") };
    return {
      ...ref,
      status: "available",
      recordPath: loaded.recordPath,
      event: matches[0],
      coverage: loaded.record.coverage
    };
  } catch (error) {
    return { ...ref, ...unavailable(error.message) };
  }
}
async function resolveArtifact(project, studyId, artifact) {
  const base = {
    id: artifact.id,
    role: artifact.role,
    source: artifact.source,
    ...artifact.locator ? { locator: artifact.locator } : {}
  };
  try {
    const source = artifact.source;
    if (source.kind === "unavailable")
      return { ...base, ...unavailable(source.reason) };
    let parts2, expected;
    if (source.kind === "study-file") {
      parts2 = [".incline", "studies", studyId, ...pathParts(source.path)];
      expected = source.sha256;
    } else {
      const linked = await journal(project, source);
      if (linked.status !== "available")
        return { ...base, status: linked.status, reason: linked.reason };
      const matches = linked.record.artifacts.filter(
        (item2) => item2.id === source.artifactId
      );
      if (matches.length !== 1)
        return {
          ...base,
          ...unavailable("Missing or ambiguous feedback artifact")
        };
      const item = matches[0];
      if (!item.snapshot)
        return {
          ...base,
          ...unavailable(item.missingReason || "No saved visual; locator only")
        };
      if (!/^assets\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/.test(item.snapshot) || !/^[a-f0-9]{64}$/.test(item.sha256))
        throw new Error("Invalid feedback snapshot metadata");
      parts2 = [
        ".incline",
        "feedback",
        source.batchId,
        ...pathParts(item.snapshot)
      ];
      expected = item.sha256;
    }
    const loaded = await safeBytes(project, parts2, MAX_ASSET_BYTES);
    if (!loaded) return { ...base, ...unavailable("Artifact file missing") };
    const actual = digest(loaded.bytes);
    if (actual !== expected)
      return {
        ...base,
        status: "changed",
        reason: "Artifact hash changed",
        expectedHash: expected,
        actualHash: actual
      };
    return { ...base, status: "available", path: loaded.path, sha256: actual };
  } catch (error) {
    return { ...base, ...unavailable(error.message) };
  }
}
function relatedEvidence(snapshot, nodeId) {
  const nodes = new Map(snapshot.hypotheses.map((node) => [node.id, node]));
  if (!nodes.has(nodeId)) throw new Error("Unknown hypothesis ID");
  const ids2 = /* @__PURE__ */ new Set(), pending = [nodeId];
  while (pending.length) {
    const id3 = pending.pop();
    if (ids2.has(id3)) continue;
    ids2.add(id3);
    pending.push(...nodes.get(id3).parentIds);
  }
  const observationIds = new Set(
    [...ids2].flatMap((id3) => nodes.get(id3).observationIds)
  );
  const artifactIds = new Set(
    snapshot.observations.filter((o) => observationIds.has(o.id)).map((o) => o.artifactId)
  );
  const directAttempts = snapshot.attempts.filter(
    (a) => a.hypothesisIds.some((id3) => ids2.has(id3))
  );
  const attemptIds = new Set(directAttempts.map((a) => a.id));
  const decisions = snapshot.decisions.filter(
    (d) => [...d.nodeIds, ...d.returnToIds].some((id3) => ids2.has(id3)) || d.attemptIds.some((id3) => attemptIds.has(id3))
  );
  for (const decision of decisions)
    for (const id3 of decision.attemptIds) attemptIds.add(id3);
  const attempts = snapshot.attempts.filter((a) => attemptIds.has(a.id));
  for (const attempt of attempts)
    for (const id3 of attempt.artifactIds) artifactIds.add(id3);
  const refs2 = /* @__PURE__ */ new Map();
  for (const row of [...attempts, ...decisions])
    for (const ref of row.feedbackLinks)
      refs2.set(`${ref.batchId}/${ref.eventId}/${ref.recordHash}`, ref);
  return {
    artifacts: snapshot.artifacts.filter((a) => artifactIds.has(a.id)),
    feedback: [...refs2.values()]
  };
}
async function verifyNewEvidence(project, input, previous) {
  const existingArtifacts = new Set(previous?.artifacts.map((a) => a.id));
  for (const artifact of input.artifacts) {
    if (existingArtifacts.has(artifact.id) || artifact.source.kind === "unavailable")
      continue;
    const result = await resolveArtifact(project, input.id, artifact);
    if (result.status !== "available")
      throw new Error(
        `Artifact ${artifact.id}: ${result.status}: ${result.reason}`
      );
  }
  const resolved = /* @__PURE__ */ new Map();
  for (const table of ["attempts", "decisions"]) {
    const previousRows = new Map(
      (previous?.[table] ?? []).map((row) => [row.id, row])
    );
    for (const row of input[table])
      for (const ref of row.feedbackLinks.slice(
        previousRows.get(row.id)?.feedbackLinks.length ?? 0
      )) {
        const key = JSON.stringify(ref);
        if (resolved.has(key)) continue;
        const result = await resolveFeedbackLink(project, ref);
        if (result.status !== "available")
          throw new Error(
            `Feedback ${ref.eventId}: ${result.status}: ${result.reason}`
          );
        resolved.set(key, result);
      }
  }
  for (const row of input.decisions.slice(previous?.decisions.length ?? 0)) {
    if (row.basis !== "user-instruction") continue;
    let supported = false;
    for (const ref of row.feedbackLinks) {
      const result = resolved.get(JSON.stringify(ref)) ?? await resolveFeedbackLink(project, ref);
      if (result.status === "available" && ["directed-edit", "reversion"].includes(result.event.kind) && ["verbatim", "summary"].includes(result.event.evidence))
        supported = true;
    }
    if (!supported)
      throw new Error(
        "A user-instruction decision needs a linked user instruction"
      );
  }
}

// local/exploration-store.mjs
var parts = (id3) => [".incline", "studies", safeId(id3), "exploration"];
function revisionNumber(revision) {
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new Error("Invalid revision");
}
async function revisions(project, id3) {
  const entries = await safeEntries(project, parts(id3));
  if (entries === null) return [];
  const numbers = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error("Unsafe symlink revision");
    if (/^\.pending-[a-f0-9-]+$/.test(entry.name) && entry.isFile()) continue;
    if (!entry.isFile() || !/^[1-9][0-9]*\.json$/.test(entry.name))
      throw new Error("Invalid exploration revision entry");
    const n = Number(entry.name.slice(0, -5));
    revisionNumber(n);
    numbers.push(n);
  }
  numbers.sort((a, b) => a - b);
  if (numbers.some((n, i) => n !== i + 1))
    throw new Error("Missing exploration revision");
  return numbers;
}
async function loadRevision(project, id3, revision) {
  const loaded = await safeBytes(project, [...parts(id3), `${revision}.json`]);
  if (!loaded) return null;
  const raw = JSON.parse(loaded.bytes.toString("utf8"));
  const { revision: savedRevision, recordedAt, requestHash, ...input } = raw;
  if (savedRevision !== revision || input.expectedRevision !== revision - 1 || input.id !== id3 || typeof recordedAt !== "string" || Number.isNaN(Date.parse(recordedAt)) || !/^[a-f0-9]{64}$/.test(requestHash))
    throw new Error("Invalid exploration snapshot envelope");
  const valid = validateExploration(input);
  if (digest(canonical(valid)) !== requestHash)
    throw new Error("Exploration request hash integrity failure");
  return { ...valid, revision, recordedAt, requestHash };
}
async function readExploration(project, { id: id3, revision } = {}) {
  safeId(id3);
  if (revision !== void 0) revisionNumber(revision);
  const available = await revisions(project, id3);
  if (!available.length) return null;
  const requested = revision ?? available.at(-1);
  if (!available.includes(requested)) return null;
  const result = await loadRevision(project, id3, requested);
  if (!result)
    throw new Error("Exploration revision disappeared while reading");
  return result;
}
async function saveExploration(project, input) {
  const data = validateExploration(input);
  const current = await readExploration(project, { id: data.id });
  const revision = data.expectedRevision + 1;
  revisionNumber(revision);
  const requestHash = digest(canonical(data));
  const revisionPath = join3(
    await safeDirectory(project, []),
    ...parts(data.id),
    `${revision}.json`
  );
  const alreadySaved = async () => {
    const saved = await loadRevision(project, data.id, revision);
    if (saved?.requestHash === requestHash)
      return { status: "already-saved", revision, revisionPath };
    throw new Error(
      "Conflicting exploration revision; read the latest checkpoint"
    );
  };
  if (current && revision <= current.revision) return alreadySaved();
  if ((current?.revision ?? 0) !== data.expectedRevision)
    throw new Error("Stale exploration revision; read before updating");
  validateExploration(data, current);
  await verifyNewEvidence(project, data, current);
  const snapshot = {
    ...data,
    revision,
    recordedAt: (/* @__PURE__ */ new Date()).toISOString(),
    requestHash
  };
  const bytes = JSON.stringify(snapshot, null, 2) + "\n";
  if (Buffer.byteLength(bytes) > MAX_JSON_BYTES)
    throw new Error("Exploration snapshot size limit exceeded");
  const directory = await safeDirectory(project, parts(data.id), true);
  const temp = join3(directory, `.pending-${randomUUID()}`);
  try {
    await writeFile(temp, bytes, { flag: "wx", mode: 384 });
    await safeDirectory(project, parts(data.id));
    try {
      await link(temp, revisionPath);
    } catch (error) {
      if (error.code === "EEXIST") return await alreadySaved();
      throw error;
    }
  } finally {
    await unlink(temp).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return { status: "saved", revision, revisionPath };
}
async function listExplorations(project) {
  const entries = await safeEntries(project, [".incline", "studies"]);
  const studies = [];
  for (const entry of entries ?? []) {
    safeId(entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink())
      throw new Error("Unsafe study directory");
    const snapshot = await readExploration(project, { id: entry.name });
    if (snapshot)
      studies.push({
        id: snapshot.id,
        revision: snapshot.revision,
        goal: snapshot.brief.goal
      });
  }
  studies.sort((a, b) => a.id.localeCompare(b.id));
  return { studies };
}
async function explorationEvidence(project, { id: id3, nodeId }) {
  safeId(nodeId);
  const snapshot = await readExploration(project, { id: id3 });
  if (!snapshot) throw new Error("Exploration not found");
  const refs2 = relatedEvidence(snapshot, nodeId);
  const artifacts = [], feedback = [];
  for (const artifact of refs2.artifacts)
    artifacts.push(await resolveArtifact(project, id3, artifact));
  for (const ref of refs2.feedback)
    feedback.push(await resolveFeedbackLink(project, ref));
  const warnings = [...artifacts, ...feedback].filter((item) => item.status !== "available").map((item) => ({
    ...item.id ? { artifactId: item.id } : { batchId: item.batchId, eventId: item.eventId },
    status: item.status,
    reason: item.reason
  }));
  return { artifacts, feedback, warnings };
}

// local/exploration-cli.mjs
var help = `Incline exploration
  exploration.mjs save --input <checkpoint.json> [--project <directory>]
  exploration.mjs list [--project <directory>]
  exploration.mjs read --id <study> [--revision <number>] [--project <directory>]
  exploration.mjs view --id <study> [--node <hypothesis>] [--limit <1-50>] [--project <directory>]
  exploration.mjs evidence --id <study> --node <hypothesis> [--project <directory>]
Project-local, agent-authored exploration checkpoints. Read operations create no files.
All hypotheses remain interpretations. No automatic recording, selection, or promotion.
--local-only is accepted; personal/library operations are not supported.`;
try {
  const [command, ...args] = process.argv.slice(2);
  if (["--help", "-h"].includes(command) && !args.length) console.log(help);
  else {
    const allowed = {
      save: [],
      list: [],
      read: ["id", "revision"],
      view: ["id", "node", "limit"],
      evidence: ["id", "node"]
    };
    if (!Object.hasOwn(allowed, command))
      throw new Error("Choose save, list, read, view, or evidence");
    const filters = {}, optionArgs = [];
    for (let i = 0; i < args.length; i++) {
      const flag = args[i];
      if (["--library-dir", "--personal-dir"].includes(flag))
        throw new Error(
          "Exploration is project-local; shared directories are unsupported"
        );
      if (["--id", "--node", "--revision", "--limit"].includes(flag)) {
        const key = flag.slice(2);
        if (Object.hasOwn(filters, key) || !allowed[command].includes(key) || !args[i + 1] || args[i + 1].startsWith("--"))
          throw new Error(`Invalid or unsupported filter: ${flag}`);
        filters[key] = args[++i];
      } else if (["--project", "--input"].includes(flag)) {
        if (flag === "--input" && command !== "save")
          throw new Error("Only save accepts --input");
        if (!args[i + 1] || args[i + 1].startsWith("--"))
          throw new Error(`Missing value for ${flag}`);
        optionArgs.push(flag, args[++i]);
      } else if (flag === "--local-only") optionArgs.push(flag);
      else throw new Error(`Unknown option: ${flag}`);
    }
    const options = await resolveOptions(optionArgs);
    for (const key of ["revision", "limit"])
      if (filters[key] !== void 0) {
        if (!/^[1-9][0-9]*$/.test(filters[key]) || !Number.isSafeInteger(Number(filters[key])))
          throw new Error(`Invalid ${key}`);
        filters[key] = Number(filters[key]);
      }
    if (filters.limit > 50) throw new Error("limit must be from 1 to 50");
    if (["read", "view", "evidence"].includes(command) && !filters.id)
      throw new Error(`${command} requires --id`);
    if (command === "evidence" && !filters.node)
      throw new Error("evidence requires --node");
    let result;
    if (command === "save") {
      if (!options.input) throw new Error("save requires --input");
      const loaded = await safeBytes(dirname2(options.input), [
        basename(options.input)
      ]);
      if (!loaded) throw new Error("Input file not found");
      result = await saveExploration(
        options.project,
        JSON.parse(loaded.bytes.toString("utf8"))
      );
    } else if (command === "list")
      result = await listExplorations(options.project);
    else if (command === "evidence")
      result = await explorationEvidence(options.project, {
        id: filters.id,
        nodeId: filters.node
      });
    else {
      const snapshot = await readExploration(options.project, {
        id: filters.id,
        ...filters.revision ? { revision: filters.revision } : {}
      });
      result = command === "read" || snapshot === null ? snapshot : explorationView(snapshot, {
        ...filters.node ? { nodeId: filters.node } : {},
        ...filters.limit ? { limit: filters.limit } : {}
      });
    }
    console.log(JSON.stringify(result));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
