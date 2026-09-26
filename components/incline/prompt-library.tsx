'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type Connection } from './use-session-store';

type Scope = 'project' | 'personal';
type Tag = { facet: string; value: string; provenance: string };
type Asset = {
  id: string;
  contentType?: string;
  missingReason?: string;
  sha256?: string;
};
type Summary = {
  id: string;
  revision: number;
  title: string;
  origin: string;
  tags: Tag[];
  assetCount: number;
  source: { url?: string; contentGap?: string };
};
type Entry = Summary & {
  prompt: string;
  source: {
    url?: string;
    author?: string;
    contentGap?: string;
    embedUrl?: string;
  };
  assets: Asset[];
  notes: { text: string; provenance: string }[];
  requirements: { unknowns: string[]; checks: string[] };
  copyOf: { id: string; revision: number } | null;
};
type Observation = {
  status: string;
  notes: string | null;
  evidence: string[];
  by?: string | null;
} | null;
type Run = {
  id: string;
  recordedAt: string;
  execution: Observation;
  inspection: Observation;
  tester: Observation;
  userReview: Observation;
  artifacts: Asset[];
};
type Upload = { id: string; contentType: string; base64: string };

const path = (scope: Scope, query = '', tag = '') => {
  const params = new URLSearchParams({ scope });
  if (query.trim()) params.set('text', query.trim());
  if (tag.trim()) params.set('tag', tag.trim());
  return `/api/prompts?${params}`;
};
function safeLink(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function tagsFromText(value: string, previous: Tag[] = []): Tag[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf(':');
      if (index < 1 || index === line.length - 1)
        throw new Error('Write each tag as facet: value.');
      const facet = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      return (
        previous.find((tag) => tag.facet === facet && tag.value === value) ?? {
          facet,
          value,
          provenance: 'user',
        }
      );
    });
}
async function fileUpload(file: File): Promise<Upload> {
  if (file.size > 8_000_000) throw new Error('Choose an image under 8 MB.');
  const contentType =
    file.type === 'text/markdown' ? 'text/markdown' : file.type;
  if (
    ![
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'text/markdown',
    ].includes(contentType)
  )
    throw new Error('Choose PNG, JPEG, WebP, GIF, or Markdown.');
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error('Could not read the selected file.'));
    reader.onload = () =>
      resolve(
        typeof reader.result === 'string'
          ? (reader.result.split(',', 2)[1] ?? '')
          : '',
      );
    reader.readAsDataURL(file);
  });
  return { id: crypto.randomUUID(), contentType, base64 };
}

