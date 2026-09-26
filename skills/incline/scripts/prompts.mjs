// local/prompts-cli.mjs
import { lstat as lstat3, open as open4, realpath as realpath3, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as dirname2, isAbsolute as isAbsolute3, join as join4, resolve as resolve3 } from "node:path";
import { fileURLToPath } from "node:url";

// local/prompts.mjs
import { constants as constants2 } from "node:fs";
import {
  lstat as lstat2,
  mkdir as mkdir2,
  mkdtemp,
  open as open3,
  opendir,
  realpath as realpath2,
  rename as rename2,
  rm,
  writeFile as writeFile2
} from "node:fs/promises";
import { createHash, randomUUID as randomUUID2 } from "node:crypto";
import { dirname, isAbsolute as isAbsolute2, join as join3, parse, resolve as resolve2, sep } from "node:path";

// local/assets.mjs
var maxAssetBytes = 8e6;
var maxGuideBytes = 2e5;
function markdownText(bytes) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.trim()) return false;
    for (const character of text) {
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
import { writeFile, rename, unlink, open as open2 } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isAbsolute, join as join2, resolve } from "node:path";

// local/exploration-files.mjs
import { lstat, realpath, mkdir, readdir, open } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
var MAX_JSON_BYTES = 1e6;
var MAX_ASSET_BYTES = 8 * 1024 * 1024;
function pathParts(relative) {
  if (typeof relative !== "string" || !relative || relative.includes("\\") || relative.includes("\0"))
    throw new Error("Unsafe relative path");
  const parts = relative.split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    throw new Error("Unsafe relative path");
  return parts;
}
async function safeDirectory(project, parts, create = false) {
  let current = await realpath(project);
  if (!(await lstat(current)).isDirectory())
    throw new Error("Project must be a directory");
  for (const part of parts) {
    pathParts(part);
    if (part.includes("/")) throw new Error("Unsafe directory component");
    current = join(current, part);
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
async function safeBytes(project, parts, maxBytes = MAX_JSON_BYTES) {
  const directory2 = await safeDirectory(project, parts.slice(0, -1));
  if (directory2 === null) return null;
  const name = parts.at(-1);
  pathParts(name);
  if (name.includes("/")) throw new Error("Unsafe file component");
  const path = join(directory2, name);
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

// local/prompt-settings.mjs
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
  const fields = saved ? [...editable, "version", "revision"] : [...editable, "expectedRevision"];
  if (Object.keys(value).some((key) => !fields.includes(key)))
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
async function savePromptSettings(project, input) {
  validate(input);
  const previous = await readPromptSettings(project);
  const merged = { ...previous, ...input };
  delete merged.expectedRevision;
  merged.revision = randomUUID();
  validate(merged, true);
  const directory2 = await safeDirectory(project, [".incline"], true);
  const lockPath = join2(directory2, ".prompt-settings.lock");
  let lock;
  try {
    lock = await open2(lockPath, "wx", 384);
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        "Prompt settings are being updated; retry after the current write finishes"
      );
    throw error;
  }
  const temp = join2(directory2, `.prompt-settings-${randomUUID()}.tmp`);
  try {
    const current = await readPromptSettings(project);
    if (current.revision !== previous.revision || Object.hasOwn(input, "expectedRevision") && input.expectedRevision !== current.revision)
      throw new Error(
        "Prompt settings changed; read the current settings before updating"
      );
    if (merged.personalDirectory)
      merged.personalDirectory = resolve(merged.personalDirectory);
    await writeFile(temp, JSON.stringify(merged, null, 2) + "\n", {
      flag: "wx",
      mode: 384
    });
    await safeDirectory(project, [".incline"]);
    await rename(temp, join2(directory2, "prompt-settings.json"));
    return merged;
  } finally {
    await unlink(temp).catch(() => {
    });
    await lock.close();
    await unlink(lockPath);
  }
}
async function assertPromptRecording(project) {
  if (!project || (await readPromptSettings(project)).recording !== "active")
    throw new Error(
      "Prompt recording must be active for new run or decision evidence"
    );
}

// local/prompts.mjs
var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var slug = /^[a-z0-9][a-z0-9_-]{0,63}$/;
var hashPattern = /^[0-9a-f]{64}$/;
var maxEntries = 1e3;
var maxRevisions = 100;
var maxMetadata = 1e6;
var maxPrompt = 3e5;
var maxAssets = 24;
var maxTotalAssets = 32e6;
var maxRuns = 1e3;
var media = {
  "text/markdown": "md",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
};
var origins = [
  "published",
  "user-authored",
  "agent-authored",
  "agent-reconstructed"
];
var provenances = [
  "user",
  "source-text",
  "inspected-visual",
  "agent-hypothesis"
];
var sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
var fail = (message, status = 400) => Object.assign(new Error(message), { status });
var has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function plain(value, name, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    throw fail(`${name} must be an object`);
  for (const field of Object.keys(value))
    if (!fields.includes(field)) throw fail(`${name}: unknown field ${field}`);
  return value;
}
function string(value, name, max, { empty = false } = {}) {
  if (typeof value !== "string" || Buffer.byteLength(value) > max || !empty && !value.trim() || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
    value
  ))
    throw fail(`Invalid ${name}`);
  return value;
}
function optionalString(value, name, max) {
  return value === void 0 ? null : value === null ? null : string(value, name, max);
}
function boundedList(value, name, max) {
  if (!Array.isArray(value) || value.length > max)
    throw fail(`Invalid ${name}`);
  return value;
}
function safeId(value, name = "ID") {
  if (typeof value !== "string" || !uuid.test(value))
    throw fail(`Invalid ${name}`);
  return value;
}
function safeSlug(value, name) {
  if (typeof value !== "string" || !slug.test(value))
    throw fail(`Invalid ${name}`);
  return value;
}
function revisionNumber(value) {
  if (!Number.isInteger(value) || value < 1 || value > maxRevisions)
    throw fail("Invalid revision");
  return value;
}
function revisionName(value) {
  return String(revisionNumber(value)).padStart(4, "0");
}
function exactKeys(value, fields, name) {
  return plain(value, name, fields);
}
function textList(value, name, count = 24, length = 240) {
  return boundedList(value ?? [], name, count).map(
    (item) => string(item, name, length)
  );
}
function normalizeSource(value) {
  const source = exactKeys(
    value ?? {},
    ["url", "author", "capturedAt", "license", "contentGap", "embedUrl"],
    "source"
  );
  const result = {};
  for (const key of ["url", "embedUrl"])
    if (source[key] !== void 0) {
      const url = string(source[key], `source ${key}`, 2e3);
      if (!/^https?:\/\//i.test(url))
        throw fail(`source ${key} must be an http(s) URL`);
      result[key] = url;
    }
  for (const key of ["author", "license", "contentGap"])
    if (source[key] !== void 0)
      result[key] = string(source[key], `source ${key}`, 500);
  if (source.capturedAt !== void 0) {
    string(source.capturedAt, "source capturedAt", 40);
    if (Number.isNaN(Date.parse(source.capturedAt)))
      throw fail("Invalid source capturedAt");
    result.capturedAt = source.capturedAt;
  }
  return result;
}
function normalizeTags(value) {
  const seen = /* @__PURE__ */ new Set();
  return boundedList(value ?? [], "tags", 40).map((tag) => {
    exactKeys(tag, ["facet", "value", "provenance"], "tag");
    const facet = safeSlug(tag.facet, "tag facet");
    const label = string(tag.value, "tag value", 100);
    if (!provenances.includes(tag.provenance))
      throw fail("Invalid tag provenance");
    const key = `${facet}\0${label.toLowerCase()}\0${tag.provenance}`;
    if (seen.has(key)) throw fail("Duplicate tag");
    seen.add(key);
    return { facet, value: label, provenance: tag.provenance };
  });
}
function normalizeRequirements(value) {
  const data = exactKeys(
    value ?? {},
    [
      "effect",
      "roles",
      "medium",
      "inputs",
      "tools",
      "runtime",
      "limitations",
      "unknowns",
      "checks"
    ],
    "requirements"
  );
  return {
    effect: optionalString(data.effect, "effect", 1e3),
    roles: textList(data.roles, "roles"),
    medium: optionalString(data.medium, "medium", 120),
    inputs: textList(data.inputs, "inputs"),
    tools: textList(data.tools, "tools"),
    runtime: optionalString(data.runtime, "runtime", 240),
    limitations: textList(data.limitations, "limitations"),
    unknowns: textList(data.unknowns, "unknowns"),
    checks: textList(data.checks, "checks")
  };
}
function normalizeNotes(value) {
  return boundedList(value ?? [], "notes", 30).map((item) => {
    exactKeys(item, ["text", "provenance"], "note");
    if (!provenances.includes(item.provenance))
      throw fail("Invalid note provenance");
    return {
      text: string(item.text, "note text", 3e3),
      provenance: item.provenance
    };
  });
}
function normalizeLink(value, name) {
  if (value === void 0 || value === null) return null;
  exactKeys(value, ["id", "revision", "promptSha256"], name);
  if (typeof value.promptSha256 !== "string" || !hashPattern.test(value.promptSha256))
    throw fail(`Invalid ${name} hash`);
  return {
    id: safeId(value.id, `${name} ID`),
    revision: revisionNumber(value.revision),
    promptSha256: value.promptSha256
  };
}
function normalizeRecipe(value) {
  if (value === void 0 || value === null) return null;
  exactKeys(value, ["stages"], "recipe");
  const stages = boundedList(value.stages, "recipe stages", 24).map((stage) => {
    exactKeys(
      stage,
      ["id", "role", "dependsOn", "inputs", "outputs", "checks"],
      "recipe stage"
    );
    return {
      id: safeSlug(stage.id, "stage ID"),
      role: string(stage.role, "stage role", 200),
      dependsOn: boundedList(
        stage.dependsOn ?? [],
        "stage dependencies",
        24
      ).map((id) => safeSlug(id, "stage dependency")),
      inputs: textList(stage.inputs, "stage inputs"),
      outputs: textList(stage.outputs, "stage outputs"),
      checks: textList(stage.checks, "stage checks")
    };
  });
  const ids = new Set(stages.map((stage) => stage.id));
  if (ids.size !== stages.length) throw fail("Duplicate recipe stage ID");
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const state = /* @__PURE__ */ new Map();
  function visit(id) {
    if (state.get(id) === "visiting") throw fail("Recipe dependency cycle");
    if (state.get(id) === "done") return;
    state.set(id, "visiting");
    for (const dep of byId.get(id).dependsOn) {
      if (!ids.has(dep)) throw fail(`Unknown recipe dependency ${dep}`);
      visit(dep);
    }
    state.set(id, "done");
  }
  for (const id of ids) visit(id);
  return { stages };
}
function normalizeEditable(input) {
  exactKeys(
    input,
    [
      "id",
      "baseRevision",
      "title",
      "prompt",
      "origin",
      "source",
      "tags",
      "requirements",
      "notes",
      "assets",
      "recipe",
      "parent",
      "copyOf"
    ],
    "prompt input"
  );
  const prompt = string(input.prompt, "prompt", maxPrompt, { empty: true });
  if (!prompt.length && !input.source?.contentGap)
    throw fail(
      "Empty prompt requires source.contentGap explaining unavailable text"
    );
  if (!origins.includes(input.origin)) throw fail("Invalid prompt origin");
  if (input.id !== void 0) safeId(input.id);
  if (input.baseRevision !== void 0) revisionNumber(input.baseRevision);
  if (has(input, "id") !== has(input, "baseRevision"))
    throw fail("Updates require id and baseRevision together");
  return {
    title: string(input.title, "title", 200),
    prompt,
    origin: input.origin,
    source: normalizeSource(input.source),
    tags: normalizeTags(input.tags),
    requirements: normalizeRequirements(input.requirements),
    notes: normalizeNotes(input.notes),
    recipe: normalizeRecipe(input.recipe),
    parent: normalizeLink(input.parent, "parent"),
    copyOf: normalizeLink(input.copyOf, "copyOf"),
    assets: boundedList(input.assets ?? [], "assets", maxAssets)
  };
}
async function safeExisting(path, { missing = false } = {}) {
  const absolute = resolve2(path);
  let current = parse(absolute).root;
  for (const segment of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join3(current, segment);
    let info;
    try {
      info = await lstat2(current);
    } catch (error) {
      if (missing && error.code === "ENOENT") return;
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
    if (!(await lstat2(path)).isDirectory())
      throw fail(`Expected a directory: ${path}`);
    return true;
  } catch (error) {
    if (missing && error.code === "ENOENT") return false;
    throw error;
  }
}
async function boundedRead(path, limit) {
  await safeExisting(dirname(path));
  let handle;
  try {
    handle = await open3(
      path,
      constants2.O_RDONLY | constants2.O_NOFOLLOW | constants2.O_NONBLOCK
    );
  } catch (error) {
    if (error.code === "ELOOP") throw fail(`Symbolic link refused: ${path}`);
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
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n");
  if (bytes.length > maxMetadata)
    throw fail("Prompt metadata exceeds 1 MB", 413);
  await writeFile2(path, bytes, { flag: "wx", mode: 384 });
}
async function withPublicationLock(folder, work) {
  const path = join3(folder, ".pending-publication.lock");
  let handle;
  try {
    handle = await open3(path, "wx", 384);
  } catch (error) {
    if (error.code === "EEXIST")
      throw fail("Prompt publication is in progress; retry the write", 409);
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
    if (item.name.startsWith(".pending-")) continue;
    if (!uuid.test(item.name) || !item.isDirectory())
      throw fail(`Unexpected ${kind} entry: ${item.name}`);
    if (++count >= limit) throw fail(`${kind} limit of ${limit} reached`, 413);
  }
}
function assetLimit(type) {
  return type === "text/markdown" ? maxGuideBytes : maxAssetBytes;
}
async function incomingAssets(items) {
  let total = 0;
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of items) {
    exactKeys(
      item,
      ["id", "path", "contentType", "missingReason", "bytes"],
      "asset"
    );
    const id = safeSlug(item.id, "asset ID");
    if (seen.has(id)) throw fail("Duplicate asset ID");
    seen.add(id);
    if (item.missingReason !== void 0) {
      if (item.path !== void 0 || item.bytes !== void 0 || item.contentType !== void 0)
        throw fail("Asset gap cannot include file data");
      result.push({
        descriptor: {
          id,
          missingReason: string(item.missingReason, "asset missingReason", 500)
        }
      });
      continue;
    }
    if (item.path === void 0 === (item.bytes === void 0))
      throw fail("Asset requires exactly one of path or bytes");
    const contentType = string(
      item.contentType,
      "asset contentType",
      80
    ).toLowerCase();
    if (!media[contentType])
      throw fail(`Unsupported asset type ${contentType}`, 415);
    let bytes;
    if (item.path !== void 0) {
      if (typeof item.path !== "string" || !isAbsolute2(item.path))
        throw fail("Asset path must be absolute");
      bytes = await boundedRead(item.path, assetLimit(contentType));
    } else {
      if (!Buffer.isBuffer(item.bytes))
        throw fail("Asset bytes must be a Buffer");
      bytes = item.bytes;
    }
    inspectAsset(bytes, contentType);
    total += bytes.length;
    if (total > maxTotalAssets) throw fail("Assets exceed 32 MB", 413);
    result.push({
      descriptor: {
        id,
        filename: `${id}.${media[contentType]}`,
        contentType,
        size: bytes.length,
        sha256: sha256(bytes)
      },
      bytes
    });
  }
  return result;
}
function validateMetadata(meta, id, revision) {
  exactKeys(
    meta,
    [
      "version",
      "id",
      "revision",
      "createdAt",
      "title",
      "origin",
      "source",
      "tags",
      "requirements",
      "notes",
      "recipe",
      "parent",
      "copyOf",
      "assets",
      "promptSha256",
      "metadataSha256"
    ],
    "revision metadata"
  );
  const { metadataSha256, ...body } = meta;
  if (typeof metadataSha256 !== "string" || metadataSha256 !== sha256(Buffer.from(JSON.stringify(body))))
    throw fail("Prompt metadata hash mismatch");
  if (!meta || meta.version !== 1 || meta.id !== id || meta.revision !== revision || !uuid.test(meta.id) || typeof meta.createdAt !== "string" || Number.isNaN(Date.parse(meta.createdAt)) || typeof meta.promptSha256 !== "string" || !hashPattern.test(meta.promptSha256))
    throw fail("Corrupt prompt revision metadata");
  normalizeEditable({
    title: meta.title,
    prompt: "x",
    origin: meta.origin,
    source: meta.source,
    tags: meta.tags,
    requirements: meta.requirements,
    notes: meta.notes,
    recipe: meta.recipe,
    parent: meta.parent,
    copyOf: meta.copyOf,
    assets: []
  });
  if (!Array.isArray(meta.assets) || meta.assets.length > maxAssets)
    throw fail("Corrupt asset manifest");
  const names = /* @__PURE__ */ new Set();
  for (const asset of meta.assets) {
    exactKeys(
      asset,
      ["id", "filename", "contentType", "size", "sha256", "missingReason"],
      "asset descriptor"
    );
    safeSlug(asset.id, "asset ID");
    if (names.has(asset.id)) throw fail("Duplicate asset descriptor");
    names.add(asset.id);
    if (asset.missingReason !== void 0) {
      if (asset.filename !== void 0 || asset.contentType !== void 0 || asset.size !== void 0 || asset.sha256 !== void 0)
        throw fail("Corrupt asset gap");
      string(asset.missingReason, "asset missingReason", 500);
    } else if (!media[asset.contentType] || asset.filename !== `${asset.id}.${media[asset.contentType]}` || !Number.isInteger(asset.size) || asset.size < 1 || asset.size > assetLimit(asset.contentType) || typeof asset.sha256 !== "string" || !hashPattern.test(asset.sha256))
      throw fail("Corrupt asset descriptor");
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
    promptAvailable: meta.promptSha256 !== sha256(Buffer.alloc(0))
  };
}
function normalizeRun(input, meta) {
  exactKeys(
    input,
    [
      "inputs",
      "tools",
      "artifacts",
      "execution",
      "inspection",
      "tester",
      "userReview",
      "stageId",
      "dependencies",
      "briefRevision",
      "planRevision"
    ],
    "run"
  );
  const inputs = boundedList(input.inputs ?? [], "run inputs", 24).map(
    (entry) => {
      exactKeys(entry, ["name", "value", "sha256"], "run input");
      const value = string(entry.value, "run input value", 1e4, {
        empty: true
      });
      if (entry.sha256 !== void 0 && entry.sha256 !== sha256(Buffer.from(value)))
        throw fail("Run input hash mismatch");
      return {
        name: safeSlug(entry.name, "run input name"),
        value,
        sha256: sha256(Buffer.from(value))
      };
    }
  );
  const tools = boundedList(input.tools ?? [], "run tools", 24).map((tool) => {
    exactKeys(tool, ["name", "version", "settings"], "run tool");
    return {
      name: string(tool.name, "tool name", 120),
      version: optionalString(tool.version, "tool version", 120),
      settings: optionalString(tool.settings, "tool settings", 2e3)
    };
  });
  function observation(value, name, statuses) {
    if (value === void 0 || value === null) return null;
    exactKeys(value, ["status", "notes", "evidence", "by"], name);
    if (!statuses.includes(value.status)) throw fail(`Invalid ${name} status`);
    const evidence = textList(value.evidence, `${name} evidence`, 20, 1e3);
    let by = null;
    if (name === "tester") {
      if (value.by !== void 0 && ![
        "agent-run",
        "author-reported",
        "user-reported",
        "user-observed"
      ].includes(value.by))
        throw fail("Invalid tester provenance");
      if (value.status !== "not-tested" && !value.by)
        throw fail("Tester result requires by provenance");
      by = value.by ?? null;
    } else if (value.by !== void 0) throw fail(`${name} cannot include by`);
    if (name === "userReview" && value.status !== "not-reviewed" && evidence.length === 0)
      throw fail("User review requires actual evidence text or locator");
    return {
      status: value.status,
      notes: optionalString(value.notes, `${name} notes`, 3e3),
      evidence,
      ...name === "tester" ? { by } : {}
    };
  }
  const stageId = input.stageId === void 0 ? null : safeSlug(input.stageId, "run stage ID");
  if (stageId && !meta.recipe?.stages.some((stage) => stage.id === stageId))
    throw fail("Run stage is absent from this revision");
  const dependencies = boundedList(
    input.dependencies ?? [],
    "run dependencies",
    24
  ).map((dep) => {
    exactKeys(dep, ["stageId", "runId"], "run dependency");
    return {
      stageId: safeSlug(dep.stageId, "dependency stage ID"),
      runId: safeId(dep.runId, "dependency run ID")
    };
  });
  if (dependencies.length && !stageId)
    throw fail("Run dependencies require a stage ID");
  if (stageId) {
    const stage = meta.recipe.stages.find((item) => item.id === stageId);
    const allowed = new Set(stage.dependsOn);
    for (const dep of dependencies)
      if (!allowed.has(dep.stageId))
        throw fail("Run dependency does not match recipe");
    if (new Set(dependencies.map((d) => d.stageId)).size !== dependencies.length)
      throw fail("Duplicate run dependency stage");
  }
  return {
    inputs,
    tools,
    artifacts: boundedList(input.artifacts ?? [], "run artifacts", 24),
    stageId,
    dependencies,
    briefRevision: optionalString(input.briefRevision, "brief revision", 120),
    planRevision: optionalString(input.planRevision, "plan revision", 120),
    execution: observation(input.execution, "execution", [
      "not-run",
      "succeeded",
      "failed",
      "partial"
    ]),
    inspection: observation(input.inspection, "inspection", [
      "not-inspected",
      "passed",
      "failed",
      "inconclusive"
    ]),
    tester: observation(input.tester, "tester", [
      "not-tested",
      "passed",
      "failed",
      "inconclusive"
    ]),
    userReview: observation(input.userReview, "userReview", [
      "not-reviewed",
      "positive",
      "negative",
      "mixed",
      "accepted"
    ])
  };
}
async function incomingRunArtifacts(items) {
  let total = 0;
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of items) {
    exactKeys(
      item,
      ["id", "path", "contentType", "locator", "missingReason"],
      "run artifact"
    );
    const id = safeSlug(item.id, "run artifact ID");
    if (seen.has(id)) throw fail("Duplicate run artifact ID");
    seen.add(id);
    const locator = item.locator === void 0 ? null : string(item.locator, "artifact locator", 2e3);
    if (item.path === void 0) {
      result.push({
        descriptor: {
          id,
          locator,
          missingReason: string(
            item.missingReason,
            "artifact missingReason",
            500
          )
        }
      });
      continue;
    }
    if (item.missingReason !== void 0)
      throw fail("Captured run artifact cannot have missingReason");
    if (typeof item.path !== "string" || !isAbsolute2(item.path))
      throw fail("Run artifact path must be absolute");
    const contentType = string(
      item.contentType,
      "run artifact contentType",
      80
    ).toLowerCase();
    if (!media[contentType])
      throw fail(
        `Unsupported run artifact type ${contentType}; record a missingReason for uncaptured media`,
        415
      );
    const bytes = await boundedRead(item.path, assetLimit(contentType));
    inspectAsset(bytes, contentType);
    total += bytes.length;
    if (total > maxTotalAssets) throw fail("Run artifacts exceed 32 MB", 413);
    result.push({
      descriptor: {
        id,
        locator,
        filename: `${id}.${media[contentType]}`,
        contentType,
        size: bytes.length,
        sha256: sha256(bytes)
      },
      bytes
    });
  }
  return result;
}
function createPromptStore(directoryPath, { projectDirectory, readOnly = false } = {}) {
  let root = resolve2(directoryPath);
  let project = projectDirectory === void 0 ? null : resolve2(projectDirectory);
  const requestedRoot = root;
  const requestedProject = project;
  let canonicalizing;
  async function canonicalizeRoot() {
    canonicalizing ??= (async () => {
      if (requestedProject && requestedRoot === join3(requestedProject, ".incline", "prompts")) {
        project = await realpath2(requestedProject);
        root = join3(project, ".incline", "prompts");
      } else {
        let parent = dirname(requestedRoot);
        const tail = [];
        while (true) {
          try {
            parent = join3(await realpath2(parent), ...tail.reverse());
            break;
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
            const next = dirname(parent);
            if (next === parent) throw error;
            tail.push(parent.slice(next.length + (next.endsWith(sep) ? 0 : 1)));
            parent = next;
          }
        }
        root = join3(
          parent,
          requestedRoot.slice(dirname(requestedRoot).length + 1)
        );
        if (requestedProject) project = await realpath2(requestedProject);
      }
    })();
    await canonicalizing;
  }
  async function ensureWritable() {
    await canonicalizeRoot();
    if (readOnly) throw fail("Prompt store is read-only", 403);
    await safeExisting(root, { missing: true });
    await mkdir2(root, { recursive: true, mode: 448 });
    await directory(root);
  }
  async function revisionFiles(id, revision) {
    await canonicalizeRoot();
    safeId(id);
    revisionNumber(revision);
    const path = join3(root, id, "revisions", revisionName(revision));
    try {
      await directory(path);
    } catch (error) {
      if (error.code === "ENOENT")
        throw fail(`Prompt ${id} revision ${revision} not found`, 404);
      throw error;
    }
    let meta;
    try {
      meta = JSON.parse(
        (await boundedRead(join3(path, "meta.json"), maxMetadata)).toString(
          "utf8"
        )
      );
    } catch (error) {
      if (error.code === "ENOENT" || error instanceof SyntaxError)
        throw fail(
          `Missing or corrupt prompt metadata for ${id} revision ${revision}`
        );
      throw error;
    }
    return { path, meta: validateMetadata(meta, id, revision) };
  }
  async function revisions(id) {
    await canonicalizeRoot();
    safeId(id);
    const path = join3(root, id, "revisions");
    if (!await directory(path, { missing: true })) return [];
    const values = [];
    const handle = await opendir(path);
    for await (const entry of handle) {
      if (entry.name.startsWith(".pending-")) continue;
      if (!/^\d{4}$/.test(entry.name) || !entry.isDirectory())
        throw fail(`Unexpected prompt revision entry: ${entry.name}`);
      const revision = Number(entry.name);
      revisionNumber(revision);
      values.push(revision);
      if (values.length > maxRevisions)
        throw fail("Prompt exceeds revision limit", 413);
    }
    return values.sort((a, b) => a - b);
  }
  async function latest(id) {
    const values = await revisions(id);
    if (!values.length) throw fail("Prompt not found", 404);
    return values.at(-1);
  }
  async function allLatest() {
    await canonicalizeRoot();
    if (!await directory(root, { missing: true })) return [];
    const entries = [];
    const handle = await opendir(root);
    for await (const item of handle) {
      if (item.name.startsWith(".pending-")) continue;
      if (!uuid.test(item.name) || !item.isDirectory())
        throw fail(`Unexpected prompt store entry: ${item.name}`);
      if (entries.length >= maxEntries)
        throw fail("Prompt store exceeds 1,000 entries", 413);
      const revision = await latest(item.name);
      entries.push(summary((await revisionFiles(item.name, revision)).meta));
    }
    return entries.sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
    );
  }
  async function read(id, revision) {
    const number = revision === void 0 ? await latest(id) : revisionNumber(revision);
    const { path, meta } = await revisionFiles(id, number);
    let promptBytes;
    try {
      promptBytes = await boundedRead(join3(path, "prompt.txt"), maxPrompt);
    } catch (error) {
      if (error.code === "ENOENT")
        throw fail(`Missing prompt text for ${id} revision ${number}`);
      throw error;
    }
    if (sha256(promptBytes) !== meta.promptSha256)
      throw fail(`Prompt text hash mismatch for ${id} revision ${number}`);
    let prompt;
    try {
      prompt = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true
      }).decode(promptBytes);
    } catch {
      throw fail("Prompt text is not UTF-8");
    }
    for (const descriptor of meta.assets)
      if (descriptor.filename) await asset(id, number, descriptor.id);
    return {
      ...meta,
      prompt,
      integrity: {
        promptSha256: meta.promptSha256,
        metadataSha256: meta.metadataSha256
      }
    };
  }
  async function asset(id, revision, assetId) {
    safeSlug(assetId, "asset ID");
    const { path, meta } = await revisionFiles(id, revisionNumber(revision));
    const descriptor = meta.assets.find((item) => item.id === assetId);
    if (!descriptor) throw fail("Prompt asset not found", 404);
    if (descriptor.missingReason)
      throw fail(`Prompt asset unavailable: ${descriptor.missingReason}`, 404);
    let bytes;
    try {
      bytes = await boundedRead(
        join3(path, "assets", descriptor.filename),
        assetLimit(descriptor.contentType)
      );
    } catch (error) {
      if (error.code === "ENOENT")
        throw fail(`Missing prompt asset ${assetId}`);
      throw error;
    }
    if (bytes.length !== descriptor.size || sha256(bytes) !== descriptor.sha256)
      throw fail(`Prompt asset hash mismatch: ${assetId}`);
    inspectAsset(bytes, descriptor.contentType);
    return { ...descriptor, bytes };
  }
  async function save(input) {
    const editable2 = normalizeEditable(input);
    const assets = await incomingAssets(editable2.assets);
    const id = input.id ?? randomUUID2();
    const previous = input.baseRevision ?? null;
    let revision = 1;
    if (previous !== null) {
      const current = await latest(id);
      if (current !== previous)
        throw fail(
          `Prompt ${id} changed; expected revision ${previous}, found ${current}`,
          409
        );
      if (current >= maxRevisions)
        throw fail("Prompt exceeds revision limit", 413);
      revision = current + 1;
    }
    const promptBytes = Buffer.from(editable2.prompt, "utf8");
    const meta = {
      version: 1,
      id,
      revision,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      title: editable2.title,
      origin: editable2.origin,
      source: editable2.source,
      tags: editable2.tags,
      requirements: editable2.requirements,
      notes: editable2.notes,
      recipe: editable2.recipe,
      parent: editable2.parent,
      copyOf: editable2.copyOf,
      assets: assets.map((item) => item.descriptor),
      promptSha256: sha256(promptBytes)
    };
    meta.metadataSha256 = sha256(Buffer.from(JSON.stringify(meta)));
    await ensureWritable();
    let staging;
    let destination;
    if (previous === null) {
      staging = await mkdtemp(join3(root, ".pending-"));
      destination = join3(root, id);
      await mkdir2(join3(staging, "revisions", revisionName(1)), {
        recursive: true,
        mode: 448
      });
    } else {
      await directory(join3(root, id, "revisions"));
      staging = await mkdtemp(join3(root, id, "revisions", ".pending-"));
      destination = join3(root, id, "revisions", revisionName(revision));
    }
    const payload = previous === null ? join3(staging, "revisions", revisionName(1)) : staging;
    try {
      await writeJson(join3(payload, "meta.json"), meta);
      await writeFile2(join3(payload, "prompt.txt"), promptBytes, {
        flag: "wx",
        mode: 384
      });
      if (assets.some((item) => item.bytes))
        await mkdir2(join3(payload, "assets"), { mode: 448 });
      for (const item of assets)
        if (item.bytes)
          await writeFile2(
            join3(payload, "assets", item.descriptor.filename),
            item.bytes,
            { flag: "wx", mode: 384 }
          );
      if (previous === null) {
        await withPublicationLock(root, async () => {
          await assertPublishedBelow(root, maxEntries, "Prompt entry");
          if (await directory(destination, { missing: true }))
            throw fail("Prompt entry already exists", 409);
          await rename2(staging, destination);
        });
      } else {
        if (await latest(id) !== previous)
          throw fail("Prompt changed before revision was published", 409);
        if (await directory(destination, { missing: true }))
          throw fail("Prompt revision already exists", 409);
        await rename2(staging, destination);
      }
    } catch (error) {
      if (["EEXIST", "ENOTEMPTY"].includes(error.code))
        throw fail("Prompt revision already exists", 409);
      throw error;
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    return read(id, revision);
  }
  async function query(options = {}) {
    exactKeys(options, ["text", "tags", "tagValue", "limit"], "query");
    const words = options.text === void 0 ? [] : string(options.text, "query text", 200).toLocaleLowerCase().split(/\s+/u).filter(Boolean).slice(0, 20);
    const tags = boundedList(options.tags ?? [], "query tags", 20).map(
      (tag) => {
        exactKeys(tag, ["facet", "value", "provenance"], "query tag");
        return {
          facet: safeSlug(tag.facet, "query tag facet"),
          value: string(tag.value, "query tag value", 100).toLocaleLowerCase(),
          provenance: tag.provenance === void 0 ? null : provenances.includes(tag.provenance) ? tag.provenance : (() => {
            throw fail("Invalid query provenance");
          })()
        };
      }
    );
    const tagValue = options.tagValue === void 0 ? null : string(options.tagValue, "query tag value", 100).toLocaleLowerCase();
    const limit = options.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw fail("Query limit must be 1\u201350");
    const candidates = await allLatest();
    return candidates.filter((entry) => {
      const haystack = [
        entry.title,
        entry.requirements.effect ?? "",
        entry.requirements.medium ?? "",
        ...entry.requirements.roles,
        ...entry.requirements.inputs,
        ...entry.requirements.tools,
        ...entry.tags.map((tag) => tag.value),
        entry.source.author ?? ""
      ].join(" ").toLocaleLowerCase();
      return words.every((word) => haystack.includes(word)) && tags.every(
        (wanted) => entry.tags.some(
          (tag) => tag.facet === wanted.facet && tag.value.toLocaleLowerCase() === wanted.value && (!wanted.provenance || tag.provenance === wanted.provenance)
        )
      ) && (!tagValue || entry.tags.some(
        (tag) => tag.value.toLocaleLowerCase() === tagValue
      ));
    }).slice(0, limit);
  }
  async function runs(id, revision) {
    await canonicalizeRoot();
    const number = revision === void 0 ? await latest(id) : revisionNumber(revision);
    await revisionFiles(id, number);
    const path = join3(root, id, "runs", revisionName(number));
    if (!await directory(path, { missing: true })) return [];
    const result = [];
    const handle = await opendir(path);
    for await (const item of handle) {
      if (item.name.startsWith(".pending-")) continue;
      if (!uuid.test(item.name) || !item.isDirectory())
        throw fail(`Unexpected prompt run entry: ${item.name}`);
      if (result.length >= maxRuns)
        throw fail("Prompt run limit exceeded", 413);
      let run;
      try {
        run = JSON.parse(
          (await boundedRead(join3(path, item.name, "record.json"), maxMetadata)).toString("utf8")
        );
      } catch (error) {
        if (error instanceof SyntaxError)
          throw fail(`Corrupt prompt run ${item.name}`);
        throw error;
      }
      if (run.version !== 1 || run.id !== item.name || run.promptId !== id || run.revision !== number || !Array.isArray(run.artifacts))
        throw fail(`Corrupt prompt run ${item.name}`);
      const { recordSha256, ...runBody } = run;
      if (typeof recordSha256 !== "string" || recordSha256 !== sha256(Buffer.from(JSON.stringify(runBody))) || typeof run.recordedAt !== "string" || Number.isNaN(Date.parse(run.recordedAt)))
        throw fail(`Run record hash mismatch: ${item.name}`);
      for (const artifact of run.artifacts) {
        safeSlug(artifact.id, "run artifact ID");
        if (artifact.missingReason) continue;
        if (!media[artifact.contentType] || artifact.filename !== `${artifact.id}.${media[artifact.contentType]}` || !Number.isInteger(artifact.size) || !hashPattern.test(artifact.sha256 ?? ""))
          throw fail(`Corrupt run artifact ${artifact.id}`);
        let bytes;
        try {
          bytes = await boundedRead(
            join3(path, item.name, "artifacts", artifact.filename),
            assetLimit(artifact.contentType)
          );
        } catch (error) {
          if (error.code === "ENOENT")
            throw fail(`Missing run artifact ${artifact.id}`);
          throw error;
        }
        if (bytes.length !== artifact.size || sha256(bytes) !== artifact.sha256)
          throw fail(`Run artifact hash mismatch: ${artifact.id}`);
      }
      result.push(run);
    }
    return result.sort(
      (a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id)
    );
  }
  async function saveRun(id, revision, input) {
    await canonicalizeRoot();
    if (readOnly) throw fail("Prompt store is read-only", 403);
    if (!project) throw fail("Run recording requires projectDirectory");
    if (root !== join3(project, ".incline", "prompts"))
      throw fail("Runs belong in the project-local prompt store");
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
      id: randomUUID2(),
      promptId: id,
      revision: number,
      promptSha256: meta.promptSha256,
      recordedAt: (/* @__PURE__ */ new Date()).toISOString(),
      ...data,
      artifacts: artifacts.map((item) => item.descriptor)
    };
    record.recordSha256 = sha256(Buffer.from(JSON.stringify(record)));
    const path = join3(root, id, "runs", revisionName(number));
    await safeExisting(path, { missing: true });
    await mkdir2(path, { recursive: true, mode: 448 });
    await directory(path);
    const staging = await mkdtemp(join3(path, ".pending-"));
    try {
      await writeJson(join3(staging, "record.json"), record);
      if (artifacts.some((item) => item.bytes))
        await mkdir2(join3(staging, "artifacts"), { mode: 448 });
      for (const item of artifacts)
        if (item.bytes)
          await writeFile2(
            join3(staging, "artifacts", item.descriptor.filename),
            item.bytes,
            { flag: "wx", mode: 384 }
          );
      await withPublicationLock(path, async () => {
        await assertPublishedBelow(path, maxRuns, "Prompt run");
        await assertPromptRecording(project);
        await rename2(staging, join3(path, record.id));
      });
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    return record;
  }
  async function runAsset(id, revision, runId, artifactId) {
    safeId(runId, "run ID");
    safeSlug(artifactId, "run artifact ID");
    const number = revisionNumber(revision);
    const record = (await runs(id, number)).find((item) => item.id === runId);
    if (!record) throw fail("Prompt run not found", 404);
    const descriptor = record.artifacts.find((item) => item.id === artifactId);
    if (!descriptor) throw fail("Run artifact not found", 404);
    if (descriptor.missingReason)
      throw fail(`Run artifact unavailable: ${descriptor.missingReason}`, 404);
    const bytes = await boundedRead(
      join3(
        root,
        id,
        "runs",
        revisionName(number),
        runId,
        "artifacts",
        descriptor.filename
      ),
      assetLimit(descriptor.contentType)
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
    runAsset
  };
}
async function copyPrompt(source, destination, id, revision) {
  const from = typeof source === "string" ? createPromptStore(source, { readOnly: true }) : source;
  const to = typeof destination === "string" ? createPromptStore(destination) : destination;
  if (!from?.read || !from?.asset || !to?.save)
    throw fail("copyPrompt requires prompt stores");
  const entry = await from.read(id, revision);
  const assets = [];
  for (const descriptor of entry.assets) {
    if (descriptor.missingReason)
      assets.push({
        id: descriptor.id,
        missingReason: descriptor.missingReason
      });
    else {
      const original = await from.asset(
        entry.id,
        entry.revision,
        descriptor.id
      );
      assets.push({
        id: descriptor.id,
        contentType: descriptor.contentType,
        bytes: original.bytes
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
      promptSha256: entry.promptSha256
    }
  });
}

// local/prompts-cli.mjs
var usage = `Incline prompt hub (local files only)
  save --input FILE [--project DIR] [--scope local|personal] [--personal-dir DIR]
  read --id ID [--revision N] [--project DIR] [--scope local|personal]
  list [--project DIR] [--scope local|personal]
  query [--text TEXT] [--tag FACET:VALUE[:PROVENANCE]] [--limit 1..50] [--scope local|personal]
  copy --id ID --from local|personal --to local|personal [--revision N]
  run --id ID --revision N --input FILE [--project DIR]
  runs --id ID [--revision N] [--project DIR]
  settings --input FILE [--project DIR]
Global: --local-only forbids personal scope and --personal-dir; --personal-dir selects a directory.
Inputs are JSON. Asset paths in a save file are resolved relative to that file.
`;
var commands = {
  save: ["--input", "--project", "--scope", "--personal-dir", "--local-only"],
  read: [
    "--id",
    "--revision",
    "--project",
    "--scope",
    "--personal-dir",
    "--local-only"
  ],
  list: ["--project", "--scope", "--personal-dir", "--local-only"],
  query: [
    "--text",
    "--tag",
    "--limit",
    "--project",
    "--scope",
    "--personal-dir",
    "--local-only"
  ],
  copy: [
    "--id",
    "--revision",
    "--from",
    "--to",
    "--project",
    "--personal-dir",
    "--local-only"
  ],
  run: ["--id", "--revision", "--input", "--project", "--local-only"],
  runs: ["--id", "--revision", "--project", "--local-only"],
  settings: ["--input", "--project", "--local-only"]
};
function parse2(args) {
  if (args.length === 0 || args.includes("--help")) {
    if (args.length > 1 || args.length === 1 && args[0] !== "--help")
      throw new Error("Use --help by itself");
    return { help: true };
  }
  const [command, ...rest] = args;
  const allowed = commands[command];
  if (!allowed) throw new Error(`Unknown command ${command}. Use --help.`);
  const options = /* @__PURE__ */ new Map();
  const tags = [];
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    if (!allowed.includes(flag))
      throw new Error(`Unknown option ${flag} for ${command}`);
    if (flag === "--local-only") {
      if (options.has(flag)) throw new Error(`Repeated option ${flag}`);
      options.set(flag, true);
      continue;
    }
    const value = rest[++index];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${flag}`);
    if (flag === "--tag") tags.push(value);
    else {
      if (options.has(flag)) throw new Error(`Repeated option ${flag}`);
      options.set(flag, value);
    }
  }
  const required = {
    save: ["--input"],
    read: ["--id"],
    copy: ["--id", "--from", "--to"],
    run: ["--id", "--revision", "--input"],
    runs: ["--id"],
    settings: ["--input"]
  }[command] ?? [];
  for (const flag of required)
    if (!options.has(flag)) throw new Error(`${command} requires ${flag}`);
  for (const flag of ["--scope", "--from", "--to"])
    if (options.has(flag) && !["local", "personal"].includes(options.get(flag)))
      throw new Error(`${flag} must be local or personal`);
  if (options.has("--local-only") && (options.has("--personal-dir") || ["--scope", "--from", "--to"].some(
    (flag) => options.get(flag) === "personal"
  )))
    throw new Error("--local-only forbids personal library access");
  if (options.has("--revision") && !/^[1-9]\d*$/.test(options.get("--revision")))
    throw new Error("--revision must be a positive integer");
  if (options.has("--limit") && (!/^[1-9]\d*$/.test(options.get("--limit")) || Number(options.get("--limit")) > 50))
    throw new Error("--limit must be 1\u201350");
  return { command, options, tags };
}
async function projectRoot(cwd) {
  const start = await realpath3(cwd);
  let current = start;
  while (true) {
    try {
      const marker = await stat(join4(current, ".git"));
      if (marker.isDirectory() || marker.isFile()) return current;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = dirname2(current);
    if (parent === current) return start;
    current = parent;
  }
}
async function inputJson(path) {
  const info = await lstat3(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1e6)
    throw new Error("Input must be a regular JSON file under 1 MB");
  const handle = await open4(path, "r");
  try {
    const bytes = await handle.readFile();
    if (bytes.length > 1e6) throw new Error("Input exceeds 1 MB");
    return JSON.parse(bytes.toString("utf8"));
  } finally {
    await handle.close();
  }
}
function tagOption(value) {
  const [facet, label, provenance, extra] = value.split(":");
  if (!facet || !label || extra !== void 0)
    throw new Error("--tag requires FACET:VALUE[:PROVENANCE]");
  return {
    facet,
    value: label,
    ...provenance === void 0 ? {} : { provenance }
  };
}
async function executePromptCli(args, { cwd = process.cwd() } = {}) {
  const parsed = parse2(args);
  if (parsed.help) return usage;
  const { command, options, tags } = parsed;
  const project = options.has("--project") ? resolve3(cwd, options.get("--project")) : await projectRoot(cwd);
  const local = createPromptStore(join4(project, ".incline", "prompts"), {
    projectDirectory: project
  });
  let personal;
  async function selectedPersonal() {
    if (options.has("--local-only"))
      throw new Error("--local-only forbids personal library access");
    if (personal) return personal;
    const configured = await readPromptSettings(project);
    const selected = options.has("--personal-dir") ? resolve3(cwd, options.get("--personal-dir")) : configured.personalDirectory ?? join4(homedir(), ".incline", "prompt-library");
    if (!isAbsolute3(selected))
      throw new Error("Personal prompt directory must be absolute");
    personal = createPromptStore(selected);
    return personal;
  }
  async function scope(which) {
    return which === "personal" ? selectedPersonal() : local;
  }
  const current = () => scope(options.get("--scope") ?? "local");
  const id = options.get("--id");
  const revision = options.has("--revision") ? Number(options.get("--revision")) : void 0;
  if (command === "settings") {
    const input = await inputJson(resolve3(cwd, options.get("--input")));
    return savePromptSettings(project, input);
  }
  if (command === "save") {
    const path = resolve3(cwd, options.get("--input"));
    const input = await inputJson(path);
    if (input && Array.isArray(input.assets))
      input.assets = input.assets.map(
        (asset) => asset?.path && typeof asset.path === "string" ? { ...asset, path: resolve3(dirname2(path), asset.path) } : asset
      );
    return (await current()).save(input);
  }
  if (command === "read") return (await current()).read(id, revision);
  if (command === "list") return (await current()).list();
  if (command === "query")
    return (await current()).query({
      ...options.has("--text") ? { text: options.get("--text") } : {},
      tags: tags.map(tagOption),
      ...options.has("--limit") ? { limit: Number(options.get("--limit")) } : {}
    });
  if (command === "copy")
    return copyPrompt(
      await scope(options.get("--from")),
      await scope(options.get("--to")),
      id,
      revision
    );
  if (command === "run") {
    const path = resolve3(cwd, options.get("--input"));
    const input = await inputJson(path);
    if (input && Array.isArray(input.artifacts))
      input.artifacts = input.artifacts.map(
        (artifact) => artifact?.path && typeof artifact.path === "string" ? { ...artifact, path: resolve3(dirname2(path), artifact.path) } : artifact
      );
    return local.saveRun(id, revision, input);
  }
  if (command === "runs") return local.runs(id, revision);
  throw new Error("Unsupported command");
}
if (process.argv[1] && resolve3(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(
      JSON.stringify(await executePromptCli(process.argv.slice(2)), null, 2)
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
export {
  executePromptCli
};
