// local/design-snapshots-cli.mjs
import { homedir as homedir2 } from "node:os";
import { join as join6, resolve as resolve5 } from "node:path";
import { fileURLToPath } from "node:url";

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

// local/design-snapshots.mjs
import {
  mkdir as mkdir2,
  mkdtemp,
  writeFile,
  rename,
  rm,
  open as open2,
  unlink,
  realpath as realpath3
} from "node:fs/promises";
import {
  basename,
  dirname as dirname2,
  extname,
  join as join4,
  parse,
  relative,
  resolve as resolve3,
  sep
} from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

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
function pathParts(relative2) {
  if (typeof relative2 !== "string" || !relative2 || relative2.includes("\\") || relative2.includes("\0"))
    throw new Error("Unsafe relative path");
  const parts = relative2.split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    throw new Error("Unsafe relative path");
  return parts;
}
async function safeDirectory(project, parts, create = false) {
  let current = await realpath2(project);
  if (!(await lstat(current)).isDirectory())
    throw new Error("Project must be a directory");
  for (const part of parts) {
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
async function safeEntries(project, parts) {
  const directory = await safeDirectory(project, parts);
  return directory === null ? null : readdir(directory, { withFileTypes: true });
}
async function safeBytes(project, parts, maxBytes = MAX_JSON_BYTES) {
  const directory = await safeDirectory(project, parts.slice(0, -1));
  if (directory === null) return null;
  const name = parts.at(-1);
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

// local/assets.mjs
var maxAssetBytes = 8e6;
var maxGuideBytes = 2e5;
function markdownText(bytes) {
  try {
    const text3 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text3.trim()) return false;
    for (const character of text3) {
      const code = character.charCodeAt(0);
      if (code < 32 && ![9, 10, 13].includes(code)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
function normalizedType(value) {
  return String(value ?? "").split(";", 1)[0].trim().toLowerCase();
}
var formats = {
  "text/markdown": { extension: "md", matches: markdownText },
  "image/png": {
    extension: "png",
    matches: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  },
  "image/jpeg": {
    extension: "jpg",
    matches: (b) => b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255
  },
  "image/webp": {
    extension: "webp",
    matches: (b) => b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP"
  },
  "image/gif": {
    extension: "gif",
    matches: (b) => b.length >= 6 && ["GIF87a", "GIF89a"].includes(b.toString("ascii", 0, 6))
  }
};
function inspectAsset(bytes, contentType) {
  const type = normalizedType(contentType);
  const limit = type === "text/markdown" ? maxGuideBytes : maxAssetBytes;
  if (!Buffer.isBuffer(bytes) || bytes.length === 0)
    throw Object.assign(new Error("Reference file is empty"), { status: 400 });
  if (bytes.length > limit)
    throw Object.assign(
      new Error(
        type === "text/markdown" ? "Design guide exceeds 200 KB" : "Image is too large"
      ),
      { status: 413 }
    );
  const format = formats[type];
  if (!format || !format.matches(bytes))
    throw Object.assign(
      new Error(
        type === "text/markdown" ? "Choose a non-empty UTF-8 Markdown file" : "Unsupported or invalid image"
      ),
      {
        status: 415
      }
    );
  return format;
}

// local/prompt-settings.mjs
import { isAbsolute, join as join3, resolve as resolve2 } from "node:path";
var defaults = Object.freeze({
  version: 1,
  revision: null,
  personalLookup: false,
  personalDirectory: null,
  recording: "off"
});
var editable = ["personalLookup", "personalDirectory", "recording"];
function validate(value, saved = false) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid prompt settings");
  const fields2 = saved ? [...editable, "version", "revision"] : [...editable, "expectedRevision"];
  if (Object.keys(value).some((key) => !fields2.includes(key)))
    throw new Error("Unknown prompt settings field");
  if (saved && (value.version !== 1 || typeof value.revision !== "string" || !/^[a-f0-9-]{36}$/.test(value.revision)))
    throw new Error("Invalid saved prompt settings revision");
  if ("personalLookup" in value && typeof value.personalLookup !== "boolean")
    throw new Error("Invalid personal lookup setting");
  if ("personalDirectory" in value && value.personalDirectory !== null && (typeof value.personalDirectory !== "string" || value.personalDirectory.length > 4e3 || !isAbsolute(value.personalDirectory) || value.personalDirectory.includes("\0")))
    throw new Error("Personal prompt directory must be absolute");
  if ("recording" in value && !["off", "active", "stopped"].includes(value.recording))
    throw new Error("Invalid recording setting");
  if (saved && editable.some((key) => !(key in value)))
    throw new Error("Missing saved prompt settings field");
  if (saved && value.personalLookup && !value.personalDirectory)
    throw new Error("Personal lookup requires a selected directory");
}
async function readPromptSettings(project) {
  const raw = await safeBytes(
    project,
    [".incline", "prompt-settings.json"],
    16e3
  );
  if (!raw) return { ...defaults };
  let data;
  try {
    data = JSON.parse(raw.bytes.toString("utf8"));
  } catch {
    throw new Error(
      "Cannot read prompt settings; preserve and repair the existing file"
    );
  }
  validate(data, true);
  return data;
}
async function assertPromptRecording(project) {
  if (!project || (await readPromptSettings(project)).recording !== "active")
    throw new Error(
      "Prompt recording must be active for new run or decision evidence"
    );
}

// local/feedback.mjs
var fail = (message) => {
  throw new Error(`Invalid feedback: ${message}`);
};
function object(value, fields2) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("expected object");
  for (const key of Object.keys(value))
    if (!fields2.includes(key)) fail(`unknown field ${key}`);
}
function text(value, name, max = 1e4) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(name);
}
function id(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    fail("unsafe ID");
}
function list(value, name, max) {
  if (!Array.isArray(value) || value.length > max) fail(name);
}
function validateBatch(data) {
  object(data, ["id", "mode", "coverage", "artifacts", "events"]);
  id(data.id);
  if (!["live", "retrospective"].includes(data.mode)) fail("mode");
  object(data.coverage, ["source", "limitations"]);
  text(data.coverage.source, "coverage source");
  list(data.coverage.limitations, "limitations", 100);
  data.coverage.limitations.forEach((value) => text(value, "limitation"));
  list(data.artifacts, "artifacts", 24);
  list(data.events, "events", 100);
  if (!data.events.length) fail("at least one event required");
  const artifactIds = /* @__PURE__ */ new Set();
  for (const artifact of data.artifacts) {
    object(artifact, ["id", "path", "locator", "missingReason"]);
    id(artifact.id);
    if (artifactIds.has(artifact.id)) fail("duplicate artifact ID");
    artifactIds.add(artifact.id);
    if (artifact.path !== void 0) {
      text(artifact.path, "artifact path");
      if (artifact.missingReason !== void 0)
        fail("snapshot cannot be missing");
    } else
      text(artifact.missingReason, "missingReason required without a snapshot");
    if (artifact.locator !== void 0)
      text(artifact.locator, "artifact locator");
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
      "disposition",
      "rating"
    ]);
    if (event.disposition !== void 0) {
      object(event.disposition, [
        "publication",
        "readiness",
        "aesthetic",
        "basis"
      ]);
      for (const [axis, values] of Object.entries({
        publication: ["unknown", "authorized"],
        readiness: ["unknown", "acceptable"],
        aesthetic: ["unknown", "positive", "preferred"]
      }))
        if (!values.includes(event.disposition[axis]))
          fail(`disposition ${axis}`);
      text(event.disposition.basis, "disposition basis");
    }
    id(event.id);
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
      "pause",
      "reaction"
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
      "acceptance",
      "reaction"
    ].includes(event.kind) && !["verbatim", "summary"].includes(event.evidence))
      fail(`${event.kind} requires explicit user evidence`);
    if (event.kind === "hypothesis" && event.evidence !== "inference")
      fail("hypothesis must be inference");
    if (event.kind === "preservation" && event.evidence !== "observation")
      fail("preservation is only an observation");
    for (const field of ["text", "source", "context"])
      text(event[field], field);
    if (event.occurredAt !== null && (typeof event.occurredAt !== "string" || Number.isNaN(Date.parse(event.occurredAt))))
      fail("occurredAt must be a known timestamp or null");
    list(event.artifactIds, "artifact references", 24);
    if (event.artifactIds.some((value) => !artifactIds.has(value)))
      fail("unknown artifact reference");
    if (event.rating !== void 0) {
      if (event.kind !== "reaction") fail("rating requires a reaction event");
      if (!event.artifactIds.length)
        fail("rating requires an artifact reference");
      const rating = event.rating;
      object(rating, [
        "value",
        "min",
        "max",
        "question",
        "minLabel",
        "maxLabel"
      ]);
      if (![rating.value, rating.min, rating.max].every(Number.isFinite) || rating.min >= rating.max || rating.value < rating.min || rating.value > rating.max)
        fail("rating requires a finite value within its stated scale");
      text(rating.question, "rating question", 2e3);
      text(rating.minLabel, "rating minLabel", 500);
      text(rating.maxLabel, "rating maxLabel", 500);
    }
  }
  return data;
}