function Media({
  connection,
  url,
  asset,
}: {
  connection: Connection;
  url: string;
  asset: Asset;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (asset.missingReason) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void fetch(url, {
      headers: { Authorization: `Bearer ${connection.token}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error('Preview unavailable');
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setPreview(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.missingReason, connection.token, url]);
  if (asset.missingReason)
    return (
      <p className="prompt-gap">
        {asset.id}: unavailable — {asset.missingReason}
      </p>
    );
  if (error)
    return (
      <p className="prompt-gap">{asset.id}: retained preview unavailable</p>
    );
  if (!preview) return <p>Loading {asset.id}…</p>;
  // The authenticated local response is already a verified, retained blob.
  if (asset.contentType?.startsWith('image/')) {
    const image = (
      // oxlint-disable-next-line nextjs/no-img-element -- authenticated blob URLs belong to the standalone local UI
      <img src={preview} alt={`Retained asset ${asset.id}`} />
    );
    return (
      <figure className="prompt-media">
        {image}
        <figcaption>{asset.id} · retained capture</figcaption>
      </figure>
    );
  }
  return (
    <a href={preview} target="_blank" rel="noreferrer">
      Open retained Markdown {asset.id}
    </a>
  );
}

function RunAxis({
  label,
  observation,
}: {
  label: string;
  observation: Observation;
}) {
  return (
    <div className="prompt-run-axis">
      <strong>
        {label}: {observation?.status ?? 'not recorded'}
        {observation?.by ? ` (${observation.by})` : ''}
      </strong>
      {observation?.notes && <p>{observation.notes}</p>}
      {observation?.evidence?.length ? (
        <ul>
          {observation.evidence.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function PromptLibrary({
  connection,
}: {
  connection: Connection | null;
}) {
  const [scope, setScope] = useState<Scope>('project');
  const [entries, setEntries] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [lookup, setLookup] = useState(false);
  const [directoryChanged, setDirectoryChanged] = useState(false);
  const [settingsRevision, setSettingsRevision] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [origin, setOrigin] = useState('user-authored');
  const [sourceUrl, setSourceUrl] = useState('');
  const [contentGap, setContentGap] = useState('');
  const [tagText, setTagText] = useState('');
  const [uploads, setUploads] = useState<Upload[]>([]);

  useEffect(() => {
    if (!connection) return;
    let cancelled = false;
    void api<{
      settings: {
        personalLookup: boolean;
        revision: string | null;
        directoryChanged: boolean;
      };
    }>('/api/prompts/settings', connection.token)
      .then(({ settings }) => {
        if (!cancelled) {
          setLookup(settings.personalLookup);
          setSettingsRevision(settings.revision);
          setDirectoryChanged(settings.directoryChanged);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : 'Could not load prompt settings.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [connection]);
  useEffect(() => {
    if (!connection) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void api<{ entries: Summary[] }>(
        path(scope, query, tagFilter),
        connection.token,
      )
        .then((data) => {
          if (!cancelled) setEntries(data.entries);
        })
        .catch((e: unknown) => {
          if (!cancelled)
            setError(
              e instanceof Error ? e.message : 'Could not list prompts.',
            );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [connection, scope, query, tagFilter, message]);

  async function open(row: Summary) {
    if (!connection) return;
    setError('');
    setEditing(false);
    try {
      const { entry } = await api<{ entry: Entry }>(
        `/api/prompts/${encodeURIComponent(row.id)}?scope=${scope}&revision=${row.revision}`,
        connection.token,
      );
      setSelected(entry);
      const result = await api<{ runs: Run[] }>(
        `/api/prompts/${encodeURIComponent(row.id)}/runs?scope=${scope}&revision=${row.revision}`,
        connection.token,
      );
      setRuns(result.runs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open prompt.');
    }
  }
  function begin(entry: Entry | null) {
    setSelected(entry);
    setEditing(true);
    setError('');
    setMessage('');
    setTitle(entry?.title ?? '');
    setPrompt(entry?.prompt ?? '');
    setOrigin(entry?.origin ?? 'user-authored');
    setSourceUrl(entry?.source.url ?? '');
    setContentGap(entry?.source.contentGap ?? '');
    setTagText(
      entry?.tags.map((tag) => `${tag.facet}: ${tag.value}`).join('\n') ?? '',
    );
    setUploads([]);
  }
  async function save() {
    if (!connection) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const tags = tagsFromText(tagText, selected?.tags);
      const source: { url: string | null; contentGap: string | null } = {
        url: sourceUrl.trim() || null,
        contentGap: contentGap.trim() || null,
      };
      const { entry } = await api<{ entry: Entry }>(
        '/api/prompts/save',
        connection.token,
        {
          scope,
          ...(selected
            ? { id: selected.id, baseRevision: selected.revision }
            : {}),
          changes: { title, prompt, origin, source, tags },
          uploads,
        },
      );
      setSelected(entry);
      setRuns([]);
      setEditing(false);
      setUploads([]);
      setMessage(`Saved revision ${entry.revision}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save prompt.');
    } finally {
      setBusy(false);
    }
  }
  async function copy(to: Scope) {
    if (!connection || !selected) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { entry } = await api<{ entry: Entry }>(
        '/api/prompts/copy',
        connection.token,
        { from: scope, to, id: selected.id, revision: selected.revision },
      );
      setScope(to);
      setSelected(entry);
      setRuns([]);
      setMessage(
        `Independent copy saved to ${to === 'project' ? 'this project' : 'your personal library'}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not copy prompt.');
    } finally {
      setBusy(false);
    }
  }
  async function changeLookup(checked: boolean) {
    if (!connection) return;
    setBusy(true);
    setError('');
    try {
      const { settings } = await api<{
        settings: { revision: string; personalLookup: boolean };
      }>('/api/prompts/settings', connection.token, {
        personalLookup: checked,
        expectedRevision: settingsRevision,
      });
      setLookup(settings.personalLookup);
      setSettingsRevision(settings.revision);
      setDirectoryChanged(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not save lookup setting.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!connection)
    return (
      <div className="empty-state">
        <h2>Prompts live in your project.</h2>
        <p>
          Open Incline as a local session to save and search prompt revisions.
        </p>
      </div>
    );
  return (
    <section className="prompt-library" aria-label="Prompt library">
      <div className="prompt-library-top">
        <div>
          <h1>Prompts</h1>
          <p>
            Reusable prompt text and the source or result evidence you have
            retained.
          </p>
        </div>
        <Button className="primary-button" onClick={() => begin(null)}>
          <Plus size={16} /> New prompt
        </Button>
      </div>
      <fieldset className="library-scopes" aria-label="Prompt location">
        <button
          aria-pressed={scope === 'project'}
          onClick={() => {
            setScope('project');
            setSelected(null);
            setEditing(false);
          }}
        >
          This project
        </button>
        {connection.promptLibrary?.available && (
          <button
            aria-pressed={scope === 'personal'}
            onClick={() => {
              setScope('personal');
              setSelected(null);
              setEditing(false);
            }}
          >
            Personal prompts
          </button>
        )}
      </fieldset>
      {connection.promptLibrary?.available && (
        <label className="prompt-lookup">
          <input
            type="checkbox"
            checked={lookup}
            disabled={busy}
            onChange={(e) => void changeLookup(e.target.checked)}
          />{' '}
          Include personal prompts in automatic project lookup
        </label>
      )}
      {directoryChanged && (
        <p className="prompt-gap">
          The personal prompt directory changed since lookup was enabled. Turn
          this on again to select the current directory.
        </p>
      )}
      <label className="prompt-search">
        <Search size={16} />
        <span className="sr-only">Search prompt metadata</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles, authors, and tags"
        />
      </label>
      <label className="prompt-filter">
        Filter by tag{' '}
        <input
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          placeholder="facet: value or value"
        />
      </label>
      {error && (
        <p role="alert" className="personal-error">
          {error}
        </p>
      )}
      {message && <output>{message}</output>}
      <div className="prompt-layout">
        <div className="prompt-list">
          {loading && <p>Searching…</p>}
          {!loading && entries.length === 0 && (
            <p>
              {query.trim() || tagFilter.trim()
                ? 'No matching prompts.'
                : 'No prompts here yet.'}
            </p>
          )}
          {entries.map((row) => (
            <button
              key={row.id}
              className="prompt-row"
              aria-pressed={selected?.id === row.id}
              onClick={() => void open(row)}
            >
              <strong>{row.title}</strong>
              <small>
                {row.origin} · revision {row.revision} · {row.assetCount} assets
              </small>
              <span>
                {row.tags
                  .slice(0, 3)
                  .map((tag) => `${tag.facet}: ${tag.value}`)
                  .join(' · ')}
              </span>
            </button>
          ))}
        </div>
        <div className="prompt-detail">
          {editing ? (
            <div className="prompt-form">
              <h3>{selected ? 'Edit prompt' : 'New prompt'}</h3>
              <label>
                Title
                <input
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                Prompt text
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={12}
                />
              </label>
              <label>
                Origin
                <select
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                >
                  <option value="user-authored">User authored</option>
                  <option value="published">Published</option>
                  <option value="agent-authored">Agent authored</option>
                  <option value="agent-reconstructed">
                    Agent reconstructed
                  </option>
                </select>
              </label>
              <label>
                Source URL
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label>
                Unavailable original text, if applicable
                <input
                  value={contentGap}
                  onChange={(e) => setContentGap(e.target.value)}
                />
              </label>
              <label>
                Tags, one facet: value per line
                <textarea
                  value={tagText}
                  onChange={(e) => setTagText(e.target.value)}
                  rows={4}
                  placeholder="medium: live frontend"
                />
              </label>
              <label>
                Retained images or Markdown
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif,text/markdown,.md"
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])];
                    void Promise.all(files.map(fileUpload))
                      .then((next) => setUploads(next))
                      .catch((reason: unknown) =>
                        setError(
                          reason instanceof Error
                            ? reason.message
                            : 'Invalid upload.',
                        ),
                      );
                  }}
                />
              </label>
              {uploads.length > 0 && (
                <p>{uploads.length} file(s) selected for durable capture.</p>
              )}
              <div className="prompt-actions">
                <Button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {busy ? 'Saving…' : 'Save revision'}
                </Button>
                <button
                  className="text-button"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : selected ? (
            <article>
              <div className="prompt-detail-heading">
                <div>
                  <h3>{selected.title}</h3>
                  <small>
                    {selected.origin} · revision {selected.revision}
                  </small>
                </div>
                <button className="text-button" onClick={() => begin(selected)}>
                  Edit
                </button>
              </div>
              <pre className="prompt-text">
                {selected.prompt || 'Original text unavailable.'}
              </pre>
              {selected.source.contentGap && (
                <p className="prompt-gap">
                  Original text gap: {selected.source.contentGap}
                </p>
              )}
              {safeLink(selected.source.url) && (
                <p>
                  External source link (not a retained capture):{' '}
                  <a
                    href={safeLink(selected.source.url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {selected.source.url} <ArrowUpRight size={13} />
                  </a>
                </p>
              )}
              {safeLink(selected.source.embedUrl) && (
                <p>
                  Source media link:{' '}
                  <a
                    href={safeLink(selected.source.embedUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open external source <ArrowUpRight size={13} />
                  </a>{' '}
                  (no retained media implied)
                </p>
              )}
              {selected.source.author && (
                <p>Credited author: {selected.source.author}</p>
              )}
              {selected.copyOf && (
                <p>Independent copy of revision {selected.copyOf.revision}</p>
              )}
              {selected.tags.length > 0 && (
                <div className="prompt-tags">
                  {selected.tags.map((tag, i) => (
                    <span key={i}>
                      {tag.facet}: {tag.value} <small>({tag.provenance})</small>
                    </span>
                  ))}
                </div>
              )}
              {selected.requirements.unknowns.length > 0 && (
                <p>
                  Unknown requirements:{' '}
                  {selected.requirements.unknowns.join('; ')}
                </p>
              )}
              {selected.notes.map((note, i) => (
                <p key={i}>
                  {note.text} <small>({note.provenance})</small>
                </p>
              ))}
              <div className="prompt-assets">
                {selected.assets.map((asset) => (
                  <Media
                    key={asset.id}
                    connection={connection}
                    asset={asset}
                    url={`/api/prompts/${selected.id}/assets/${asset.id}?scope=${scope}&revision=${selected.revision}`}
                  />
                ))}
              </div>
              <h4>Result evidence</h4>
              {runs.length === 0 ? (
                <p>
                  No recorded runs for this revision. Testing and results have
                  not been established here.
                </p>
              ) : (
                runs.map((run) => (
                  <div key={run.id} className="prompt-run">
                    <small>{run.recordedAt}</small>
                    <div className="prompt-run-axes">
                      <RunAxis label="Execution" observation={run.execution} />
                      <RunAxis
                        label="Inspection"
                        observation={run.inspection}
                      />
                      <RunAxis label="Tester" observation={run.tester} />
                      <RunAxis
                        label="User review"
                        observation={run.userReview}
                      />
                    </div>
                    {run.artifacts.map((asset) => (
                      <Media
                        key={asset.id}
                        connection={connection}
                        asset={asset}
                        url={`/api/prompts/${selected.id}/runs/${run.id}/${asset.id}?scope=${scope}&revision=${selected.revision}`}
                      />
                    ))}
                  </div>
                ))
              )}
              <div className="prompt-actions">
                {scope === 'project' && connection.promptLibrary?.available && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void copy('personal')}
                  >
                    Save independent personal copy
                  </button>
                )}
                {scope === 'personal' && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void copy('project')}
                  >
                    Use independent copy in this project
                  </button>
                )}
              </div>
            </article>
          ) : (
            <p>
              Select a prompt to preview its text, sources, and retained
              evidence.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
