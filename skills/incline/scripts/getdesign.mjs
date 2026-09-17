// local/getdesign.mjs
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

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

// local/getdesign.mjs
var repository = "https://github.com/VoltAgent/awesome-design-md";
var api = "https://api.github.com/repos/VoltAgent/awesome-design-md";
var raw = "https://raw.githubusercontent.com/VoltAgent/awesome-design-md";
var validSlug = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value);
var validRevision = (value) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
function createGetDesign({ fetch: request = globalThis.fetch } = {}) {
  async function bytes(url, limit = 1e6) {
    let response;
    try {
      response = await request(url, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Incline-public-design-guides"
        },
        redirect: "error",
        signal: AbortSignal.timeout(15e3)
      });
    } catch (error) {
      throw new Error(
        "Could not reach the public design collection. Retry later or import a guide file you already have.",
        { cause: error }
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429 || response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
        throw new Error(
          "The public GitHub rate limit was reached. Retry later or import a local guide; no paid upgrade is required by Incline."
        );
      if (response.status === 404)
        throw new Error(
          "This guide or revision is not in the public collection. Use list to choose an available slug."
        );
      throw new Error(
        `Public collection request failed (HTTP ${response.status}).`
      );
    }
    if (!response.body || response.headers.get("content-type")?.includes("text/html")) {
      await response.body?.cancel();
      throw new Error(
        "The public source did not return a guide or catalog document."
      );
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit)
        throw new Error(
          `Public source document exceeds the ${limit}-byte limit.`
        );
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async function json(url) {
    return JSON.parse((await bytes(url)).toString("utf8"));
  }
  async function revision(requested) {
    if (requested !== void 0) {
      if (!validRevision(requested))
        throw new Error(
          "Use a full 40-character commit revision from the public catalog."
        );
      return requested;
    }
    const head = await json(`${api}/git/ref/heads/main`);
    if (head?.object?.type !== "commit" || !validRevision(head.object.sha))
      throw new Error("The public catalog returned an invalid revision.");
    return head.object.sha;
  }
  return {
    async list(query = "") {
      if (typeof query !== "string" || query.length > 300)
        throw new Error("Use a search query up to 300 characters.");
      const sha = await revision();
      const entries = await json(`${api}/contents/design-md?ref=${sha}`);
      if (!Array.isArray(entries))
        throw new Error("The public catalog returned an invalid listing.");
      const readme = (await bytes(`${raw}/${sha}/README.md`)).toString("utf8");
      const descriptions = /* @__PURE__ */ new Map();
      for (const line of readme.split("\n")) {
        const match = /^\s*[-*]\s+\[([^\]]+)\]\(https:\/\/getdesign\.md\/([a-z0-9._-]+)\/design-md\/?\)\s*[-–—]\s*(.+)$/i.exec(
          line
        );
        if (match)
          descriptions.set(match[2], {
            name: match[1].replaceAll("*", ""),
            description: match[3].trim()
          });
      }
      const all = entries.filter((entry) => entry?.type === "dir" && validSlug(entry.name)).map((entry) => ({
        slug: entry.name,
        name: descriptions.get(entry.name)?.name ?? entry.name,
        description: descriptions.get(entry.name)?.description ?? "",
        url: `https://getdesign.md/${entry.name}/design-md`
      })).sort((a, b) => a.name.localeCompare(b.name));
      const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
      return {
        provider: "getdesign.md",
        revision: sha,
        total: all.length,
        query: query.trim(),
        designs: all.filter(
          (entry) => words.every(
            (word) => `${entry.slug} ${entry.name} ${entry.description}`.toLowerCase().includes(word)
          )
        )
      };
    },
    async fetchGuide(slug, { project, revision: requested } = {}) {
      if (!validSlug(slug))
        throw new Error(
          "Use a public catalog slug such as wired or dell-1996."
        );
      if (typeof project !== "string" || !project)
        throw new Error("A project directory is required.");
      const root = await realpath(resolve(project));
      const sha = await revision(requested);
      const guide = await bytes(
        `${raw}/${sha}/design-md/${slug}/DESIGN.md`,
        maxGuideBytes
      );
      inspectAsset(guide, "text/markdown");
      const license = await bytes(`${raw}/${sha}/LICENSE`, maxGuideBytes);
      inspectAsset(license, "text/markdown");
      const sourceUrl = `${repository}/blob/${sha}/design-md/${slug}/DESIGN.md`;
      const parent = join(root, ".incline", "sources", "getdesign");
      await mkdir(parent, { recursive: true, mode: 448 });
      const directory = await mkdtemp(
        join(parent, `${slug}-${sha.slice(0, 12)}-`)
      );
      const result = {
        event: "downloaded",
        provider: "getdesign.md",
        slug,
        revision: sha,
        sourceUrl,
        guidePath: join(directory, "DESIGN.md"),
        licensePath: join(directory, "LICENSE"),
        provenancePath: join(directory, "provenance.json"),
        inputPath: join(directory, "collection.json")
      };
      const provenance = {
        provider: result.provider,
        repository,
        slug,
        revision: sha,
        sourceUrl,
        catalogUrl: `https://getdesign.md/${slug}/design-md`,
        licenseUrl: `${repository}/blob/${sha}/LICENSE`,
        sha256: createHash("sha256").update(guide).digest("hex"),
        retrievedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const input = {
        name: `getdesign.md \xB7 ${slug}`.slice(0, 80),
        references: [
          {
            file: "DESIGN.md",
            title: `${slug} \xB7 getdesign.md`,
            sourceUrl,
            note: ""
          }
        ]
      };
      try {
        const options = { flag: "wx", mode: 384 };
        await writeFile(result.guidePath, guide, options);
        await writeFile(result.licensePath, license, options);
        await writeFile(
          result.provenancePath,
          JSON.stringify(provenance, null, 2) + "\n",
          options
        );
        await writeFile(
          result.inputPath,
          JSON.stringify(input, null, 2) + "\n",
          options
        );
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
      }
      return result;
    }
  };
}

// local/getdesign-cli.mjs
var help = `Incline \u2014 optional public getdesign.md references

node getdesign.mjs list ["search words"]
node getdesign.mjs fetch <slug> --project /absolute/project [--revision <commit>]

Search matches names and descriptions in the public GitHub collection.
Fetch keeps the original guide, license and provenance under .incline/sources/.
It prints an inputPath for incline.mjs --project <project> --input <inputPath>.
No taste profile is changed until the collection is saved in Incline.
This optional helper needs internet access. It requires no MCP, account or key.
`;
var args = process.argv.slice(2);
try {
  const client = createGetDesign();
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(help);
  } else if (args[0] === "list" && args.length <= 2) {
    console.log(JSON.stringify(await client.list(args[1]), null, 2));
  } else if (args[0] === "fetch" && args[1]) {
    const options = {};
    for (let index = 2; index < args.length; index += 2) {
      const flag = args[index];
      const value = args[index + 1];
      if (!["--project", "--revision"].includes(flag) || !value || value.startsWith("--") || options[flag.slice(2)] !== void 0)
        throw new Error(help);
      options[flag.slice(2)] = value;
    }
    if (!options.project) throw new Error(help);
    console.log(
      JSON.stringify(await client.fetchGuide(args[1], options), null, 2)
    );
  } else {
    throw new Error(help);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