// local/design-snapshot-model.mjs
function fields(value, allowed2) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed2.includes(key)))
    throw new Error("Invalid design snapshot fields");
}
function text2(value, label, max = 1e4) {
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value) > max || value.includes("\0"))
    throw new Error(`Invalid ${label}`);
}
function list2(value, label, max) {
  if (!Array.isArray(value) || value.length > max)
    throw new Error(`Invalid ${label}`);
}
function validateDesign(input, saved = false) {
  fields(input, [
    "id",
    "title",
    "context",
    "state",
    "tags",
    "observations",
    "artifacts",
    "reactions",
    "satisfaction",
    "qualifications",
    "reuseNotes"
  ]);
  safeId(input.id);
  text2(input.title, "title", 200);
  for (const key of ["context", "state"]) text2(input[key], key);
  for (const key of ["tags", "qualifications", "reuseNotes"]) {
    list2(input[key], key, 30);
    input[key].forEach(
      (value) => text2(value, key, key === "tags" ? 100 : 4e3)
    );
  }
  list2(input.artifacts, "artifacts", 24);
  if (!input.artifacts.length)
    throw new Error("Identify at least one captured or missing artifact");
  const artifacts = /* @__PURE__ */ new Map();
  for (const artifact of input.artifacts) {
    fields(
      artifact,
      saved ? [
        "id",
        "kind",
        "view",
        "locator",
        "missingReason",
        "file",
        "sha256",
        "size"
      ] : ["id", "kind", "view", "locator", "path", "missingReason"]
    );
    safeId(artifact.id);
    if (artifacts.has(artifact.id)) throw new Error("Duplicate artifact ID");
    artifacts.set(artifact.id, artifact);
    if (!["screenshot", "motion", "source"].includes(artifact.kind))
      throw new Error("Invalid artifact kind");
    text2(artifact.view, "artifact view");
    if (artifact.locator !== void 0)
      text2(artifact.locator, "artifact locator");
    const path = saved ? artifact.file : artifact.path;
    if (path !== void 0) {
      text2(path, "artifact path", 4e3);
      if (artifact.missingReason !== void 0)
        throw new Error("Retained artifact cannot also be missing");
      if (saved && (!/^assets\/[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(path) || !/^[a-f0-9]{64}$/.test(artifact.sha256) || !Number.isSafeInteger(artifact.size) || artifact.size < 1 || artifact.size > 8e6))
        throw new Error("Invalid retained artifact metadata");
    } else {
      text2(artifact.missingReason, "missing artifact reason");
      if (saved && (artifact.sha256 !== void 0 || artifact.size !== void 0))
        throw new Error("Missing artifact has retained metadata");
    }
  }
  list2(input.observations, "observations", 40);
  if (!input.observations.length)
    throw new Error("At least one observed design relationship is required");
  for (const observation of input.observations) {
    fields(observation, ["aspect", "text", "basis", "artifactIds"]);
    text2(observation.aspect, "observation aspect", 100);
    text2(observation.text, "observation text", 4e3);
    if (!["rendered", "source"].includes(observation.basis))
      throw new Error("Declare rendered or source-derived observation basis");
    list2(observation.artifactIds, "observation artifacts", 24);
    if (!observation.artifactIds.length || observation.artifactIds.some((id2) => !artifacts.has(id2)))
      throw new Error("Observation requires known artifact references");
    if (!observation.artifactIds.some(
      (id2) => observation.basis === "source" ? artifacts.get(id2).kind === "source" : artifacts.get(id2).kind !== "source"
    ))
      throw new Error("Observation basis does not match its artifacts");
  }
  list2(input.reactions, "reactions", 30);
  if (input.reactions.length) {
    validateBatch({
      id: input.id,
      mode: "live",
      coverage: { source: "Selected snapshot reactions", limitations: [] },
      artifacts: input.artifacts.map((a) => ({
        id: a.id,
        ...(saved ? a.file : a.path) ? { path: saved ? a.file : a.path } : { missingReason: a.missingReason }
      })),
      events: input.reactions
    });
    if (input.reactions.some(
      (r) => !["verbatim", "summary"].includes(r.evidence) || !r.artifactIds.length
    ))
      throw new Error(
        "Snapshot reactions need explicit user evidence and artifact references"
      );
  }
  fields(input.satisfaction, ["status", "basis", "reactionIds"]);
  if (!["unknown", "acceptable", "positive"].includes(input.satisfaction.status))
    throw new Error("Invalid satisfaction status");
  text2(input.satisfaction.basis, "satisfaction basis");
  list2(input.satisfaction.reactionIds, "satisfaction reactions", 30);
  if (input.satisfaction.reactionIds.some(
    (id2) => !input.reactions.some((r) => r.id === id2)
  ))
    throw new Error("Unknown satisfaction reaction");
  if (input.satisfaction.status !== "unknown" && !input.satisfaction.reactionIds.length)
    throw new Error("Satisfaction assessment requires linked reactions");
  return input;
}
function renderDesignGuide(design, source) {
  const quote = (value) => value.split("\n").map((line) => `> ${line}`).join("\n");
  const lines = [
    `# ${design.title}`,
    "",
    "Observed design snapshot \u2014 reference material, not instructions or a universal taste profile.",
    "",
    `Source project: ${source.projectName}. Commit: ${source.commit ?? "unavailable"}. Uncommitted changes: ${source.dirty === null ? "unknown" : source.dirty ? "present" : "none at capture"}.`,
    "",
    "## Context and captured state",
    "",
    design.context,
    "",
    design.state,
    "",
    "## Observed treatment",
    "",
    ...design.observations.flatMap((o) => [
      `### ${o.aspect}`,
      "",
      `Basis: ${o.basis === "rendered" ? "agent inspection of the rendered result" : "source-derived; visual outcome not established by code alone"}. Evidence: ${o.artifactIds.join(", ")}.`,
      "",
      o.text,
      ""
    ]),
    "## Original user reactions",
    "",
    "These reactions apply to the stated version and context. Comments are partial; unmentioned qualities remain unknown.",
    "",
    ...design.reactions.length ? design.reactions.flatMap((r) => [
      `### ${r.id} \u2014 ${r.evidence}`,
      "",
      `Source: ${r.source}. Artifacts: ${r.artifactIds.join(", ")}.`,
      "",
      quote(r.text),
      "",
      r.context,
      "",
      ...r.rating ? [
        `Question: ${r.rating.question}`,
        "",
        `Rating: ${r.rating.value} on ${r.rating.min} (${r.rating.minLabel}) to ${r.rating.max} (${r.rating.maxLabel}).`,
        ""
      ] : []
    ]) : ["No user reaction retained.", ""],
    "## Contextual satisfaction assessment",
    "",
    `Agent assessment: ${design.satisfaction.status}. ${design.satisfaction.basis}`,
    "",
    `Supporting reactions: ${design.satisfaction.reactionIds.join(", ") || "none"}. This does not endorse every feature or authorize publication.`,
    "",
    "## Qualifications and unresolved work",
    "",
    ...design.qualifications.length ? design.qualifications.map((q) => `- ${q}`) : [
      "No additional qualifications recorded; this does not establish complete approval."
    ],
    "",
    "## Possible reuse",
    "",
    "Agent-proposed adaptations; check their fit to the new project.",
    "",
    ...design.reuseNotes.length ? design.reuseNotes.map((n) => `- ${n}`) : ["No reuse hypotheses supplied."],
    "",
    "## Retained evidence and gaps",
    "",
    ...design.artifacts.flatMap((a) => [
      `- ${a.id} (${a.kind}): ${a.view}`,
      a.file ? `  Retained: [${a.id}](${a.file})` : `  Unavailable: ${a.missingReason}`,
      ...a.locator ? [`  Original locator: ${a.locator}`] : []
    ]),
    ""
  ];
  const guide = lines.join("\n");
  if (Buffer.byteLength(guide) > 2e5)
    throw new Error("Generated guide exceeds 200 KB");
  return guide;
}

// local/design-snapshots.mjs
var execute = promisify(execFile);
var hashPattern = /^[a-f0-9]{64}$/;
function location(project, { scope = "project", library, localOnly = false } = {}) {
  if (scope === "personal") {
    if (localOnly)
      throw new Error("--local-only forbids personal design library access");
    if (!library) throw new Error("Select a personal design library");
    const path = resolve3(library);
    const root = parse(path).root;
    return {
      root,
      parts: relative(root, path).split(sep).filter(Boolean),
      scope
    };
  }
  if (!["project", "imported"].includes(scope))
    throw new Error("Invalid design snapshot scope");
  return {
    root: project,
    parts: [
      ".incline",
      scope === "project" ? "design-snapshots" : "design-references"
    ],
    scope
  };
}
async function readDesignInput(path) {
  const directory = await realpath3(dirname2(resolve3(path)));
  const loaded = await safeBytes(directory, [basename(path)]);
  if (!loaded) throw new Error("Design input file not found");
  return {
    input: JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(loaded.bytes)
    ),
    directory
  };
}
function assetExtension(bytes, kind, extension) {
  const images = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif"
  };
  if (kind === "screenshot") {
    if (!images[extension])
      throw new Error("Screenshot must be a retained raster image");
    return inspectAsset(bytes, images[extension]).extension;
  }
  if (kind === "motion") {
    if (extension === ".gif") return inspectAsset(bytes, "image/gif").extension;
    if (extension === ".mp4" && bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp")
      return "mp4";
    if (extension === ".webm" && bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])))
      return "webm";
    throw new Error("Motion capture must be GIF, MP4 or WebM");
  }
  if (![
    ".md",
    ".txt",
    ".html",
    ".css",
    ".scss",
    ".svg",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json"
  ].includes(extension))
    throw new Error("Unsupported selected source file");
  const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!content.trim() || content.includes("\0"))
    throw new Error("Source must be nonempty UTF-8 text");
  return extension.slice(1);
}
async function prepareArtifacts(input, inputDirectory) {
  const files = /* @__PURE__ */ new Map();
  const artifacts = [];
  let total = 0;
  for (const artifact of input.artifacts) {
    if (!artifact.path) {
      artifacts.push({ ...artifact });
      continue;
    }
    const source = resolve3(inputDirectory, artifact.path);
    const root = parse(source).root;
    const loaded = await safeBytes(
      root,
      relative(root, source).split(sep),
      8e6
    );
    if (!loaded || !loaded.bytes.length)
      throw new Error(
        "Artifact is missing or empty; supply an explicit gap instead"
      );
    total += loaded.bytes.length;
    if (total > 32e6) throw new Error("Snapshot assets exceed 32 MB");
    const extension = assetExtension(
      loaded.bytes,
      artifact.kind,
      extname(source).toLowerCase()
    );
    const file = `assets/${artifact.id}.${extension}`;
    const { path: _path, ...metadata } = artifact;
    artifacts.push({
      ...metadata,
      file,
      sha256: digest(loaded.bytes),
      size: loaded.bytes.length
    });
    files.set(file, loaded.bytes);
  }
  return { files, artifacts };
}
async function projectIdentity(project) {
  const projectName = basename(await realpath3(project));
  try {
    const { stdout: head } = await execute(
      "git",
      ["-C", project, "rev-parse", "--verify", "HEAD"],
      { timeout: 5e3 }
    );
    const { stdout: changes } = await execute(
      "git",
      ["-C", project, "status", "--porcelain", "--", ".", ":(exclude).incline"],
      { timeout: 5e3, maxBuffer: 1e6 }
    );
    return { projectName, commit: head.trim(), dirty: Boolean(changes.trim()) };
  } catch {
    return { projectName, commit: null, dirty: null };
  }
}
function validateManifest(manifest) {
  fields(manifest, [
    "version",
    "createdAt",
    "source",
    "design",
    "inputHash",
    "guideHash",
    "hash"
  ]);
  if (manifest.version !== 1 || typeof manifest.createdAt !== "string" || Number.isNaN(Date.parse(manifest.createdAt)))
    throw new Error("Invalid snapshot version or date");
  fields(manifest.source, ["projectName", "commit", "dirty"]);
  text2(manifest.source.projectName, "source project", 200);
  if (manifest.source.commit !== null && (typeof manifest.source.commit !== "string" || !/^[a-f0-9]{40,64}$/.test(manifest.source.commit)))
    throw new Error("Invalid source commit");
  if (manifest.source.dirty !== null && typeof manifest.source.dirty !== "boolean")
    throw new Error("Invalid source dirty state");
  for (const field of ["inputHash", "guideHash", "hash"])
    if (!hashPattern.test(manifest[field]))
      throw new Error("Invalid snapshot hash");
  validateDesign(manifest.design, true);
  const { hash, ...body } = manifest;
  if (digest(canonical(body)) !== hash)
    throw new Error("Snapshot manifest integrity failed");
  if (digest(renderDesignGuide(manifest.design, manifest.source)) !== manifest.guideHash)
    throw new Error("Snapshot guide metadata integrity failed");
}
function validateReuse(reuse, hash) {
  fields(reuse, [
    "version",
    "intent",
    "sourceHash",
    "relevance",
    "targetProject",
    "importedAt"
  ]);
  if (reuse.version !== 1 || reuse.intent !== "inspiration" || reuse.sourceHash !== hash || typeof reuse.importedAt !== "string" || Number.isNaN(Date.parse(reuse.importedAt)))
    throw new Error("Invalid design reuse receipt");
  text2(reuse.relevance, "reuse relevance");
  text2(reuse.targetProject, "target project", 200);
}
async function loadBundle(loc, id2, metadataOnly = false) {
  safeId(id2);
  const parts = [...loc.parts, id2];
  const raw = await safeBytes(loc.root, [...parts, "snapshot.json"]);
  if (!raw) {
    if (await safeDirectory(loc.root, parts))
      throw new Error(
        "Incomplete design snapshot; preserve it and choose another capture ID"
      );
    throw Object.assign(new Error("Design snapshot not found"), {
      code: "ENOENT"
    });
  }
  const manifest = JSON.parse(raw.bytes.toString("utf8"));
  validateManifest(manifest);
  if ((loc.scope === "project" ? manifest.design.id : manifest.hash) !== id2)
    throw new Error("Snapshot directory identity mismatch");
  const directory = await safeDirectory(loc.root, parts);
  let reuse = null;
  if (loc.scope === "imported") {
    const receipt = await safeBytes(loc.root, [...parts, "reuse.json"], 32e3);
    if (!receipt) throw new Error("Missing design reuse receipt");
    const envelope = JSON.parse(receipt.bytes.toString("utf8"));
    fields(envelope, ["reuse", "hash"]);
    if (digest(canonical(envelope.reuse)) !== envelope.hash)
      throw new Error("Reuse receipt integrity failed");
    validateReuse(envelope.reuse, manifest.hash);
    reuse = envelope.reuse;
  }
  const files = /* @__PURE__ */ new Map();
  let guide;
  if (!metadataOnly) {
    const retained = await safeBytes(
      loc.root,
      [...parts, "DESIGN.md"],
      2e5
    );
    if (!retained || digest(retained.bytes) !== manifest.guideHash)
      throw new Error("Design guide integrity failed");
    guide = retained.bytes.toString("utf8");
    files.set("DESIGN.md", retained.bytes);
    let total = 0;
    for (const artifact of manifest.design.artifacts) {
      if (!artifact.file) continue;
      const asset = await safeBytes(
        loc.root,
        [...parts, ...artifact.file.split("/")],
        8e6
      );
      if (!asset || asset.bytes.length !== artifact.size || digest(asset.bytes) !== artifact.sha256)
        throw new Error(`Artifact integrity failed: ${artifact.id}`);
      total += asset.bytes.length;
      if (total > 32e6) throw new Error("Snapshot assets exceed 32 MB");
      assetExtension(asset.bytes, artifact.kind, extname(artifact.file));
      files.set(artifact.file, asset.bytes);
    }
  }
  return { id: id2, directory, manifest, guide, reuse, files };
}
async function publishBundle(loc, id2, manifest, files, reuse = null, beforePublish = null) {
  safeId(id2);
  const store = await safeDirectory(loc.root, loc.parts, true);
  const lockPath = join4(store, ".snapshot-write.lock");
  let lock;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      lock = await open2(lockPath, "wx", 384);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await delay(25);
    }
  }
  if (!lock)
    throw new Error("Design store is busy; retry after the current write");
  let staging;
  try {
    if (beforePublish) await beforePublish();
    try {
      const existing = await loadBundle(loc, id2);
      const same = loc.scope === "project" ? existing.manifest.inputHash === manifest.inputHash : existing.manifest.hash === manifest.hash;
      if (!same || reuse && existing.reuse?.relevance !== reuse.relevance)
        throw new Error(
          "Snapshot already exists with different content; choose a new capture ID or reuse the original import"
        );
      return {
        status: "already-saved",
        id: id2,
        hash: existing.manifest.hash,
        directory: existing.directory,
        guidePath: join4(existing.directory, "DESIGN.md")
      };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const entries = await safeEntries(loc.root, loc.parts);
    const visible = entries.filter((e) => !e.name.startsWith("."));
    if (visible.length >= 1e3)
      throw new Error("Design store limit of 1000 snapshots reached");
    for (const entry of visible) {
      if (!entry.isDirectory() || entry.isSymbolicLink())
        throw new Error("Invalid design store entry");
      await loadBundle(loc, entry.name, true);
    }
    staging = await mkdtemp(join4(store, ".pending-"));
    for (const [name, bytes] of files) {
      if (name.startsWith("assets/"))
        await mkdir2(join4(staging, "assets"), { recursive: true, mode: 448 });
      await writeFile(join4(staging, name), bytes, { flag: "wx", mode: 384 });
    }
    const raw = JSON.stringify(manifest, null, 2) + "\n";
    if (Buffer.byteLength(raw) > 1e6)
      throw new Error("Snapshot manifest exceeds 1 MB");
    await writeFile(join4(staging, "snapshot.json"), raw, {
      flag: "wx",
      mode: 384
    });
    if (reuse)
      await writeFile(
        join4(staging, "reuse.json"),
        JSON.stringify({ reuse, hash: digest(canonical(reuse)) }, null, 2) + "\n",
        { flag: "wx", mode: 384 }
      );
    await safeDirectory(loc.root, loc.parts);
    if (beforePublish) await beforePublish();
    await rename(staging, join4(store, id2));
    staging = null;
    return {
      status: "saved",
      id: id2,
      hash: manifest.hash,
      directory: join4(store, id2),
      guidePath: join4(store, id2, "DESIGN.md")
    };
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    await lock.close();
    await unlink(lockPath);
  }
}
async function captureDesign(project, input, { inputDirectory = project, automatic = false } = {}) {
  validateDesign(input);
  input = structuredClone(input);
  if (automatic) {
    await assertPromptRecording(project);
    if (input.satisfaction.status === "unknown")
      throw new Error(
        "Automatic capture needs a reaction-linked satisfaction assessment"
      );
  }
  const { files, artifacts } = await prepareArtifacts(
    input,
    await realpath3(inputDirectory)
  );
  const design = structuredClone({ ...input, artifacts });
  const inputHash = digest(canonical({ input, artifacts }));
  const source = await projectIdentity(project);
  const guide = renderDesignGuide(design, source);
  files.set("DESIGN.md", Buffer.from(guide));
  const body = {
    version: 1,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    source,
    design,
    inputHash,
    guideHash: digest(guide)
  };
  const manifest = { ...body, hash: digest(canonical(body)) };
  validateManifest(manifest);
  if (automatic) await assertPromptRecording(project);
  return publishBundle(
    location(project),
    design.id,
    manifest,
    files,
    null,
    automatic ? () => assertPromptRecording(project) : null
  );
}
async function readDesign(project, id2, options = {}) {
  const { files: _files, ...result } = await loadBundle(
    location(project, options),
    id2
  );
  return result;
}
async function queryDesigns(project, options = {}) {
  const { text: query = "", tag, limit = 10 } = options;
  if (typeof query !== "string" || query.length > 1e3 || tag !== void 0 && (typeof tag !== "string" || !tag.trim() || tag.length > 100) || !Number.isSafeInteger(limit) || limit < 1 || limit > 50)
    throw new Error("Invalid design query");
  const loc = location(project, options);
  const entries = (await safeEntries(loc.root, loc.parts) ?? []).filter(
    (entry) => !entry.name.startsWith(".")
  );
  if (entries.length > 1e3)
    throw new Error("Design store exceeds supported limit");
  const matches = [];
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink())
      throw new Error("Invalid design store entry");
    const saved = await loadBundle(loc, entry.name, true);
    const { design, source, createdAt, hash } = saved.manifest;
    const haystack = [
      design.title,
      design.context,
      design.state,
      ...design.tags
    ].join(" ").toLowerCase();
    if (!terms.every((term) => haystack.includes(term)) || tag && !design.tags.some((item) => item.toLowerCase() === tag.toLowerCase()))
      continue;
    matches.push({
      id: entry.name,
      hash,
      title: design.title,
      context: design.context,
      state: design.state,
      tags: design.tags,
      source,
      createdAt,
      satisfaction: design.satisfaction,
      qualifications: design.qualifications,
      retained: design.artifacts.filter((a) => a.file).length,
      gaps: design.artifacts.filter((a) => !a.file).length,
      ...saved.reuse ? { reuse: saved.reuse } : {}
    });
  }
  matches.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
  );
  return {
    entries: matches.slice(0, limit),
    total: matches.length,
    verification: "metadata-only; read a selected snapshot to verify its files"
  };
}
async function publishDesign(project, id2, library, { localOnly = false, beforePublish = null } = {}) {
  const destination = location(project, {
    scope: "personal",
    library,
    localOnly
  });
  const saved = await loadBundle(location(project), id2);
  return publishBundle(
    destination,
    saved.manifest.hash,
    saved.manifest,
    saved.files,
    null,
    beforePublish
  );
}
async function importDesign(project, id2, library, relevance, { localOnly = false } = {}) {
  text2(relevance, "reuse relevance");
  const source = location(project, { scope: "personal", library, localOnly });
  const saved = await loadBundle(source, id2);
  const reuse = {
    version: 1,
    intent: "inspiration",
    sourceHash: saved.manifest.hash,
    relevance,
    targetProject: basename(await realpath3(project)),
    importedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  return publishBundle(
    location(project, { scope: "imported" }),
    id2,
    saved.manifest,
    saved.files,
    reuse
  );
}

// local/design-snapshot-settings.mjs
import { open as open3, writeFile as writeFile2, rename as rename2, unlink as unlink2 } from "node:fs/promises";
import { isAbsolute as isAbsolute2, join as join5, resolve as resolve4 } from "node:path";
import { randomUUID } from "node:crypto";
var defaults2 = {
  version: 1,
  revision: null,
  personalAutoSave: false,
  personalDirectory: null
};
function validate2(value, saved = false) {
  fields(
    value,
    saved ? ["version", "revision", "personalAutoSave", "personalDirectory"] : ["expectedRevision", "personalAutoSave", "personalDirectory"]
  );
  if (saved && (value.version !== 1 || typeof value.revision !== "string" || !/^[a-f0-9-]{36}$/.test(value.revision)))
    throw new Error("Invalid design settings revision");
  if ((saved || "personalAutoSave" in value) && typeof value.personalAutoSave !== "boolean")
    throw new Error("Invalid personal auto-save setting");
  if ((saved || "personalDirectory" in value) && value.personalDirectory !== null && (typeof value.personalDirectory !== "string" || !isAbsolute2(value.personalDirectory) || value.personalDirectory.includes("\0") || value.personalDirectory.length > 4e3))
    throw new Error("Select an absolute personal design library directory");
  if (saved && value.personalAutoSave && !value.personalDirectory)
    throw new Error("Automatic personal saves require a selected library");
}
async function readDesignSettings(project) {
  const file = await safeBytes(
    project,
    [".incline", "design-snapshot-settings.json"],
    16e3
  );
  if (!file) return { ...defaults2 };
  const settings = JSON.parse(file.bytes.toString("utf8"));
  validate2(settings, true);
  return settings;
}
async function saveDesignSettings(project, input, { localOnly = false } = {}) {
  validate2(input);
  if (localOnly && (input.personalAutoSave === true || input.personalDirectory))
    throw new Error("--local-only forbids enabling personal saves");
  const previous = await readDesignSettings(project);
  const settings = { ...previous, ...input, revision: randomUUID() };
  delete settings.expectedRevision;
  if (settings.personalDirectory)
    settings.personalDirectory = resolve4(settings.personalDirectory);
  validate2(settings, true);
  const directory = await safeDirectory(project, [".incline"], true);
  const lockPath = join5(directory, ".design-settings.lock");
  const lock = await open3(lockPath, "wx", 384);
  const temporary = join5(directory, `.design-settings-${randomUUID()}.tmp`);
  try {
    const current = await readDesignSettings(project);
    if (current.revision !== previous.revision || Object.hasOwn(input, "expectedRevision") && input.expectedRevision !== current.revision)
      throw new Error(
        "Design settings changed; read the latest revision before updating"
      );
    await writeFile2(temporary, JSON.stringify(settings, null, 2) + "\n", {
      flag: "wx",
      mode: 384
    });
    await safeDirectory(project, [".incline"]);
    await rename2(temporary, join5(directory, "design-snapshot-settings.json"));
    return settings;
  } finally {
    await unlink2(temporary).catch(() => {
    });
    await lock.close();
    await unlink2(lockPath);
  }
}
async function captureConfiguredDesign(project, input, options = {}) {
  const settings = options.automatic ? await readDesignSettings(project) : null;
  const result = await captureDesign(project, input, options);
  if (!settings?.personalAutoSave)
    return { ...result, personalSave: { status: "not-enabled" } };
  if (options.localOnly)
    return {
      ...result,
      personalSave: { status: "skipped", reason: "local-only" }
    };
  if (options.library && resolve4(options.library) !== settings.personalDirectory)
    return {
      ...result,
      personalSave: {
        status: "skipped",
        reason: "Selected library differs from the opted-in directory; renew the setting to enable it."
      }
    };
  const beforePublish = async () => {
    const current = await readDesignSettings(project);
    if (current.revision !== settings.revision)
      throw Object.assign(
        new Error(
          "Settings changed during capture; retry with current consent."
        ),
        { code: "DESIGN_CONSENT_CHANGED" }
      );
    await assertPromptRecording(project);
  };
  try {
    await beforePublish();
    return {
      ...result,
      personalSave: await publishDesign(
        project,
        input.id,
        settings.personalDirectory,
        { beforePublish }
      )
    };
  } catch (error) {
    if (error.code === "DESIGN_CONSENT_CHANGED")
      return {
        ...result,
        personalSave: { status: "skipped", reason: error.message }
      };
    return {
      ...result,
      personalSave: { status: "failed", error: error.message }
    };
  }
}

// local/design-snapshots-cli.mjs
var usage = `Incline design snapshots
  capture --input FILE [--automatic] [--project DIR] [--local-only]
  read --id ID [--scope project|personal|imported]
  query [--text TEXT] [--tag TAG] [--limit 1..50] [--scope project|personal|imported]
  publish --id ID [--personal-dir DIR]
  import --id ID --relevance TEXT [--personal-dir DIR]
  settings [--input FILE]
All commands accept --project DIR and --local-only. Personal commands and capture
accept --personal-dir DIR; default personal store is ~/.incline/design-library.
Capture JSON names selected files relative to the input file. Automatic capture
requires active prompt recording and a reaction-linked satisfaction assessment.
Personal publication requires an explicit command or project opt-in.
`;
var common = ["--project", "--local-only"];
var allowed = {
  capture: [...common, "--input", "--automatic", "--personal-dir"],
  read: [...common, "--id", "--scope", "--personal-dir"],
  query: [...common, "--text", "--tag", "--limit", "--scope", "--personal-dir"],
  publish: [...common, "--id", "--personal-dir"],
  import: [...common, "--id", "--relevance", "--personal-dir"],
  settings: [...common, "--input"]
};
async function executeDesignCli(args, { cwd = process.cwd() } = {}) {
  if (args.length === 1 && args[0] === "--help") return usage;
  const [command, ...rest] = args;
  if (!allowed[command])
    throw new Error("Choose a design snapshot command; use --help");
  const flags = /* @__PURE__ */ new Map();
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    if (!allowed[command].includes(flag) || flags.has(flag))
      throw new Error(`Unknown or repeated option ${flag}`);
    if (["--automatic", "--local-only"].includes(flag)) {
      flags.set(flag, true);
      continue;
    }
    const value = rest[++index];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${flag}`);
    flags.set(flag, value);
  }
  for (const flag of {
    capture: ["--input"],
    read: ["--id"],
    publish: ["--id"],
    import: ["--id", "--relevance"]
  }[command] ?? [])
    if (!flags.has(flag)) throw new Error(`${command} requires ${flag}`);
  const scope = flags.get("--scope") ?? "project";
  if (!["project", "personal", "imported"].includes(scope))
    throw new Error("Invalid snapshot scope");
  const localOnly = flags.has("--local-only");
  if (localOnly && (flags.has("--personal-dir") || scope === "personal" || ["publish", "import"].includes(command)))
    throw new Error("--local-only forbids personal library access");
  if (flags.has("--limit") && (!/^[1-9]\d*$/.test(flags.get("--limit")) || Number(flags.get("--limit")) > 50))
    throw new Error("Limit must be 1\u201350");
  const { project } = await resolveOptions(
    flags.has("--project") ? ["--project", flags.get("--project")] : [],
    cwd
  );
  const id2 = flags.get("--id");
  const selectedLibrary = async () => flags.has("--personal-dir") ? resolve5(cwd, flags.get("--personal-dir")) : (await readDesignSettings(project)).personalDirectory ?? join6(homedir2(), ".incline", "design-library");
  if (command === "settings") {
    if (!flags.has("--input")) return readDesignSettings(project);
    const { input } = await readDesignInput(resolve5(cwd, flags.get("--input")));
    return saveDesignSettings(project, input, { localOnly });
  }
  if (command === "capture") {
    const { input, directory } = await readDesignInput(
      resolve5(cwd, flags.get("--input"))
    );
    return captureConfiguredDesign(project, input, {
      inputDirectory: directory,
      automatic: flags.has("--automatic"),
      localOnly,
      ...flags.has("--personal-dir") ? { library: resolve5(cwd, flags.get("--personal-dir")) } : {}
    });
  }
  if (command === "publish")
    return publishDesign(project, id2, await selectedLibrary(), { localOnly });
  if (command === "import")
    return importDesign(
      project,
      id2,
      await selectedLibrary(),
      flags.get("--relevance"),
      { localOnly }
    );
  const options = {
    scope,
    localOnly,
    ...scope === "personal" ? { library: await selectedLibrary() } : {}
  };
  if (command === "read") return readDesign(project, id2, options);
  return queryDesigns(project, {
    ...options,
    text: flags.get("--text") ?? "",
    ...flags.has("--tag") ? { tag: flags.get("--tag") } : {},
    limit: Number(flags.get("--limit") ?? 10)
  });
}
if (process.argv[1] && resolve5(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await executeDesignCli(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    if (result?.personalSave?.status === "failed") process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
export {
  executeDesignCli
};
