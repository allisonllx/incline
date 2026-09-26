// local/insights-cli.mjs
import { readFile as readFile5, stat as stat3 } from "node:fs/promises";

// local/personal-insights.mjs
import {
  lstat,
  readFile as readFile2,
  writeFile as writeFile2,
  mkdir as mkdir2,
  readdir as readdir2,
  link as link2,
  unlink as unlink2
} from "node:fs/promises";
import { join as join2, resolve, parse, relative } from "node:path";
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";

// local/insights.mjs
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  link,
  unlink,
  stat
} from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
var hash = (bytes2) => createHash("sha256").update(bytes2).digest("hex");
function id(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    throw new Error("Invalid insight/evidence ID");
}
function text(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2e3)
    throw new Error("Invalid insight text");
}
function validate(data) {
  const keys = [
    "id",
    "aspect",
    "finding",
    "scope",
    "status",
    "qualifications",
    "openQuestions",
    "supportingEvidence",
    "conflictingEvidence",
    "expectedRevision"
  ];
  if (!data || typeof data !== "object" || Object.keys(data).some((k) => !keys.includes(k)))
    throw new Error("Invalid insight fields");
  id(data.id);
  for (const key2 of ["aspect", "finding", "scope"]) text(data[key2]);
  if (!["tentative", "explicit", "superseded"].includes(data.status))
    throw new Error("Invalid insight status");
  if (!Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0)
    throw new Error("Invalid expected revision");
  for (const key2 of ["qualifications", "openQuestions"]) {
    if (!Array.isArray(data[key2]) || data[key2].length > 20)
      throw new Error("Invalid insight notes");
    data[key2].forEach(text);
  }
  for (const key2 of ["supportingEvidence", "conflictingEvidence"]) {
    if (!Array.isArray(data[key2]) || data[key2].length > 50)
      throw new Error("Invalid evidence links");
    for (const ref of data[key2]) {
      if (!ref || Object.keys(ref).some((k) => !["batchId", "eventId"].includes(k)))
        throw new Error("Invalid evidence reference");
      id(ref.batchId);
      id(ref.eventId);
    }
  }
  if (!data.supportingEvidence.length)
    throw new Error("An insight needs supporting evidence");
}
async function loadJson(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size > 2e6)
    throw new Error("Invalid or oversized evidence file");
  const raw = await readFile(path);
  return { data: JSON.parse(raw.toString("utf8")), hash: hash(raw) };
}
async function resolveEvidence(project, ref, inspectArtifacts = false) {
  id(ref.batchId);
  id(ref.eventId);
  const base = join(project, ".incline/feedback", ref.batchId);
  const recordPath = join(base, "record.json");
  const loaded = await loadJson(recordPath);
  const record = loaded.data;
  if (record.version !== 1 || record.id !== ref.batchId || !Array.isArray(record.events) || !Array.isArray(record.artifacts))
    throw new Error("Invalid linked record");
  const matches2 = record.events.filter((e) => e.id === ref.eventId);
  if (matches2.length !== 1)
    throw new Error(`Missing or ambiguous event ${ref.batchId}/${ref.eventId}`);
  const event = matches2[0];
  const result = {
    batchId: ref.batchId,
    eventId: ref.eventId,
    recordHash: loaded.hash,
    recordPath,
    event,
    coverage: record.coverage
  };
  if (ref.recordHash)
    result.changedSinceInsight = ref.recordHash !== loaded.hash;
  if (inspectArtifacts) {
    result.artifacts = [];
    for (const artifactId of event.artifactIds ?? []) {
      const artifact = record.artifacts.find((a) => a.id === artifactId);
      if (!artifact) throw new Error("Missing linked artifact entry");
      let availability = artifact.locator ? "external-reference-only" : "unavailable";
      let snapshotPath;
      if (artifact.missingReason) availability = "unavailable";
      if (artifact.snapshot) {
        if (!/^assets\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/.test(artifact.snapshot))
          throw new Error("Unsafe artifact snapshot path");
        snapshotPath = join(base, artifact.snapshot);
        try {
          availability = hash(await readFile(snapshotPath)) === artifact.sha256 ? "snapshot-saved" : "snapshot-changed";
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          availability = "snapshot-missing";
        }
      }
      result.artifacts.push({
        ...artifact,
        availability,
        ...snapshotPath ? { snapshotPath } : {}
      });
    }
  }
  return result;
}
async function latest(project, insightId, requestedRevision) {
  id(insightId);
  const directory3 = join(project, ".incline/insights", insightId);
  let names2;
  try {
    names2 = await readdir(directory3);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const revisions2 = names2.filter((n) => /^[1-9][0-9]*\.json$/.test(n)).map((n) => Number(n.slice(0, -5)));
  if (!revisions2.length) return null;
  const revision2 = requestedRevision ?? Math.max(...revisions2);
  const path = join(directory3, `${revision2}.json`);
  const { data } = await loadJson(path);
  const {
    version,
    revision: savedRevision,
    recordedAt,
    supportingEvidence,
    conflictingEvidence,
    ...input
  } = data;
  const strip = (refs2) => refs2.map(({ recordHash, ...ref }) => {
    if (!/^[a-f0-9]{64}$/.test(recordHash))
      throw new Error("Invalid evidence hash");
    return ref;
  });
  validate({
    ...input,
    supportingEvidence: strip(supportingEvidence),
    conflictingEvidence: strip(conflictingEvidence)
  });
  if (version !== 1 || savedRevision !== revision2 || data.id !== insightId || !recordedAt || Number.isNaN(Date.parse(recordedAt)))
    throw new Error("Invalid saved insight");
  return { ...data, revisionPath: path };
}
async function readInsights(project, { id: insightId, aspect } = {}) {
  let ids;
  if (insightId) {
    id(insightId);
    ids = [insightId];
  } else {
    try {
      ids = await readdir(join(project, ".incline/insights"));
    } catch (error) {
      if (error.code === "ENOENT") return { insights: [] };
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
async function saveInsight(project, data) {
  validate(data);
  if (!(await stat(project)).isDirectory())
    throw new Error("Project must be a directory");
  const current = await latest(project, data.id);
  if ((current?.revision ?? 0) !== data.expectedRevision)
    throw new Error(
      "Stale insight revision; read current insight before updating"
    );
  const supporting = await Promise.all(
    data.supportingEvidence.map((ref) => resolveEvidence(project, ref))
  );
  const conflicting = await Promise.all(
    data.conflictingEvidence.map((ref) => resolveEvidence(project, ref))
  );
  if (data.status === "explicit" && !supporting.some(
    ({ event }) => ["verbatim", "summary"].includes(event.evidence) && ["directed-edit", "reversion"].includes(event.kind)
  ))
    throw new Error(
      "An explicit instruction needs a linked user instruction; inference or acceptance alone is insufficient"
    );
  const compact2 = (items) => items.map(({ batchId, eventId, recordHash }) => ({
    batchId,
    eventId,
    recordHash
  }));
  const record = {
    version: 1,
    ...data,
    revision: data.expectedRevision + 1,
    recordedAt: (/* @__PURE__ */ new Date()).toISOString(),
    supportingEvidence: compact2(supporting),
    conflictingEvidence: compact2(conflicting)
  };
  const directory3 = join(project, ".incline/insights", data.id);
  await mkdir(directory3, { recursive: true });
  const temp = join(directory3, `.pending-${randomUUID()}`);
  const revisionPath = join(directory3, `${record.revision}.json`);
  try {
    await writeFile(temp, JSON.stringify(record, null, 2) + "\n", {
      flag: "wx",
      mode: 384
    });
    try {
      await link(temp, revisionPath);
    } catch (error) {
      if (error.code === "EEXIST")
        throw new Error(
          "Concurrent insight revision; read current insight before updating"
        );
      throw error;
    }
  } finally {
    await unlink(temp).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return { status: "saved", revision: record.revision, revisionPath };
}
async function insightEvidence(project, insightId) {
  const insight = await latest(project, insightId);
  if (!insight) throw new Error("Insight not found");
  return {
    insight,
    supporting: await Promise.all(
      insight.supportingEvidence.map(
        (ref) => resolveEvidence(project, ref, true)
      )
    ),
    conflicting: await Promise.all(
      insight.conflictingEvidence.map(
        (ref) => resolveEvidence(project, ref, true)
      )
    )
  };
}
async function readInsightRevision(project, insightId, revision2) {
  if (!Number.isSafeInteger(revision2) || revision2 < 1) throw new Error("Invalid revision");
  const result = await latest(project, insightId, revision2);
  if (!result) throw new Error("Missing insight revision");
  return result;
}

// local/feedback.mjs
var fail = (message) => {
  throw new Error(`Invalid feedback: ${message}`);
};
function object(value, fields3) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("expected object");
  for (const key2 of Object.keys(value))
    if (!fields3.includes(key2)) fail(`unknown field ${key2}`);
}
function text2(value, name, max = 1e4) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(name);
}
function id2(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    fail("unsafe ID");
}
function list(value, name, max) {
  if (!Array.isArray(value) || value.length > max) fail(name);
}
function validateBatch(data) {
  object(data, ["id", "mode", "coverage", "artifacts", "events"]);
  id2(data.id);
  if (!["live", "retrospective"].includes(data.mode)) fail("mode");
  object(data.coverage, ["source", "limitations"]);
  text2(data.coverage.source, "coverage source");
  list(data.coverage.limitations, "limitations", 100);
  data.coverage.limitations.forEach((value) => text2(value, "limitation"));
  list(data.artifacts, "artifacts", 24);
  list(data.events, "events", 100);
  if (!data.events.length) fail("at least one event required");
  const artifactIds = /* @__PURE__ */ new Set();
  for (const artifact of data.artifacts) {
    object(artifact, ["id", "path", "locator", "missingReason"]);
    id2(artifact.id);
    if (artifactIds.has(artifact.id)) fail("duplicate artifact ID");
    artifactIds.add(artifact.id);
    if (artifact.path !== void 0) {
      text2(artifact.path, "artifact path");
      if (artifact.missingReason !== void 0)
        fail("snapshot cannot be missing");
    } else
      text2(artifact.missingReason, "missingReason required without a snapshot");
    if (artifact.locator !== void 0)
      text2(artifact.locator, "artifact locator");
  }
  const eventIds = /* @__PURE__ */ new Set();
  for (const event of data.events) {
    object(event, [
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
      object(event.disposition, ["publication", "readiness", "aesthetic", "basis"]);
      for (const [axis, values] of Object.entries({
        publication: ["unknown", "authorized"],
        readiness: ["unknown", "acceptable"],
        aesthetic: ["unknown", "positive", "preferred"]
      })) if (!values.includes(event.disposition[axis])) fail(`disposition ${axis}`);
      text2(event.disposition.basis, "disposition basis");
    }
    id2(event.id);
    if (eventIds.has(event.id)) fail("duplicate event ID");
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
    if (!kinds.includes(event.kind)) fail("event kind");
    if (!["verbatim", "summary", "observation", "inference"].includes(
      event.evidence
    ))
      fail("evidence type");
    if ([
      "positive",
      "negative",
      "directed-edit",
      "reversion",
      "acceptance"
    ].includes(event.kind) && !["verbatim", "summary"].includes(event.evidence))
      fail(`${event.kind} requires explicit user evidence`);
    if (event.kind === "hypothesis" && event.evidence !== "inference")
      fail("hypothesis must be inference");
    if (event.kind === "preservation" && event.evidence !== "observation")
      fail("preservation is only an observation");
    for (const field of ["text", "source", "context"])
      text2(event[field], field);
    if (event.occurredAt !== null && (typeof event.occurredAt !== "string" || Number.isNaN(Date.parse(event.occurredAt))))
      fail("occurredAt must be a known timestamp or null");
    list(event.artifactIds, "artifact references", 24);
    if (event.artifactIds.some((value) => !artifactIds.has(value)))
      fail("unknown artifact reference");
  }
  return data;
}

// local/personal-insights.mjs
var hash2 = (bytes2) => createHash2("sha256").update(bytes2).digest("hex");
var digestPattern = /^[a-f0-9]{64}$/;
function id3(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    throw new Error("Unsafe personal insight ID");
}
function text3(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 1e4)
    throw new Error("Invalid personal insight text");
}
function revision(value, zero = false) {
  if (!Number.isSafeInteger(value) || value < (zero ? 0 : 1))
    throw new Error("Invalid revision");
}
async function safe(path) {
  path = resolve(path);
  let cursor = parse(path).root;
  for (const part of relative(cursor, path).split("/").filter(Boolean)) {
    cursor = join2(cursor, part);
    try {
      if ((await lstat(cursor)).isSymbolicLink())
        throw new Error("Symlinks are not allowed");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return path;
}
async function bytes(path, limit = 48 * 1024 * 1024) {
  await safe(path);
  const info = await lstat(path);
  if (!info.isFile() || info.size > limit)
    throw new Error("Invalid or oversized snapshot file");
  const raw = await readFile2(path);
  if (raw.length > limit) throw new Error("Oversized snapshot file");
  return raw;
}
function directory(value) {
  if (typeof value !== "string" || !value)
    throw new Error("Personal operations are disabled by --local-only");
  return resolve(value);
}
function fields(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key2) => !allowed.includes(key2)))
    throw new Error("Invalid selection fields");
}
function validateSelection(selection) {
  if (!selection || typeof selection !== "object")
    throw new Error("Invalid selection");
  id3(selection.id);
  revision(selection.expectedRevision, true);
  for (const key2 of ["aspect", "finding", "scope"]) text3(selection[key2]);
  if (typeof selection.reviewed !== "boolean")
    throw new Error("Selection must declare its human-reviewed state");
  if (!["tentative", "explicit", "superseded"].includes(selection.status))
    throw new Error("Invalid status");
  if (!Array.isArray(selection.exceptions) || selection.exceptions.length > 20)
    throw new Error("Invalid exceptions");
  selection.exceptions.forEach(text3);
  if (!Array.isArray(selection.sources) || !selection.sources.length || selection.sources.length > 20)
    throw new Error("Select 1\u201320 sources");
}
async function collect(selection) {
  validateSelection(selection);
  fields(selection, [
    "id",
    "expectedRevision",
    "reviewed",
    "aspect",
    "finding",
    "scope",
    "exceptions",
    "status",
    "sources",
    "selectionHash"
  ]);
  const sources2 = [];
  let total = 0;
  for (const source of selection.sources) {
    fields(source, [
      "project",
      "id",
      "revision",
      "label",
      "context",
      "evidence",
      "gapReason",
      "sha256"
    ]);
    id3(source.id);
    revision(source.revision);
    text3(source.label);
    text3(source.context);
    if (!Array.isArray(source.evidence) || source.evidence.length > 50)
      throw new Error("Invalid selected evidence");
    const project = directory(source.project);
    const path = join2(
      project,
      ".incline/insights",
      source.id,
      `${source.revision}.json`
    );
    let insight;
    let sourceHash;
    try {
      const raw = await bytes(path, 2e6);
      sourceHash = hash2(raw);
      insight = await readInsightRevision(project, source.id, source.revision);
      if (hash2(await bytes(path, 2e6)) !== sourceHash)
        throw new Error("Source insight changed during selection");
    } catch (error) {
      if (error.code !== "ENOENT" || !source.gapReason) throw error;
      text3(source.gapReason);
      if (source.evidence.length)
        throw new Error("Unavailable source cannot resolve selected evidence");
      sources2.push({
        id: source.id,
        revision: source.revision,
        label: source.label,
        context: source.context,
        gapReason: source.gapReason,
        evidence: []
      });
      continue;
    }
    if (source.sha256 !== void 0 && source.sha256 !== sourceHash)
      throw new Error("Source insight hash mismatch");
    if (!source.evidence.length)
      throw new Error(
        "Select at least one evidence event for each available source"
      );
    const evidence2 = [];
    const seen = /* @__PURE__ */ new Set();
    for (const ref of source.evidence) {
      fields(ref, ["batchId", "eventId", "role"]);
      id3(ref.batchId);
      id3(ref.eventId);
      if (!["supporting", "conflicting"].includes(ref.role))
        throw new Error("Select evidence role");
      const key2 = `${ref.batchId}/${ref.eventId}`;
      if (seen.has(key2)) throw new Error("Duplicate selected evidence");
      seen.add(key2);
      const original = insight[`${ref.role}Evidence`].find(
        (e) => e.batchId === ref.batchId && e.eventId === ref.eventId
      );
      if (!original)
        throw new Error(
          "Evidence must be linked to the selected source revision with its original role"
        );
      const base = join2(project, ".incline/feedback", ref.batchId);
      const raw = await bytes(join2(base, "record.json"), 2e6);
      if (hash2(raw) !== original.recordHash)
        throw new Error("Source evidence hash mismatch");
      const record = JSON.parse(raw);
      const matches2 = record.events?.filter((e) => e.id === ref.eventId);
      if (record.version !== 1 || record.id !== ref.batchId || matches2?.length !== 1 || !Array.isArray(record.artifacts))
        throw new Error("Invalid source evidence");
      const event = matches2[0];
      const selectedArtifacts = record.artifacts.filter(
        (a) => event.artifactIds?.includes(a.id)
      );
      validateBatch({
        id: record.id,
        mode: record.mode,
        coverage: record.coverage,
        events: [event],
        artifacts: selectedArtifacts.map(
          ({ snapshot: _snapshot, sha256: _sha256, ...original2 }) => original2
        )
      });
      if (typeof record.recordedAt !== "string" || Number.isNaN(Date.parse(record.recordedAt)))
        throw new Error("Invalid source evidence timestamp");
      const artifacts = [];
      for (const artifactId of new Set(event.artifactIds ?? [])) {
        const matches3 = record.artifacts.filter((a) => a.id === artifactId);
        if (matches3.length !== 1)
          throw new Error("Missing or ambiguous artifact");
        const artifact = matches3[0];
        const { path: originalPath, snapshot, ...metadata } = artifact;
        const saved = {
          ...metadata,
          ...originalPath ? { originalPath } : {}
        };
        if (snapshot) {
          if (!/^assets\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/.test(snapshot))
            throw new Error("Unsafe artifact path");
          try {
            const asset = await bytes(join2(base, snapshot), 8 * 1024 * 1024);
            if (hash2(asset) !== artifact.sha256)
              throw new Error("Source artifact hash mismatch");
            total += asset.length;
            if (total > 32 * 1024 * 1024)
              throw new Error("Selected assets exceed 32 MB");
            saved.availability = "snapshot-saved";
            saved.contentBase64 = asset.toString("base64");
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
            saved.availability = "snapshot-missing";
            saved.missingReason = "Source snapshot missing at selection time";
          }
        } else saved.availability = "unavailable";
        artifacts.push(saved);
      }
      evidence2.push({
        ...ref,
        recordHash: original.recordHash,
        event,
        coverage: record.coverage,
        mode: record.mode,
        recordedAt: record.recordedAt,
        artifacts
      });
    }
    const {
      revisionPath: _revisionPath,
      supportingEvidence: _supportingEvidence,
      conflictingEvidence: _conflictingEvidence,
      ...sourceFinding
    } = insight;
    sources2.push({
      id: source.id,
      revision: source.revision,
      label: source.label,
      context: source.context,
      sha256: sourceHash,
      finding: sourceFinding,
      evidence: evidence2
    });
  }
  return {
    version: 1,
    id: selection.id,
    revision: selection.expectedRevision + 1,
    aspect: selection.aspect,
    finding: selection.finding,
    scope: selection.scope,
    exceptions: selection.exceptions,
    status: selection.status,
    reviewed: selection.reviewed,
    sources: sources2
  };
}
function compactSnapshot(snapshot) {
  return {
    ...snapshot,
    sources: snapshot.sources.map((source) => ({
      ...source,
      evidence: source.evidence.map((event) => ({
        ...event,
        artifacts: event.artifacts.map(({ contentBase64, ...artifact }) => ({
          ...artifact,
          bytes: contentBase64 ? Buffer.from(contentBase64, "base64").length : 0
        }))
      }))
    }))
  };
}
var selectionHash = (snapshot) => hash2(JSON.stringify({ ...snapshot, reviewed: true }));
async function previewPersonalInsight(directoryPath, selection) {
  directory(directoryPath);
  const snapshot = await collect(selection);
  const compact2 = compactSnapshot(snapshot);
  return {
    operation: "preview",
    snapshot: compact2,
    selectionHash: selectionHash(snapshot),
    copiedAssets: compact2.sources.flatMap(
      (s) => s.evidence.flatMap(
        (e) => e.artifacts.map((a) => ({
          source: s.label,
          batchId: e.batchId,
          eventId: e.eventId,
          ...a
        }))
      )
    )
  };
}
async function publish(path, value) {
  await safe(path);
  await mkdir2(resolve(path, ".."), { recursive: true });
  const temp = join2(resolve(path, ".."), `.pending-${randomUUID2()}`);
  try {
    const content = JSON.stringify(value, null, 2) + "\n";
    if (Buffer.byteLength(content) > 48 * 1024 * 1024)
      throw new Error("Personal snapshot exceeds 48 MB");
    await writeFile2(temp, content, { flag: "wx", mode: 384 });
    await link2(temp, path);
  } finally {
    await unlink2(temp).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
async function revisions(base) {
  await safe(base);
  try {
    return (await readdir2(base)).filter((n) => /^[1-9][0-9]*\.json$/.test(n)).map((n) => Number(n.slice(0, -5)));
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}
async function savePersonalInsight(directoryPath, selection) {
  if (selection?.reviewed !== true)
    throw new Error("Selection must be explicitly human-reviewed");
  const base = directory(directoryPath);
  const collected = await collect(selection);
  if (selection.selectionHash !== void 0 && selection.selectionHash !== selectionHash(collected))
    throw new Error("Selection changed since preview");
  const current = Math.max(0, ...await revisions(join2(base, selection.id)));
  if (current !== selection.expectedRevision)
    throw new Error("Stale personal insight revision");
  const snapshot = {
    ...collected,
    recordedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  validateSnapshot(snapshot);
  const snapshotPath = join2(base, snapshot.id, `${snapshot.revision}.json`);
  await publish(snapshotPath, {
    snapshot,
    sha256: hash2(JSON.stringify(snapshot))
  });
  return { id: snapshot.id, revision: snapshot.revision, snapshotPath };
}
function validateSnapshot(s) {
  fields(s, [
    "version",
    "id",
    "revision",
    "aspect",
    "finding",
    "scope",
    "exceptions",
    "status",
    "reviewed",
    "sources",
    "recordedAt"
  ]);
  validateSelection({ ...s, expectedRevision: s.revision - 1 });
  const timestamp = (value) => {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
      throw new Error("Invalid personal snapshot timestamp");
  };
  timestamp(s.recordedAt);
  for (const source of s.sources) {
    fields(source, [
      "id",
      "revision",
      "label",
      "context",
      "gapReason",
      "evidence",
      "sha256",
      "finding"
    ]);
    id3(source.id);
    revision(source.revision);
    text3(source.label);
    text3(source.context);
    if (!Array.isArray(source.evidence) || source.evidence.length > 50)
      throw new Error("Invalid personal snapshot evidence");
    if (source.gapReason !== void 0) {
      text3(source.gapReason);
      if (source.evidence.length || source.finding || source.sha256)
        throw new Error("Invalid personal source gap");
      continue;
    }
    if (!digestPattern.test(source.sha256) || !source.evidence.length)
      throw new Error("Invalid source attribution");
    const f = source.finding;
    fields(f, [
      "version",
      "id",
      "aspect",
      "finding",
      "scope",
      "status",
      "qualifications",
      "openQuestions",
      "expectedRevision",
      "revision",
      "recordedAt"
    ]);
    if (f.version !== 1 || f.id !== source.id || f.revision !== source.revision || f.expectedRevision !== f.revision - 1 || !["tentative", "explicit", "superseded"].includes(f.status))
      throw new Error("Invalid source finding");
    for (const key2 of ["aspect", "finding", "scope"]) text3(f[key2]);
    for (const key2 of ["qualifications", "openQuestions"]) {
      if (!Array.isArray(f[key2]) || f[key2].length > 20)
        throw new Error("Invalid source finding notes");
      f[key2].forEach(text3);
    }
    timestamp(f.recordedAt);
    const seen = /* @__PURE__ */ new Set();
    for (const e of source.evidence) {
      fields(e, [
        "batchId",
        "eventId",
        "role",
        "recordHash",
        "event",
        "coverage",
        "mode",
        "recordedAt",
        "artifacts"
      ]);
      id3(e.batchId);
      id3(e.eventId);
      timestamp(e.recordedAt);
      const key2 = `${e.batchId}/${e.eventId}`;
      if (seen.has(key2) || !["supporting", "conflicting"].includes(e.role) || !digestPattern.test(e.recordHash) || e.event?.id !== e.eventId || !Array.isArray(e.artifacts))
        throw new Error("Invalid personal evidence bundle");
      seen.add(key2);
      for (const a of e.artifacts) {
        fields(a, [
          "id",
          "locator",
          "missingReason",
          "sha256",
          "originalPath",
          "availability",
          "contentBase64"
        ]);
        if (!["snapshot-saved", "snapshot-missing", "unavailable"].includes(
          a.availability
        ))
          throw new Error("Invalid personal asset availability");
        if (a.availability === "snapshot-saved") {
          if (typeof a.contentBase64 !== "string" || !digestPattern.test(a.sha256))
            throw new Error("Invalid personal asset content");
          const content = Buffer.from(a.contentBase64, "base64");
          if (content.toString("base64") !== a.contentBase64 || hash2(content) !== a.sha256)
            throw new Error("Personal asset hash mismatch");
        } else if (a.contentBase64 !== void 0)
          throw new Error("Unavailable personal asset has content");
        if (a.availability === "snapshot-missing" && (!digestPattern.test(a.sha256) || !a.missingReason))
          throw new Error("Invalid missing snapshot metadata");
      }
      validateBatch({
        id: e.batchId,
        mode: e.mode,
        coverage: e.coverage,
        events: [e.event],
        artifacts: e.artifacts.map((a) => ({
          id: a.id,
          ...a.locator ? { locator: a.locator } : {},
          ...a.originalPath ? { path: a.originalPath } : { missingReason: a.missingReason }
        }))
      });
      if (e.artifacts.some((a) => !e.event.artifactIds.includes(a.id)))
        throw new Error("Unselected personal asset");
    }
  }
}
async function readPersonalInsight(directoryPath, insightId, requestedRevision) {
  const base = directory(directoryPath);
  id3(insightId);
  const rev = requestedRevision ?? Math.max(0, ...await revisions(join2(base, insightId)));
  revision(rev);
  const envelope = JSON.parse(
    await bytes(join2(base, insightId, `${rev}.json`))
  );
  fields(envelope, ["snapshot", "sha256"]);
  const s = envelope.snapshot;
  if (!s || s.version !== 1 || s.id !== insightId || s.revision !== rev || s.reviewed !== true || hash2(JSON.stringify(s)) !== envelope.sha256)
    throw new Error("Personal snapshot integrity check failed");
  validateSnapshot(s);
  return s;
}
async function listPersonalInsights(directoryPath) {
  const base = directory(directoryPath);
  await safe(base);
  let names2;
  try {
    names2 = await readdir2(base);
  } catch (e) {
    if (e.code === "ENOENT") return { insights: [] };
    throw e;
  }
  const insights = [];
  for (const name of names2.sort()) {
    if (name.startsWith(".pending-")) continue;
    id3(name);
    if (!(await revisions(join2(base, name))).length) continue;
    const s = await readPersonalInsight(base, name);
    insights.push({
      id: s.id,
      revision: s.revision,
      finding: s.finding,
      scope: s.scope,
      exceptions: s.exceptions,
      status: s.status,
      sources: s.sources.map(({ id: id5, revision: revision2, label, context, gapReason }) => ({
        id: id5,
        revision: revision2,
        label,
        context,
        ...gapReason ? { gapReason } : {}
      }))
    });
  }
  return { insights };
}
async function importPersonalInsight(directoryPath, insightId, project, { revision: selectedRevision, relevance } = {}) {
  text3(relevance);
  const snapshot = await readPersonalInsight(
    directoryPath,
    insightId,
    selectedRevision
  );
  await safe(project);
  if (!(await lstat(project)).isDirectory())
    throw new Error("Project must be a directory");
  const draft = {
    version: 1,
    id: snapshot.id,
    status: "tentative",
    aspect: snapshot.aspect,
    finding: snapshot.finding,
    scope: snapshot.scope,
    exceptions: snapshot.exceptions,
    relevance,
    requiresProjectReview: true,
    precedence: "Project-specific instructions take precedence within scope; this draft is not an explicit instruction.",
    provenance: {
      personalId: snapshot.id,
      revision: snapshot.revision,
      sha256: hash2(JSON.stringify(snapshot)),
      importedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    snapshot
  };
  const draftPath = join2(
    project,
    ".incline/drafts/personal",
    snapshot.id,
    `${snapshot.revision}.json`
  );
  await publish(draftPath, draft);
  const { snapshot: _snapshot, ...summary } = draft;
  return { draftPath, draft: summary, provenance: draft.provenance };
}

// local/options.mjs
import { realpath, stat as stat2 } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join as join3, resolve as resolve2 } from "node:path";
async function projectRoot(cwd) {
  const start = await realpath(cwd);
  let current = start;
  while (true) {
    try {
      const marker = await stat2(join3(current, ".git"));
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
      options.set(flag, resolve2(cwd, value));
    }
  }
  if (options.has("--local-only") && (options.has("--library-dir") || options.has("--personal-dir") || options.has("--prompt-library-dir")))
    throw new Error("Choose --local-only or a shared directory, not both.");
  return {
    project: options.get("--project") ?? await projectRoot(cwd),
    personalDirectory: options.has("--local-only") ? null : options.get("--personal-dir") ?? join3(homedir(), ".incline", "personal-insights"),
    libraryDirectory: options.has("--local-only") ? null : options.get("--library-dir") ?? join3(homedir(), ".incline", "library"),
    promptLibraryDirectory: options.has("--local-only") ? null : options.get("--prompt-library-dir") ?? join3(homedir(), ".incline", "prompt-library"),
    ...options.has("--input") ? { input: options.get("--input") } : {}
  };
}

// local/reviews.mjs
import { readdir as readdir3, readFile as readFile3, lstat as lstat2, mkdir as mkdir3, writeFile as writeFile3, link as link3, unlink as unlink3 } from "node:fs/promises";
import { join as join4 } from "node:path";
import { createHash as createHash3, randomUUID as randomUUID3 } from "node:crypto";
var hash3 = (bytes2) => createHash3("sha256").update(bytes2).digest("hex");
var key = (ref) => `${ref.batchId}/${ref.eventId}/${ref.recordHash}`;
function check(ok, message) {
  if (!ok) throw new Error(`Invalid review: ${message}`);
}
function id4(value) {
  check(typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value), "ID");
}
function fields2(value, names2) {
  check(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((k) => names2.includes(k)), "fields");
}
function refs(values) {
  check(Array.isArray(values) && values.length > 0 && values.length <= 100, "events");
  for (const ref of values) {
    fields2(ref, ["batchId", "eventId", "recordHash"]);
    id4(ref.batchId);
    id4(ref.eventId);
    check(typeof ref.recordHash === "string" && /^[a-f0-9]{64}$/.test(ref.recordHash), "hash");
  }
  check(new Set(values.map(key)).size === values.length, "duplicate events");
}
function validate2(data) {
  fields2(data, ["id", "events", "outcomes"]);
  id4(data.id);
  refs(data.events);
  check(Array.isArray(data.outcomes) && data.outcomes.length > 0 && data.outcomes.length <= 100, "outcomes");
  const covered = [];
  for (const outcome of data.outcomes) {
    fields2(outcome, ["eventRefs", "action", "reason", "insightRevisions"]);
    refs(outcome.eventRefs);
    check(["updated", "no-change", "deferred"].includes(outcome.action), "action");
    check(typeof outcome.reason === "string" && outcome.reason.trim() && outcome.reason.length <= 1e4, "reason");
    check(Array.isArray(outcome.insightRevisions) && outcome.insightRevisions.length <= 100, "insight revisions");
    check(outcome.action !== "updated" || outcome.insightRevisions.length > 0, "updated requires revision");
    for (const ref of outcome.insightRevisions) {
      fields2(ref, ["id", "revision"]);
      id4(ref.id);
      check(Number.isSafeInteger(ref.revision) && ref.revision > 0, "revision");
    }
    covered.push(...outcome.eventRefs.map(key));
  }
  check(covered.length === data.events.length && new Set(covered).size === covered.length && data.events.every((ref) => covered.includes(key(ref))), "each event must be covered exactly once");
}
async function names(path) {
  try {
    check((await lstat2(path)).isDirectory(), "directory must not be a symlink");
    return (await readdir3(path)).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
async function json(path) {
  const info = await lstat2(path);
  check(info.isFile() && info.size <= 2e6, "file or size");
  const bytes2 = await readFile3(path);
  return { data: JSON.parse(bytes2), recordHash: hash3(bytes2) };
}
async function evidence(project) {
  await names(join4(project, ".incline"));
  const directory3 = join4(project, ".incline/feedback");
  const events = [], warnings = [];
  for (const batchId of await names(directory3)) {
    if (batchId.startsWith(".pending-")) continue;
    id4(batchId);
    const base = join4(directory3, batchId);
    check((await lstat2(base)).isDirectory(), "feedback directory");
    let loaded;
    try {
      loaded = await json(join4(base, "record.json"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      warnings.push(`Unsupported legacy feedback folder: ${batchId}`);
      continue;
    }
    const { data, recordHash } = loaded;
    check(data.version === 1 && data.id === batchId && typeof data.recordedAt === "string" && !Number.isNaN(Date.parse(data.recordedAt)), "record metadata");
    validateBatch({
      id: data.id,
      mode: data.mode,
      coverage: data.coverage,
      events: data.events,
      artifacts: data.artifacts.map(({ snapshot, sha256, ...artifact }) => {
        if (artifact.path) check(typeof snapshot === "string" && /^assets\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/.test(snapshot) && /^[a-f0-9]{64}$/.test(sha256), "snapshot metadata");
        return artifact;
      })
    });
    events.push(...data.events.map((event) => ({ batchId, eventId: event.id, recordHash })));
  }
  return { events, warnings };
}
async function receipt(path) {
  const { data } = await json(path);
  const { version, recordedAt, inputHash, ...input } = data;
  validate2(input);
  check(version === 1 && typeof recordedAt === "string" && !Number.isNaN(Date.parse(recordedAt)) && inputHash === hash3(JSON.stringify(input)), "receipt metadata");
  return input;
}
async function listPendingEvidence(project) {
  const { events, warnings } = await evidence(project);
  const completed = /* @__PURE__ */ new Set();
  const directory3 = join4(project, ".incline/reviews");
  for (const name of await names(directory3)) {
    if (name.startsWith(".pending-")) continue;
    check(name.endsWith(".json"), "receipt filename");
    const data = await receipt(join4(directory3, name));
    check(name === `${data.id}.json`, "receipt ID mismatch");
    for (const outcome of data.outcomes) if (outcome.action !== "deferred") outcome.eventRefs.forEach((ref) => completed.add(key(ref)));
  }
  return { pending: events.filter((ref) => !completed.has(key(ref))), warnings };
}
async function saveReview(project, data) {
  validate2(data);
  check((await lstat2(project)).isDirectory(), "project directory");
  const directory3 = join4(project, ".incline/reviews");
  await names(join4(project, ".incline"));
  await names(directory3);
  const reviewPath = join4(directory3, `${data.id}.json`);
  const replay = async () => {
    const existing = await receipt(reviewPath);
    check(JSON.stringify(existing) === JSON.stringify(data), "conflicting receipt ID");
    return { reviewPath, status: "already-recorded" };
  };
  try {
    return await replay();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const available = new Set((await evidence(project)).events.map(key));
  check(data.events.every((ref) => available.has(key(ref))), "missing or changed source event");
  for (const outcome of data.outcomes) {
    const insights = await Promise.all(outcome.insightRevisions.map((ref) => readInsightRevision(project, ref.id, ref.revision)));
    if (outcome.action === "updated") {
      const linked = new Set(insights.flatMap((i) => [...i.supportingEvidence, ...i.conflictingEvidence]).map(key));
      check(outcome.eventRefs.every((ref) => linked.has(key(ref))), "revision must link each updated event and source hash");
    }
  }
  await mkdir3(join4(project, ".incline"), { recursive: true });
  check((await lstat2(join4(project, ".incline"))).isDirectory(), "project memory directory");
  await mkdir3(directory3, { recursive: true });
  check((await lstat2(directory3)).isDirectory(), "review directory");
  const temp = join4(directory3, `.pending-${randomUUID3()}`);
  try {
    await writeFile3(temp, JSON.stringify({ ...data, version: 1, recordedAt: (/* @__PURE__ */ new Date()).toISOString(), inputHash: hash3(JSON.stringify(data)) }, null, 2) + "\n", { flag: "wx", mode: 384 });
    try {
      await link3(temp, reviewPath);
    } catch (error) {
      if (error.code === "EEXIST") return await replay();
      throw error;
    }
  } finally {
    await unlink3(temp).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return { reviewPath, status: "saved" };
}

// local/knowledge.mjs
import {
  mkdir as mkdir4,
  readFile as readFile4,
  writeFile as writeFile4,
  readdir as readdir4,
  lstat as lstat3,
  rename,
  rm
} from "node:fs/promises";
import { join as join5, resolve as resolve3, relative as relative2 } from "node:path";
import { createHash as createHash4, randomUUID as randomUUID4 } from "node:crypto";
var hash4 = (bytes2) => createHash4("sha256").update(bytes2).digest("hex");
var safeId = /^[a-zA-Z0-9_-]{1,80}$/;
var safeGeneration = /^[a-f0-9-]{36}$/;
var digest = /^[a-f0-9]{64}$/;
var compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var json2 = (value) => JSON.stringify(value, null, 2) + "\n";
var tokens = (value) => [
  ...new Set(
    value.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  )
];
var escape = (value) => value.replace(/[\\`*_{}[\]()#>!|<]/g, "\\$&").replace(/\r?\n/g, " ");
async function manifest(project) {
  const root = join5(project, ".incline/insights");
  let ids;
  try {
    ids = await readdir4(root);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const result = [];
  for (const id5 of ids.sort(compare)) {
    if (!safeId.test(id5)) throw new Error("Invalid insight ID in source");
    const directory3 = join5(root, id5);
    if (!(await lstat3(directory3)).isDirectory())
      throw new Error("Invalid insight source directory");
    const revisions2 = (await readdir4(directory3)).filter((name) => /^[1-9][0-9]*\.json$/.test(name)).map((name) => Number(name.slice(0, -5)));
    if (!revisions2.length) continue;
    const revision2 = Math.max(...revisions2);
    if (!Number.isSafeInteger(revision2))
      throw new Error("Invalid insight revision");
    const info = await lstat3(join5(directory3, `${revision2}.json`), {
      bigint: true
    });
    if (!info.isFile()) throw new Error("Invalid insight source file");
    result.push({
      id: id5,
      revision: revision2,
      size: String(info.size),
      mtimeNs: String(info.mtimeNs),
      ctimeNs: String(info.ctimeNs)
    });
  }
  return result;
}
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var topicName = (aspect) => hash4(aspect) + ".md";
var revisionRelative = (entry) => `.incline/insights/${entry.id}/${entry.revision}.json`;
function compact(entry) {
  const {
    id: id5,
    revision: revision2,
    aspect,
    scope,
    finding,
    status,
    qualifications,
    openQuestions,
    supportingEvidence,
    conflictingEvidence
  } = entry;
  return {
    id: id5,
    revision: revision2,
    aspect,
    scope,
    finding,
    status,
    qualifications,
    openQuestions,
    supportingEvidence,
    conflictingEvidence,
    revisionPath: revisionRelative(entry),
    topicPath: `topics/${topicName(aspect)}`
  };
}
async function sources(project, before) {
  const { insights } = await readInsights(project);
  if (!same(before, await manifest(project)))
    throw new Error("Insight sources changed during read; retry");
  return insights.filter((entry) => entry.status !== "superseded").map(compact).sort((a, b) => compare(a.id, b.id));
}
function sourceLink(from, project, path) {
  return relative2(from, join5(project, path)).split("\\").join("/");
}
function topicMarkdown(project, directory3, aspect, entries) {
  const lines = [
    `# ${escape(aspect)}`,
    "",
    "Generated view. Edit authoritative insight revisions, then rebuild. These findings are interpretations with scoped evidence; repeated generated views are not new evidence.",
    ""
  ];
  for (const entry of entries) {
    lines.push(
      `## ${escape(entry.id)}`,
      "",
      escape(entry.finding),
      "",
      `Scope: ${escape(entry.scope)}. Status: ${entry.status}. Revision: ${entry.revision}.`,
      "",
      `[Authoritative revision](${sourceLink(directory3, project, entry.revisionPath)})`,
      ""
    );
    for (const [label, values] of [
      ["Qualifications", entry.qualifications],
      ["Open questions", entry.openQuestions]
    ]) {
      lines.push(
        `### ${label}`,
        "",
        ...values.length ? values.map((text4) => `- ${escape(text4)}`) : ["None recorded."],
        ""
      );
    }
    for (const [label, refs2] of [
      ["Supporting evidence", entry.supportingEvidence],
      ["Conflicting evidence", entry.conflictingEvidence]
    ]) {
      lines.push(`### ${label}`, "");
      for (const ref of refs2)
        lines.push(
          `- [${ref.batchId}/${ref.eventId}](${sourceLink(directory3, project, `.incline/feedback/${ref.batchId}/record.json`)}) \u2014 event ID: ${ref.eventId}; recorded SHA-256: ${ref.recordHash}`
        );
      if (!refs2.length) lines.push("None recorded.");
      lines.push("");
    }
    lines.push(
      `Inspect exact events and current artifact availability with: \`insights.mjs evidence --id ${entry.id} --project <project>\`. A link does not establish that an image exists or has been inspected.`,
      ""
    );
  }
  return lines.join("\n") + "\n";
}
async function directory2(path) {
  await mkdir4(path, { recursive: true });
  if (!(await lstat3(path)).isDirectory())
    throw new Error("Knowledge output must be a real directory");
}
async function rebuildKnowledge(project) {
  project = resolve3(project);
  if (!(await lstat3(project)).isDirectory())
    throw new Error("Project must be a directory");
  const before = await manifest(project);
  const entries = await sources(project, before);
  const root = join5(project, ".incline/knowledge");
  await directory2(join5(project, ".incline"));
  await directory2(root);
  await directory2(join5(root, "generations"));
  const generation = randomUUID4();
  const output = join5(root, "generations", generation);
  const pointerTemp = join5(root, `.pending-${generation}`);
  let published = false;
  try {
    await mkdir4(output);
    await mkdir4(join5(output, "topics"));
    const aspects = [...new Set(entries.map((entry) => entry.aspect))].sort(
      compare
    );
    const topicHashes = {};
    for (const aspect of aspects) {
      const path = `topics/${topicName(aspect)}`;
      const content = topicMarkdown(
        project,
        join5(output, "topics"),
        aspect,
        entries.filter((entry) => entry.aspect === aspect)
      );
      await writeFile4(join5(output, path), content, { flag: "wx", mode: 384 });
      topicHashes[path] = hash4(content);
    }
    const indexMarkdown = [
      "# Incline knowledge",
      "",
      "Generated navigation for current, non-superseded insights. Evidence and insight revisions remain authoritative. Freshness of this index does not mean pending feedback has been reviewed.",
      "",
      ...aspects.map(
        (aspect) => `- [${escape(aspect)}](topics/${topicName(aspect)})`
      ),
      ""
    ].join("\n");
    await writeFile4(join5(output, "index.md"), indexMarkdown, {
      flag: "wx",
      mode: 384
    });
    const index = {
      version: 1,
      manifest: before,
      entries,
      topicHashes,
      indexMarkdownHash: hash4(indexMarkdown)
    };
    const bytes2 = json2(index);
    await writeFile4(join5(output, "index.json"), bytes2, {
      flag: "wx",
      mode: 384
    });
    if (!same(before, await manifest(project)))
      throw new Error("Insight sources changed during rebuild; retry");
    await writeFile4(
      pointerTemp,
      json2({ version: 1, generation, indexHash: hash4(bytes2) }),
      { flag: "wx", mode: 384 }
    );
    await rename(pointerTemp, join5(root, "current.json"));
    published = true;
    return {
      status: "rebuilt",
      indexPath: join5(output, "index.json"),
      indexMarkdownPath: join5(output, "index.md"),
      topicPaths: aspects.map(
        (aspect) => join5(output, "topics", topicName(aspect))
      )
    };
  } finally {
    await rm(pointerTemp, { force: true });
    if (!published) await rm(output, { recursive: true, force: true });
  }
}
async function checkedRead(path) {
  const info = await lstat3(path);
  if (!info.isFile() || info.size > 2e7)
    throw new Error("Invalid knowledge cache file");
  return readFile4(path);
}
async function cache(project, currentManifest) {
  const root = join5(project, ".incline/knowledge");
  let pointerBytes;
  try {
    pointerBytes = await checkedRead(join5(root, "current.json"));
  } catch (error) {
    if (error.code === "ENOENT") return { freshness: "missing" };
    return { freshness: "corrupt" };
  }
  try {
    const pointer = JSON.parse(pointerBytes);
    if (pointer.version !== 1 || !safeGeneration.test(pointer.generation) || !digest.test(pointer.indexHash))
      throw new Error("Invalid pointer");
    const output = join5(root, "generations", pointer.generation);
    if (!(await lstat3(output)).isDirectory())
      throw new Error("Invalid generation");
    const bytes2 = await checkedRead(join5(output, "index.json"));
    if (hash4(bytes2) !== pointer.indexHash) throw new Error("Changed index");
    const index = JSON.parse(bytes2);
    if (index.version !== 1 || !Array.isArray(index.entries) || !Array.isArray(index.manifest) || !index.topicHashes || !digest.test(index.indexMarkdownHash))
      throw new Error("Invalid index");
    if (!same(index.manifest, currentManifest)) return { freshness: "stale" };
    if (hash4(await checkedRead(join5(output, "index.md"))) !== index.indexMarkdownHash)
      throw new Error("Changed navigation");
    for (const entry of index.entries) {
      if (!safeId.test(entry.id) || !Number.isSafeInteger(entry.revision) || entry.revision < 1 || typeof entry.aspect !== "string" || typeof entry.scope !== "string" || typeof entry.finding !== "string" || !["tentative", "explicit"].includes(entry.status) || !Array.isArray(entry.qualifications) || !Array.isArray(entry.openQuestions) || !Array.isArray(entry.supportingEvidence) || !Array.isArray(entry.conflictingEvidence) || entry.revisionPath !== revisionRelative(entry) || entry.topicPath !== `topics/${topicName(entry.aspect)}` || !digest.test(index.topicHashes[entry.topicPath]))
        throw new Error("Invalid indexed insight");
    }
    return { freshness: "current", index, output };
  } catch {
    return { freshness: "corrupt" };
  }
}
function matches(entries, options) {
  const terms = tokens(options.query);
  if (options.query.trim() && !terms.length) return [];
  return entries.filter(
    (entry) => (options.aspect === void 0 || entry.aspect === options.aspect) && (options.scope === void 0 || entry.scope === options.scope)
  ).map((entry) => {
    const fields3 = [
      "aspect",
      "scope",
      "finding",
      "qualifications",
      "openQuestions"
    ];
    const sets = Object.fromEntries(
      fields3.map((field) => [
        field,
        new Set(
          tokens(
            Array.isArray(entry[field]) ? entry[field].join(" ") : entry[field]
          )
        )
      ])
    );
    const matched = terms.filter(
      (term) => fields3.some((field) => sets[field].has(term))
    );
    const matchReasons = [];
    if (options.aspect !== void 0)
      matchReasons.push("Exact aspect filter");
    if (options.scope !== void 0) matchReasons.push("Exact scope filter");
    for (const field of fields3) {
      const hits = matched.filter((term) => sets[field].has(term));
      if (hits.length) matchReasons.push(`${field}: ${hits.join(", ")}`);
    }
    return {
      ...entry,
      matchReasons,
      matchStrength: terms.length ? matched.length === terms.length ? "all-tokens" : "partial" : "browse",
      matchedTokens: matched,
      requestedTokens: terms,
      score: matched.length
    };
  }).filter((entry) => !terms.length || entry.score > 0).sort((a, b) => b.score - a.score || compare(a.id, b.id));
}
async function queryKnowledge(project, { query = "", aspect, scope, limit = 5 } = {}) {
  if (typeof query !== "string" || query.length > 2e3 || aspect !== void 0 && typeof aspect !== "string" || scope !== void 0 && typeof scope !== "string" || !Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new Error("Invalid knowledge query; limit must be 1\u201320");
  project = resolve3(project);
  const before = await manifest(project);
  let loaded = await cache(project, before);
  let ranked;
  if (loaded.freshness === "current") {
    ranked = matches(loaded.index.entries, { query, aspect, scope });
    try {
      for (const topicPath of new Set(
        ranked.slice(0, limit).map((entry) => entry.topicPath)
      )) {
        if (hash4(await checkedRead(join5(loaded.output, topicPath))) !== loaded.index.topicHashes[topicPath])
          throw new Error("Changed topic");
      }
    } catch {
      loaded = { freshness: "corrupt" };
    }
  }
  if (loaded.freshness !== "current")
    ranked = matches(await sources(project, before), { query, aspect, scope });
  if (!same(before, await manifest(project)))
    throw new Error("Insight sources changed during query; retry");
  return {
    freshness: loaded.freshness,
    source: loaded.freshness === "current" ? "index" : "insights",
    warnings: loaded.freshness === "current" ? [] : [
      `Knowledge cache is ${loaded.freshness}; using authoritative insights. Run rebuild to refresh generated views.`
    ],
    totalMatches: ranked.length,
    results: ranked.slice(0, limit).map(({ topicPath, ...entry }) => ({
      ...entry,
      revisionPath: join5(project, entry.revisionPath),
      ...loaded.freshness === "current" ? { topicPath: join5(loaded.output, topicPath) } : {}
    }))
  };
}

// local/insights-cli.mjs
try {
  const [command, ...args] = process.argv.slice(2);
  if (["--help", "-h"].includes(command))
    console.log(
      "Incline insights\n  insights.mjs pending [--project <directory>]\n  insights.mjs review --input <receipt.json> [--project <directory>]\n  insights.mjs save --input <insight.json> [--project <directory>]\n  insights.mjs read [--id <id>] [--aspect <topic>] [--project <directory>]\n  insights.mjs evidence --id <id> [--project <directory>]\n  insights.mjs rebuild [--project <directory>]\n  insights.mjs query [--query <text>] [--aspect <topic>] [--scope <exact scope>] [--limit <1-20>] [--project <directory>]\n  insights.mjs personal-preview --input <selection.json> [--personal-dir <directory>]\n  insights.mjs personal-save --input <selection.json> [--personal-dir <directory>]\n  insights.mjs personal-list [--personal-dir <directory>]\n  insights.mjs personal-import --id <id> --relevance <brief relevance> [--revision <number>] [--project <directory>] [--personal-dir <directory>]\nPersonal operations are explicit; --local-only disables them. Personal imports are tentative drafts.\nAgent-authored, project-local findings linked to original feedback. Rebuild creates derived topic views; query is read-only and reports freshness. No automatic inference."
    );
  else {
    if (![
      "save",
      "read",
      "evidence",
      "rebuild",
      "query",
      "pending",
      "review",
      "personal-preview",
      "personal-save",
      "personal-list",
      "personal-import"
    ].includes(command))
      throw new Error(
        "Choose save, read, evidence, rebuild, query, pending or review"
      );
    const filters = {};
    const optionsArgs = [];
    for (let i = 0; i < args.length; i++) {
      if ([
        "--id",
        "--aspect",
        "--query",
        "--scope",
        "--limit",
        "--revision",
        "--relevance"
      ].includes(args[i])) {
        const key2 = args[i].slice(2);
        if (filters[key2] || !args[i + 1] || args[i + 1].startsWith("--"))
          throw new Error("Invalid filter");
        filters[key2] = args[++i];
      } else optionsArgs.push(args[i]);
    }
    if (optionsArgs.includes("--library-dir"))
      throw new Error(
        "Personal insights use --personal-dir, independently of the reference library"
      );
    if (!command.startsWith("personal-") && optionsArgs.includes("--personal-dir"))
      throw new Error("Use --personal-dir only with personal operations");
    const options = await resolveOptions(optionsArgs);
    const allowedFilters = {
      "personal-preview": [],
      "personal-save": [],
      "personal-list": [],
      "personal-import": ["id", "revision", "relevance"],
      save: [],
      pending: [],
      review: [],
      read: ["id", "aspect"],
      evidence: ["id"],
      rebuild: [],
      query: ["query", "aspect", "scope", "limit"]
    };
    if (Object.keys(filters).some((key2) => !allowedFilters[command].includes(key2)))
      throw new Error(`Unsupported filter for ${command}`);
    if (filters.limit !== void 0) {
      if (!/^(?:[1-9]|1[0-9]|20)$/.test(filters.limit))
        throw new Error("limit must be an integer from 1 to 20");
      filters.limit = Number(filters.limit);
    }
    let result;
    if (command.startsWith("personal-") && !options.personalDirectory)
      throw new Error("Personal operations are disabled by --local-only");
    if (["personal-preview", "personal-save"].includes(command)) {
      if (!options.input)
        throw new Error("Personal preview/save requires --input");
      const info = await stat3(options.input);
      if (!info.isFile() || info.size > 1e6)
        throw new Error("Invalid input file");
      const selection = JSON.parse(await readFile5(options.input, "utf8"));
      result = await (command === "personal-preview" ? previewPersonalInsight : savePersonalInsight)(options.personalDirectory, selection);
    } else if (command === "personal-list") {
      if (options.input) throw new Error("Personal list does not accept input");
      result = await listPersonalInsights(options.personalDirectory);
    } else if (command === "personal-import") {
      if (options.input || !filters.id || !filters.relevance)
        throw new Error("Personal import requires --id and --relevance");
      if (filters.revision !== void 0 && !/^[1-9][0-9]*$/.test(filters.revision))
        throw new Error("Invalid revision");
      result = await importPersonalInsight(
        options.personalDirectory,
        filters.id,
        options.project,
        {
          relevance: filters.relevance,
          ...filters.revision ? { revision: Number(filters.revision) } : {}
        }
      );
    } else if (command === "save" || command === "review") {
      if (!options.input || Object.keys(filters).length)
        throw new Error(`${command} requires input and no filters`);
      const info = await stat3(options.input);
      if (!info.isFile() || info.size > 1e6)
        throw new Error("Invalid input file");
      result = await (command === "review" ? saveReview : saveInsight)(
        options.project,
        JSON.parse(await readFile5(options.input, "utf8"))
      );
    } else {
      if (options.input) throw new Error("Only save and review accept input");
      if (command === "pending")
        result = await listPendingEvidence(options.project);
      else if (command === "rebuild")
        result = await rebuildKnowledge(options.project);
      else if (command === "query")
        result = await queryKnowledge(options.project, filters);
      else if (command === "evidence") {
        if (!filters.id || filters.aspect)
          throw new Error("evidence requires only --id");
        result = await insightEvidence(options.project, filters.id);
      } else result = await readInsights(options.project, filters);
    }
    console.log(JSON.stringify(result));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
