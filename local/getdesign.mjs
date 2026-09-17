import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { inspectAsset, maxGuideBytes } from './assets.mjs';

const repository = 'https://github.com/VoltAgent/awesome-design-md';
const api = 'https://api.github.com/repos/VoltAgent/awesome-design-md';
const raw = 'https://raw.githubusercontent.com/VoltAgent/awesome-design-md';
const validSlug = (value) =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value);
const validRevision = (value) =>
  typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

export function createGetDesign({ fetch: request = globalThis.fetch } = {}) {
  async function bytes(url, limit = 1_000_000) {
    let response;
    try {
      response = await request(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Incline-public-design-guides',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new Error(
        'Could not reach the public design collection. Retry later or import a guide file you already have.',
        { cause: error },
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (
        response.status === 429 ||
        (response.status === 403 &&
          response.headers.get('x-ratelimit-remaining') === '0')
      )
        throw new Error(
          'The public GitHub rate limit was reached. Retry later or import a local guide; no paid upgrade is required by Incline.',
        );
      if (response.status === 404)
        throw new Error(
          'This guide or revision is not in the public collection. Use list to choose an available slug.',
        );
      throw new Error(
        `Public collection request failed (HTTP ${response.status}).`,
      );
    }
    if (
      !response.body ||
      response.headers.get('content-type')?.includes('text/html')
    ) {
      await response.body?.cancel();
      throw new Error(
        'The public source did not return a guide or catalog document.',
      );
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit)
        throw new Error(
          `Public source document exceeds the ${limit}-byte limit.`,
        );
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async function json(url) {
    return JSON.parse((await bytes(url)).toString('utf8'));
  }
  async function revision(requested) {
    if (requested !== undefined) {
      if (!validRevision(requested))
        throw new Error(
          'Use a full 40-character commit revision from the public catalog.',
        );
      return requested;
    }
    const head = await json(`${api}/git/ref/heads/main`);
    if (head?.object?.type !== 'commit' || !validRevision(head.object.sha))
      throw new Error('The public catalog returned an invalid revision.');
    return head.object.sha;
  }

  return {
    async list(query = '') {
      if (typeof query !== 'string' || query.length > 300)
        throw new Error('Use a search query up to 300 characters.');
      const sha = await revision();
      const entries = await json(`${api}/contents/design-md?ref=${sha}`);
      if (!Array.isArray(entries))
        throw new Error('The public catalog returned an invalid listing.');
      const readme = (await bytes(`${raw}/${sha}/README.md`)).toString('utf8');
      const descriptions = new Map();
      for (const line of readme.split('\n')) {
        const match =
          /^\s*[-*]\s+\[([^\]]+)\]\(https:\/\/getdesign\.md\/([a-z0-9._-]+)\/design-md\/?\)\s*[-–—]\s*(.+)$/i.exec(
            line,
          );
        if (match)
          descriptions.set(match[2], {
            name: match[1].replaceAll('*', ''),
            description: match[3].trim(),
          });
      }
      const all = entries
        .filter((entry) => entry?.type === 'dir' && validSlug(entry.name))
        .map((entry) => ({
          slug: entry.name,
          name: descriptions.get(entry.name)?.name ?? entry.name,
          description: descriptions.get(entry.name)?.description ?? '',
          url: `https://getdesign.md/${entry.name}/design-md`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
      return {
        provider: 'getdesign.md',
        revision: sha,
        total: all.length,
        query: query.trim(),
        designs: all.filter((entry) =>
          words.every((word) =>
            `${entry.slug} ${entry.name} ${entry.description}`
              .toLowerCase()
              .includes(word),
          ),
        ),
      };
    },
    async fetchGuide(slug, { project, revision: requested } = {}) {
      if (!validSlug(slug))
        throw new Error(
          'Use a public catalog slug such as wired or dell-1996.',
        );
      if (typeof project !== 'string' || !project)
        throw new Error('A project directory is required.');
      const root = await realpath(resolve(project));
      const sha = await revision(requested);
      const guide = await bytes(
        `${raw}/${sha}/design-md/${slug}/DESIGN.md`,
        maxGuideBytes,
      );
      inspectAsset(guide, 'text/markdown');
      const license = await bytes(`${raw}/${sha}/LICENSE`, maxGuideBytes);
      inspectAsset(license, 'text/markdown');
      const sourceUrl = `${repository}/blob/${sha}/design-md/${slug}/DESIGN.md`;
      const parent = join(root, '.incline', 'sources', 'getdesign');
      await mkdir(parent, { recursive: true, mode: 0o700 });
      const directory = await mkdtemp(
        join(parent, `${slug}-${sha.slice(0, 12)}-`),
      );
      const result = {
        event: 'downloaded',
        provider: 'getdesign.md',
        slug,
        revision: sha,
        sourceUrl,
        guidePath: join(directory, 'DESIGN.md'),
        licensePath: join(directory, 'LICENSE'),
        provenancePath: join(directory, 'provenance.json'),
        inputPath: join(directory, 'collection.json'),
      };
      const provenance = {
        provider: result.provider,
        repository,
        slug,
        revision: sha,
        sourceUrl,
        catalogUrl: `https://getdesign.md/${slug}/design-md`,
        licenseUrl: `${repository}/blob/${sha}/LICENSE`,
        sha256: createHash('sha256').update(guide).digest('hex'),
        retrievedAt: new Date().toISOString(),
      };
      const input = {
        name: `getdesign.md · ${slug}`.slice(0, 80),
        references: [
          {
            file: 'DESIGN.md',
            title: `${slug} · getdesign.md`,
            sourceUrl,
            note: '',
          },
        ],
      };
      try {
        const options = { flag: 'wx', mode: 0o600 };
        await writeFile(result.guidePath, guide, options);
        await writeFile(result.licensePath, license, options);
        await writeFile(
          result.provenancePath,
          JSON.stringify(provenance, null, 2) + '\n',
          options,
        );
        await writeFile(
          result.inputPath,
          JSON.stringify(input, null, 2) + '\n',
          options,
        );
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
      }
      return result;
    },
  };
}
