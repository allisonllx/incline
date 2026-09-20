// local/feedback-cli.mjs
import { readFile as readFile2, stat as stat3 } from "node:fs/promises";
import { dirname as dirname2 } from "node:path";

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

// local/feedback.mjs
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rename,
  rm,
  stat as stat2
} from "node:fs/promises";
import { join as join2, resolve as resolve2, extname } from "node:path";
import { createHash } from "node:crypto";
var digest = (data) => createHash("sha256").update(data).digest("hex");
var fail = (message) => {
  throw new Error(`Invalid feedback: ${message}`);
};
function object(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("expected object");
  for (const key of Object.keys(value))
    if (!fields.includes(key)) fail(`unknown field ${key}`);
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
      "artifactIds"
    ]);
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
      text(event[field], field);
    if (event.occurredAt !== null && (typeof event.occurredAt !== "string" || Number.isNaN(Date.parse(event.occurredAt))))
      fail("occurredAt must be a known timestamp or null");
    list(event.artifactIds, "artifact references", 24);
    if (event.artifactIds.some((value) => !artifactIds.has(value)))
      fail("unknown artifact reference");
  }
  return data;
}
async function readFeedback(project) {
  const directory = join2(project, ".incline", "feedback");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return { directory, batches: [] };
    throw error;
  }
  const batches = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".pending-")) continue;
    id(entry.name);
    if (!entry.isDirectory()) fail(`unexpected journal entry ${entry.name}`);
    const saved = JSON.parse(
      await readFile(join2(directory, entry.name, "record.json"), "utf8")
    );
    if (saved.version !== 1 || saved.id !== entry.name || !Array.isArray(saved.events) || !Array.isArray(saved.artifacts))
      fail(`unreadable record ${entry.name}`);
    validateBatch({
      id: saved.id,
      mode: saved.mode,
      coverage: saved.coverage,
      events: saved.events,
      artifacts: saved.artifacts.map((artifact) => {
        const { snapshot, sha256, ...original } = artifact;
        if (original.path && (typeof snapshot !== "string" || typeof sha256 !== "string"))
          fail("missing snapshot metadata");
        return original;
      })
    });
    if (typeof saved.recordedAt !== "string" || Number.isNaN(Date.parse(saved.recordedAt)))
      fail("invalid recordedAt");
    for (const artifact of saved.artifacts) {
      if (!artifact.snapshot) continue;
      if (!/^assets\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/.test(artifact.snapshot))
        fail("invalid snapshot path");
      const bytes = await readFile(
        join2(directory, entry.name, artifact.snapshot)
      );
      if (digest(bytes) !== artifact.sha256)
        fail(`snapshot changed: ${artifact.id}`);
    }
    batches.push(saved);
  }
  batches.sort(
    (a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id)
  );
  return { directory, batches };
}
async function recordFeedback(project, input, inputDirectory) {
  const data = validateBatch(input);
  if (!(await stat2(project)).isDirectory()) fail("project must be a directory");
  const directory = join2(project, ".incline", "feedback");
  const destination = join2(directory, data.id);
  const inputHash = digest(JSON.stringify(data));
  async function existing() {
    try {
      const saved = JSON.parse(
        await readFile(join2(destination, "record.json"), "utf8")
      );
      if (saved.inputHash !== inputHash)
        throw new Error(
          `Feedback ${data.id} already exists with different evidence; use a new ID for corrections.`
        );
      return {
        status: "already-recorded",
        recordPath: join2(destination, "record.json")
      };
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  const prior = await existing();
  if (prior) return prior;
  await mkdir(directory, { recursive: true });
  const staging = await mkdtemp(join2(directory, ".pending-"));
  try {
    const artifacts = [];
    let totalBytes = 0;
    for (const artifact of data.artifacts) {
      if (!artifact.path) {
        artifacts.push(artifact);
        continue;
      }
      const source = resolve2(inputDirectory, artifact.path);
      const info = await stat2(source);
      if (!info.isFile() || info.size > 8 * 1024 * 1024)
        fail("artifact must be a file of at most 8 MB");
      const bytes = await readFile(source);
      totalBytes += bytes.length;
      if (bytes.length > 8 * 1024 * 1024 || totalBytes > 32 * 1024 * 1024)
        fail("snapshot size limit exceeded");
      const extension = extname(source);
      const snapshot = `assets/${artifact.id}${/^\.[a-zA-Z0-9]{1,10}$/.test(extension) ? extension : ""}`;
      await mkdir(join2(staging, "assets"), { recursive: true });
      await writeFile(join2(staging, snapshot), bytes, {
        flag: "wx",
        mode: 384
      });
      artifacts.push({
        ...artifact,
        path: source,
        snapshot,
        sha256: digest(bytes)
      });
    }
    const record = {
      version: 1,
      ...data,
      artifacts,
      inputHash,
      recordedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await writeFile(
      join2(staging, "record.json"),
      JSON.stringify(record, null, 2) + "\n",
      { flag: "wx", mode: 384 }
    );
    try {
      await rename(staging, destination);
    } catch (error) {
      if (["EEXIST", "ENOTEMPTY"].includes(error.code)) {
        const result = await existing();
        if (result) return result;
      }
      throw error;
    }
    return { status: "recorded", recordPath: join2(destination, "record.json") };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

// local/feedback-cli.mjs
try {
  const [command, ...args] = process.argv.slice(2);
  if (["--help", "-h"].includes(command)) {
    console.log(
      "Incline feedback journal\n  feedback.mjs record --input <batch.json> [--project <directory>]\n  feedback.mjs read [--project <directory>]\nRecords project-local evidence; never scans conversations or updates preferences automatically."
    );
  } else {
    if (!["record", "read"].includes(command))
      throw new Error("Choose record or read; use --help for usage.");
    if (args.some((arg) => ["--library-dir", "--local-only"].includes(arg)))
      throw new Error("Feedback is always project-local.");
    const options = await resolveOptions(args);
    let result;
    if (command === "record") {
      if (!options.input) throw new Error("record requires --input");
      if ((await stat3(options.input)).size > 1024 * 1024)
        throw new Error("Input exceeds 1 MB");
      const input = JSON.parse(await readFile2(options.input, "utf8"));
      result = await recordFeedback(
        options.project,
        input,
        dirname2(options.input)
      );
    } else {
      if (options.input) throw new Error("read does not accept --input");
      result = await readFeedback(options.project);
    }
    console.log(JSON.stringify(result));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
