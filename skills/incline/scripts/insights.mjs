// local/insights-cli.mjs
import { readFile as readFile3, stat as stat3 } from "node:fs/promises";

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
    if (!["--project", "--input", "--library-dir", "--local-only"].includes(
      flag
    ) || options.has(flag))
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
  if (options.has("--local-only") && options.has("--library-dir"))
    throw new Error("Choose --local-only or --library-dir, not both.");
  return {
    project: options.get("--project") ?? await projectRoot(cwd),
    libraryDirectory: options.has("--local-only") ? null : options.get("--library-dir") ?? join(homedir(), ".incline", "library"),
    ...options.has("--input") ? { input: options.get("--input") } : {}
  };
}

// local/insights.mjs
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  link,
  unlink,
  stat as stat2
} from "node:fs/promises";
import { join as join2 } from "node:path";
import { createHash, randomUUID } from "node:crypto";
var hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
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
  for (const key of ["aspect", "finding", "scope"]) text(data[key]);
  if (!["tentative", "explicit", "superseded"].includes(data.status))
    throw new Error("Invalid insight status");
  if (!Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0)
    throw new Error("Invalid expected revision");
  for (const key of ["qualifications", "openQuestions"]) {
    if (!Array.isArray(data[key]) || data[key].length > 20)
      throw new Error("Invalid insight notes");
    data[key].forEach(text);
  }
  for (const key of ["supportingEvidence", "conflictingEvidence"]) {
    if (!Array.isArray(data[key]) || data[key].length > 50)
      throw new Error("Invalid evidence links");
    for (const ref of data[key]) {
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
  const info = await stat2(path);
  if (!info.isFile() || info.size > 2e6)
    throw new Error("Invalid or oversized evidence file");
  const raw = await readFile(path);
  return { data: JSON.parse(raw.toString("utf8")), hash: hash(raw) };
}
async function resolveEvidence(project, ref, inspectArtifacts = false) {
  id(ref.batchId);
  id(ref.eventId);
  const base = join2(project, ".incline/feedback", ref.batchId);
  const recordPath = join2(base, "record.json");
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
        snapshotPath = join2(base, artifact.snapshot);
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
async function latest(project, insightId) {
  id(insightId);
  const directory2 = join2(project, ".incline/insights", insightId);
  let names;
  try {
    names = await readdir(directory2);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const revisions = names.filter((n) => /^[1-9][0-9]*\.json$/.test(n)).map((n) => Number(n.slice(0, -5)));
  if (!revisions.length) return null;
  const revision = Math.max(...revisions);
  const path = join2(directory2, `${revision}.json`);
  const { data } = await loadJson(path);
  const {
    version,
    revision: savedRevision,
    recordedAt,
    supportingEvidence,
    conflictingEvidence,
    ...input
  } = data;
  const strip = (refs) => refs.map(({ recordHash, ...ref }) => {
    if (!/^[a-f0-9]{64}$/.test(recordHash))
      throw new Error("Invalid evidence hash");
    return ref;
  });
  validate({
    ...input,
    supportingEvidence: strip(supportingEvidence),
    conflictingEvidence: strip(conflictingEvidence)
  });
  if (version !== 1 || savedRevision !== revision || data.id !== insightId || !recordedAt || Number.isNaN(Date.parse(recordedAt)))
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
      ids = await readdir(join2(project, ".incline/insights"));
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
  if (!(await stat2(project)).isDirectory())
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
  const directory2 = join2(project, ".incline/insights", data.id);
  await mkdir(directory2, { recursive: true });
  const temp = join2(directory2, `.pending-${randomUUID()}`);
  const revisionPath = join2(directory2, `${record.revision}.json`);
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

// local/knowledge.mjs
import {
  mkdir as mkdir2,
  readFile as readFile2,
  writeFile as writeFile2,
  readdir as readdir2,
  lstat,
  rename,
  rm
} from "node:fs/promises";
import { join as join3, resolve as resolve2, relative } from "node:path";
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";
var hash2 = (bytes) => createHash2("sha256").update(bytes).digest("hex");
var safeId = /^[a-zA-Z0-9_-]{1,80}$/;
var safeGeneration = /^[a-f0-9-]{36}$/;
var digest = /^[a-f0-9]{64}$/;
var compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var json = (value) => JSON.stringify(value, null, 2) + "\n";
var tokens = (value) => [
  ...new Set(
    value.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  )
];
var escape = (value) => value.replace(/[\\`*_{}[\]()#>!|<]/g, "\\$&").replace(/\r?\n/g, " ");
async function manifest(project) {
  const root = join3(project, ".incline/insights");
  let ids;
  try {
    ids = await readdir2(root);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const result = [];
  for (const id2 of ids.sort(compare)) {
    if (!safeId.test(id2)) throw new Error("Invalid insight ID in source");
    const directory2 = join3(root, id2);
    if (!(await lstat(directory2)).isDirectory())
      throw new Error("Invalid insight source directory");
    const revisions = (await readdir2(directory2)).filter((name) => /^[1-9][0-9]*\.json$/.test(name)).map((name) => Number(name.slice(0, -5)));
    if (!revisions.length) continue;
    const revision = Math.max(...revisions);
    if (!Number.isSafeInteger(revision))
      throw new Error("Invalid insight revision");
    const info = await lstat(join3(directory2, `${revision}.json`), {
      bigint: true
    });
    if (!info.isFile()) throw new Error("Invalid insight source file");
    result.push({
      id: id2,
      revision,
      size: String(info.size),
      mtimeNs: String(info.mtimeNs),
      ctimeNs: String(info.ctimeNs)
    });
  }
  return result;
}
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var topicName = (aspect) => hash2(aspect) + ".md";
var revisionRelative = (entry) => `.incline/insights/${entry.id}/${entry.revision}.json`;
function compact(entry) {
  const {
    id: id2,
    revision,
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
    id: id2,
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
  return relative(from, join3(project, path)).split("\\").join("/");
}
function topicMarkdown(project, directory2, aspect, entries) {
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
      `[Authoritative revision](${sourceLink(directory2, project, entry.revisionPath)})`,
      ""
    );
    for (const [label, values] of [
      ["Qualifications", entry.qualifications],
      ["Open questions", entry.openQuestions]
    ]) {
      lines.push(
        `### ${label}`,
        "",
        ...values.length ? values.map((text2) => `- ${escape(text2)}`) : ["None recorded."],
        ""
      );
    }
    for (const [label, refs] of [
      ["Supporting evidence", entry.supportingEvidence],
      ["Conflicting evidence", entry.conflictingEvidence]
    ]) {
      lines.push(`### ${label}`, "");
      for (const ref of refs)
        lines.push(
          `- [${ref.batchId}/${ref.eventId}](${sourceLink(directory2, project, `.incline/feedback/${ref.batchId}/record.json`)}) \u2014 event ID: ${ref.eventId}; recorded SHA-256: ${ref.recordHash}`
        );
      if (!refs.length) lines.push("None recorded.");
      lines.push("");
    }
    lines.push(
      `Inspect exact events and current artifact availability with: \`insights.mjs evidence --id ${entry.id} --project <project>\`. A link does not establish that an image exists or has been inspected.`,
      ""
    );
  }
  return lines.join("\n") + "\n";
}
async function directory(path) {
  await mkdir2(path, { recursive: true });
  if (!(await lstat(path)).isDirectory())
    throw new Error("Knowledge output must be a real directory");
}
async function rebuildKnowledge(project) {
  project = resolve2(project);
  if (!(await lstat(project)).isDirectory())
    throw new Error("Project must be a directory");
  const before = await manifest(project);
  const entries = await sources(project, before);
  const root = join3(project, ".incline/knowledge");
  await directory(join3(project, ".incline"));
  await directory(root);
  await directory(join3(root, "generations"));
  const generation = randomUUID2();
  const output = join3(root, "generations", generation);
  const pointerTemp = join3(root, `.pending-${generation}`);
  let published = false;
  try {
    await mkdir2(output);
    await mkdir2(join3(output, "topics"));
    const aspects = [...new Set(entries.map((entry) => entry.aspect))].sort(
      compare
    );
    const topicHashes = {};
    for (const aspect of aspects) {
      const path = `topics/${topicName(aspect)}`;
      const content = topicMarkdown(
        project,
        join3(output, "topics"),
        aspect,
        entries.filter((entry) => entry.aspect === aspect)
      );
      await writeFile2(join3(output, path), content, { flag: "wx", mode: 384 });
      topicHashes[path] = hash2(content);
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
    await writeFile2(join3(output, "index.md"), indexMarkdown, {
      flag: "wx",
      mode: 384
    });
    const index = {
      version: 1,
      manifest: before,
      entries,
      topicHashes,
      indexMarkdownHash: hash2(indexMarkdown)
    };
    const bytes = json(index);
    await writeFile2(join3(output, "index.json"), bytes, {
      flag: "wx",
      mode: 384
    });
    if (!same(before, await manifest(project)))
      throw new Error("Insight sources changed during rebuild; retry");
    await writeFile2(
      pointerTemp,
      json({ version: 1, generation, indexHash: hash2(bytes) }),
      { flag: "wx", mode: 384 }
    );
    await rename(pointerTemp, join3(root, "current.json"));
    published = true;
    return {
      status: "rebuilt",
      indexPath: join3(output, "index.json"),
      indexMarkdownPath: join3(output, "index.md"),
      topicPaths: aspects.map(
        (aspect) => join3(output, "topics", topicName(aspect))
      )
    };
  } finally {
    await rm(pointerTemp, { force: true });
    if (!published) await rm(output, { recursive: true, force: true });
  }
}
async function checkedRead(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > 2e7)
    throw new Error("Invalid knowledge cache file");
  return readFile2(path);
}
async function cache(project, currentManifest) {
  const root = join3(project, ".incline/knowledge");
  let pointerBytes;
  try {
    pointerBytes = await checkedRead(join3(root, "current.json"));
  } catch (error) {
    if (error.code === "ENOENT") return { freshness: "missing" };
    return { freshness: "corrupt" };
  }
  try {
    const pointer = JSON.parse(pointerBytes);
    if (pointer.version !== 1 || !safeGeneration.test(pointer.generation) || !digest.test(pointer.indexHash))
      throw new Error("Invalid pointer");
    const output = join3(root, "generations", pointer.generation);
    if (!(await lstat(output)).isDirectory())
      throw new Error("Invalid generation");
    const bytes = await checkedRead(join3(output, "index.json"));
    if (hash2(bytes) !== pointer.indexHash) throw new Error("Changed index");
    const index = JSON.parse(bytes);
    if (index.version !== 1 || !Array.isArray(index.entries) || !Array.isArray(index.manifest) || !index.topicHashes || !digest.test(index.indexMarkdownHash))
      throw new Error("Invalid index");
    if (!same(index.manifest, currentManifest)) return { freshness: "stale" };
    if (hash2(await checkedRead(join3(output, "index.md"))) !== index.indexMarkdownHash)
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
    const fields = [
      "aspect",
      "scope",
      "finding",
      "qualifications",
      "openQuestions"
    ];
    const sets = Object.fromEntries(
      fields.map((field) => [
        field,
        new Set(
          tokens(
            Array.isArray(entry[field]) ? entry[field].join(" ") : entry[field]
          )
        )
      ])
    );
    const matched = terms.filter(
      (term) => fields.some((field) => sets[field].has(term))
    );
    const matchReasons = [];
    if (options.aspect !== void 0)
      matchReasons.push("Exact aspect filter");
    if (options.scope !== void 0) matchReasons.push("Exact scope filter");
    for (const field of fields) {
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
  project = resolve2(project);
  const before = await manifest(project);
  let loaded = await cache(project, before);
  let ranked;
  if (loaded.freshness === "current") {
    ranked = matches(loaded.index.entries, { query, aspect, scope });
    try {
      for (const topicPath of new Set(
        ranked.slice(0, limit).map((entry) => entry.topicPath)
      )) {
        if (hash2(await checkedRead(join3(loaded.output, topicPath))) !== loaded.index.topicHashes[topicPath])
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
      revisionPath: join3(project, entry.revisionPath),
      ...loaded.freshness === "current" ? { topicPath: join3(loaded.output, topicPath) } : {}
    }))
  };
}

// local/insights-cli.mjs
try {
  const [command, ...args] = process.argv.slice(2);
  if (["--help", "-h"].includes(command))
    console.log(
      "Incline insights\n  insights.mjs save --input <insight.json> [--project <directory>]\n  insights.mjs read [--id <id>] [--aspect <topic>] [--project <directory>]\n  insights.mjs evidence --id <id> [--project <directory>]\n  insights.mjs rebuild [--project <directory>]\n  insights.mjs query [--query <text>] [--aspect <topic>] [--scope <exact scope>] [--limit <1-20>] [--project <directory>]\nAgent-authored, project-local findings linked to original feedback. Rebuild creates derived topic views; query is read-only and reports freshness. No automatic inference."
    );
  else {
    if (!["save", "read", "evidence", "rebuild", "query"].includes(command))
      throw new Error("Choose save, read, evidence, rebuild or query");
    const filters = {};
    const optionsArgs = [];
    for (let i = 0; i < args.length; i++) {
      if (["--id", "--aspect", "--query", "--scope", "--limit"].includes(args[i])) {
        const key = args[i].slice(2);
        if (filters[key] || !args[i + 1] || args[i + 1].startsWith("--"))
          throw new Error("Invalid filter");
        filters[key] = args[++i];
      } else optionsArgs.push(args[i]);
    }
    if (optionsArgs.some((a) => ["--library-dir", "--local-only"].includes(a)))
      throw new Error("Insights are project-local");
    const options = await resolveOptions(optionsArgs);
    const allowedFilters = {
      save: [],
      read: ["id", "aspect"],
      evidence: ["id"],
      rebuild: [],
      query: ["query", "aspect", "scope", "limit"]
    };
    if (Object.keys(filters).some((key) => !allowedFilters[command].includes(key)))
      throw new Error(`Unsupported filter for ${command}`);
    if (filters.limit !== void 0) {
      if (!/^(?:[1-9]|1[0-9]|20)$/.test(filters.limit))
        throw new Error("limit must be an integer from 1 to 20");
      filters.limit = Number(filters.limit);
    }
    let result;
    if (command === "save") {
      if (!options.input || Object.keys(filters).length)
        throw new Error("save requires input and no filters");
      const info = await stat3(options.input);
      if (!info.isFile() || info.size > 1e6)
        throw new Error("Invalid input file");
      result = await saveInsight(
        options.project,
        JSON.parse(await readFile3(options.input, "utf8"))
      );
    } else {
      if (options.input) throw new Error("Only save accepts input");
      if (command === "rebuild")
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
