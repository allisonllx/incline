import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  unlink,
  open,
  realpath,
  access,
  rm,
} from 'node:fs/promises';
import { resolve, join, extname, sep, basename } from 'node:path';
import { exportMarkdown } from '../lib/taste.ts';
import { validate } from './sessions.mjs';
import { createLibrary } from './library.mjs';
import { homedir } from 'node:os';
import {
  assetMime,
  assetName,
  loadAsset,
  readRaw,
  storeAsset,
  storeNamedAsset,
} from './assets.mjs';
import { prepareImport } from './import.mjs';

function failure(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

async function requireAssets(sessions, directory) {
  for (const session of sessions)
    for (const reference of session.collection?.references ?? [])
      if (reference.kind === 'image' || reference.kind === 'guide') {
        if (!assetName(reference.asset))
          throw failure('Invalid asset reference');
        try {
          await access(join(directory, reference.asset));
        } catch {
          throw failure(`Missing asset: ${reference.asset}`);
        }
      }
}
async function atomic(path, data) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, data, { mode: 0o600, flag: 'wx' });
    await rename(temp, path);
  } catch (e) {
    await unlink(temp).catch(() => {});
    throw e;
  }
}
async function saved(path) {
  try {
    const data = JSON.parse(await readFile(path, 'utf8'));
    if (data.version !== 1) throw new Error('Unknown version');
    return { ...data, sessions: validate(data.sessions) };
  } catch (e) {
    if (e.code === 'ENOENT') return { version: 1, sessions: [] };
    throw new Error(
      `Cannot read saved data at ${path}. Preserve it and repair or restore a revision before continuing.`,
      { cause: e },
    );
  }
}
function merge(previous, incoming) {
  const all = new Map(previous.map((s) => [s.id, s]));
  for (const s of incoming) all.set(s.id, s);
  return [...all.values()];
}
function body(req) {
  return new Promise((resolve, reject) => {
    let size = 0,
      text = '',
      tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
        tooLarge = true;
        text = '';
      } else if (!tooLarge) text += chunk;
    });
    req.on('end', () => {
      if (tooLarge) return reject(failure('Request too large', 413));
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(failure('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

export async function startServer({
  project,
  ui,
  closeAfterFinish = true,
  onFinish = () => {},
  idleMs = 30 * 60 * 1000,
  input,
  libraryDirectory = join(homedir(), '.incline', 'library'),
} = {}) {
  const root = await realpath(resolve(project));
  const personalDirectory =
    libraryDirectory === null ? null : resolve(libraryDirectory);
  const library =
    personalDirectory === null ? null : createLibrary(personalDirectory, root);
  const directory = join(root, '.incline');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, '.lock');
  let handle;
  try {
    handle = await open(lock, 'wx', 0o600);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let pid;
    try {
      pid = Number(await readFile(lock, 'utf8'));
      if (!Number.isInteger(pid) || pid < 1) throw new Error('Unknown lock');
      process.kill(pid, 0);
    } catch (err) {
      if (err.code === 'ESRCH') {
        await unlink(lock);
        handle = await open(lock, 'wx', 0o600);
      }
    }
    if (!handle)
      throw new Error(
        'Incline is already running for this project. Finish or stop that session first.',
      );
  }
  await handle.writeFile(String(process.pid));
  await handle.close();
  let committed, draft, initialId;
  try {
    committed = await saved(join(directory, 'state.json'));
    draft = await saved(join(directory, 'draft.json'));
    if (input) {
      const prepared = await prepareImport(input);
      const imported = validate([prepared.session])[0];
      validate([...merge(committed.sessions, draft.sessions), imported]);
      const assetsDirectory = join(directory, 'assets');
      for (const asset of prepared.assets)
        await storeNamedAsset(
          assetsDirectory,
          asset.asset,
          asset.bytes,
          asset.contentType,
        );
      draft = { ...draft, sessions: merge(draft.sessions, [imported]) };
      await atomic(
        join(directory, 'draft.json'),
        JSON.stringify(draft, null, 2),
      );
      initialId = imported.id;
    }
  } catch (e) {
    await unlink(lock);
    throw e;
  }
  let sessions = merge(committed.sessions, draft.sessions);
  const token = randomBytes(32).toString('hex');
  const assetsDirectory = join(directory, 'assets');
  let origin = '',
    done = false,
    closing = false,
    timer;
  let resolveClosed;
  const closed = new Promise((r) => {
    resolveClosed = r;
  });
  let serial = Promise.resolve();
  const send = (res, status, data) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(data));
  };
  const server = createServer(async (req, res) => {
    if (!closing) {
      clearTimeout(timer);
      timer = setTimeout(() => void close(), idleMs);
      timer.unref();
    }
    try {
      if (req.headers.host !== new URL(origin).host)
        throw failure('Invalid local host', 403);
      if (req.headers.origin && req.headers.origin !== origin)
        throw failure('Origin not allowed', 403);
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith('/api/')) {
        const auth = req.headers.authorization ?? '';
        const expected = `Bearer ${token}`;
        if (
          auth.length !== expected.length ||
          !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
        )
          throw failure('Local session token required', 401);
        if (req.method === 'POST' && req.headers.origin !== origin)
          throw failure('Origin not allowed', 403);
        if (req.method === 'GET' && url.pathname === '/api/boot')
          return send(res, 200, {
            mode: 'local',
            project: root,
            directory,
            sessions,
            personalLibrary: {
              available: library !== null,
              directory: personalDirectory,
            },
            ...(initialId ? { initialId } : {}),
          });
        if (url.pathname === '/api/library' && req.method === 'GET') {
          if (!library) throw failure('Personal library is disabled', 404);
          return send(res, 200, { entries: await library.list() });
        }
        if (
          ['/api/library/save', '/api/library/use'].includes(url.pathname) &&
          req.method === 'POST'
        ) {
          if (!library) throw failure('Personal library is disabled', 404);
          if (!req.headers['content-type']?.startsWith('application/json'))
            throw failure('JSON required', 415);
          const data = await body(req);
          const field = url.pathname === '/api/library/save' ? 'session' : 'id';
          if (
            !data ||
            typeof data !== 'object' ||
            Array.isArray(data) ||
            Object.keys(data).length !== 1 ||
            !Object.hasOwn(data, field)
          )
            throw failure('Invalid personal library request');
          const work = async () => {
            if (done) throw failure('Session already finished', 409);
            if (field === 'session')
              return {
                entry: await library.save(data.session, basename(root)),
              };
            const prepared = await library.prepare(data.id);
            const next = validate(merge(sessions, [prepared.session]));
            const sources = join(directory, 'library-sources');
            const receiptDirectory = join(sources, prepared.session.id);
            const staging = join(sources, `.pending-${prepared.session.id}`);
            const writtenAssets = [];
            let receiptWritten = false;
            try {
              await mkdir(sources, { recursive: true, mode: 0o700 });
              await mkdir(staging, { mode: 0o700 });
              await writeFile(
                join(staging, 'snapshot.json'),
                prepared.source.snapshot,
                { flag: 'wx', mode: 0o600 },
              );
              await writeFile(
                join(staging, 'evidence.md'),
                prepared.source.evidence,
                { flag: 'wx', mode: 0o600 },
              );
              await writeFile(
                join(staging, 'receipt.json'),
                JSON.stringify(prepared.source.receipt, null, 2),
                { flag: 'wx', mode: 0o600 },
              );
              if (prepared.assets.length)
                await mkdir(join(staging, 'assets'), { mode: 0o700 });
              for (const asset of prepared.assets) {
                await writeFile(
                  join(staging, 'assets', asset.originalAsset),
                  asset.bytes,
                  { flag: 'wx', mode: 0o600 },
                );
                await storeNamedAsset(
                  assetsDirectory,
                  asset.asset,
                  asset.bytes,
                  asset.contentType,
                );
                writtenAssets.push(join(assetsDirectory, asset.asset));
              }
              await rename(staging, receiptDirectory);
              receiptWritten = true;
              await atomic(
                join(directory, 'draft.json'),
                JSON.stringify({ version: 1, sessions: next }, null, 2),
              );
            } catch (error) {
              await Promise.all(
                writtenAssets.map((path) => unlink(path).catch(() => {})),
              );
              if (receiptWritten)
                await rm(receiptDirectory, {
                  recursive: true,
                  force: true,
                }).catch(() => {});
              throw error;
            } finally {
              await rm(staging, { recursive: true, force: true }).catch(
                () => {},
              );
            }
            sessions = next;
            return { session: prepared.session };
          };
          const current = serial.then(work);
          serial = current.catch(() => {});
          return send(res, 201, await current);
        }
        if (req.method === 'POST' && url.pathname === '/api/assets') {
          if (req.headers.origin !== origin)
            throw failure('Origin not allowed', 403);
          const bytes = await readRaw(req);
          const asset = await storeAsset(
            assetsDirectory,
            bytes,
            req.headers['content-type'],
          );
          return send(res, 201, { asset });
        }
        if (req.method === 'GET' && url.pathname.startsWith('/api/assets/')) {
          const encoded = url.pathname.slice('/api/assets/'.length);
          let name;
          try {
            name = decodeURIComponent(encoded);
          } catch {
            throw failure('Invalid asset name', 404);
          }
          const bytes = await loadAsset(assetsDirectory, name);
          res.writeHead(200, {
            'Content-Type': assetMime(name),
            'Content-Length': bytes.length,
            'Cache-Control': 'private, immutable',
            'X-Content-Type-Options': 'nosniff',
          });
          return res.end(bytes);
        }
        if (
          req.method !== 'POST' ||
          !['/api/draft', '/api/finish'].includes(url.pathname)
        )
          throw failure('Not found', 404);
        if (!req.headers['content-type']?.startsWith('application/json'))
          throw failure('JSON required', 415);
        const data = await body(req);
        const incoming = validate(data.sessions);
        if (
          url.pathname === '/api/finish' &&
          !incoming.some((s) => s.id === data.activeId && s.complete)
        )
          throw failure('Complete a profile before finishing');
        const work = async () => {
          if (done) throw failure('Session already finished', 409);
          const next = validate(merge(sessions, incoming));
          await requireAssets(next, assetsDirectory);
          if (url.pathname === '/api/draft') {
            await atomic(
              join(directory, 'draft.json'),
              JSON.stringify({ version: 1, sessions: next }, null, 2),
            );
            sessions = next;
            return { status: 'saved' };
          }
          const revision = `${Date.now()}-${randomUUID()}`;
          const revisions = join(directory, 'revisions');
          const profiles = join(directory, 'profiles');
          await mkdir(revisions, { recursive: true });
          await mkdir(profiles, { recursive: true });
          const revisionPath = join(revisions, `${revision}.json`);
          const statePath = join(directory, 'state.json');
          const profilePath = join(directory, 'profile.md');
          const state = {
            version: 1,
            revision,
            previousRevision: committed.revision ?? null,
            savedAt: new Date().toISOString(),
            sessions: next,
          };
          await writeFile(revisionPath, JSON.stringify(state, null, 2), {
            flag: 'wx',
            mode: 0o600,
          });
          for (const s of next.filter((s) => s.complete))
            await atomic(join(profiles, `${s.id}.md`), exportMarkdown(s));
          await atomic(
            profilePath,
            `# Incline project taste collection\n\nEach session is scoped to its named project and context. Read explicit instructions before provisional evidence. Do not combine these into one fixed type.\n\n${next
              .filter((s) => s.complete)
              .map(exportMarkdown)
              .join('\n---\n\n')}`,
          );
          await atomic(statePath, JSON.stringify(state, null, 2));
          await atomic(
            join(directory, 'draft.json'),
            JSON.stringify({ version: 1, sessions: next }, null, 2),
          );
          sessions = next;
          committed = state;
          done = closeAfterFinish;
          return {
            status: 'completed',
            revision,
            revisionPath,
            profilePath,
            statePath,
            sessionId: data.activeId,
          };
        };
        const current = serial.then(work);
        serial = current.catch(() => {});
        const result = await current;
        send(res, 200, result);
        if (url.pathname === '/api/finish') {
          onFinish(result);
          if (closeAfterFinish) res.once('finish', () => void close());
        }
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        throw failure('Method not allowed', 405);
      const relative =
        decodeURIComponent(url.pathname) === '/'
          ? 'index.html'
          : decodeURIComponent(url.pathname).slice(1);
      const base = resolve(ui),
        file = resolve(base, relative);
      if (!file.startsWith(base + sep)) throw failure('Not found', 404);
      let bytes;
      try {
        bytes = await readFile(file);
      } catch {
        throw failure('Not found', 404);
      }
      res.writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy':
          "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (e) {
      send(res, e.status ?? 500, {
        error: e.status
          ? e.message
          : 'Could not save or serve this session. Your existing revisions are preserved.',
      });
    }
  });
  async function close() {
    if (closing) return closed;
    closing = true;
    clearTimeout(timer);
    await serial;
    server.close(async () => {
      await unlink(lock).catch(() => {});
      resolveClosed();
    });
    server.closeIdleConnections();
    return closed;
  }
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  }).catch(async (e) => {
    await unlink(lock);
    throw e;
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  timer = setTimeout(() => void close(), idleMs);
  timer.unref();
  return {
    origin,
    token,
    url: `${origin}/#incline=${token}`,
    directory,
    close,
    closed,
  };
}
