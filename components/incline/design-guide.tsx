'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, FileText, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { referenceUrl, type Reference } from '@/lib/collection';

export type GuideUpload = { body: Blob; title: string; sourceUrl?: string };

export function GuideInput({
  local,
  busy,
  full,
  onAdd,
  onPendingChange,
}: {
  local: boolean;
  busy: boolean;
  full: boolean;
  onAdd: (guide: GuideUpload) => Promise<boolean>;
  onPendingChange: (pending: boolean) => void;
}) {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const pending = !!(title.trim() || source.trim() || content.trim());
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  const disabled = !local || busy || full;
  function clear() {
    setTitle('');
    setSource('');
    setContent('');
    setError('');
  }
  async function add(file?: File) {
    if (disabled) return;
    const sourceUrl = source.trim() ? referenceUrl(source) : undefined;
    if (sourceUrl === null) {
      setError(
        'Use a complete http:// or https:// source link without credentials.',
      );
      return;
    }
    if (file && !/\.(md|markdown)$/i.test(file.name)) {
      setError('Choose a .md or .markdown file.');
      return;
    }
    const body = file ?? new Blob([content], { type: 'text/markdown' });
    if (!body.size || body.size > 200_000 || (!file && !content.trim())) {
      setError('Add a non-empty Markdown guide up to 200 KB.');
      return;
    }
    setError('');
    const added = await onAdd({
      body,
      title: title.trim() || file?.name.slice(0, 160) || 'Design guide',
      ...(sourceUrl ? { sourceUrl } : {}),
    });
    if (added) clear();
    if (input.current) input.current.value = '';
  }
  return (
    <details className="guide-entry">
      <summary>
        <FileText size={18} />
        <span>Have a design guide?</span>
        <span className="guide-entry-hint">
          Bring a DESIGN.md or your own written direction
        </span>
        <Plus size={16} />
      </summary>
      <div className="guide-entry-body">
        <p>
          Keep a guide with your references, then tell your agent which parts
          fit. The original stays intact.
        </p>
        {!local && (
          <p className="guide-local-note">
            Guide files are available in a local session started by your agent.
            You can add a source link above here.
          </p>
        )}
        <div className="guide-meta-fields">
          <div>
            <label htmlFor="guide-title">
              Guide name <span>optional</span>
            </label>
            <input
              id="guide-title"
              value={title}
              maxLength={160}
              disabled={disabled}
              placeholder="e.g. An editorial direction"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="guide-source">
              Source link <span>optional</span>
            </label>
            <input
              id="guide-source"
              type="url"
              value={source}
              maxLength={4000}
              disabled={disabled}
              placeholder="Where this guide came from"
              onChange={(e) => setSource(e.target.value)}
            />
          </div>
        </div>
        <label htmlFor="guide-content">Paste a guide</label>
        <textarea
          id="guide-content"
          value={content}
          maxLength={200_000}
          disabled={disabled}
          placeholder={
            '# Design direction\n\nTypography, colour, layout, and what makes it feel right…'
          }
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="guide-actions">
          <button
            type="button"
            className="text-button"
            disabled={disabled || !content.trim()}
            onClick={() => void add()}
          >
            Add pasted guide <Plus size={15} />
          </button>
          <span>or</span>
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            Choose a Markdown file <FileText size={15} />
          </button>
          {pending && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={clear}
            >
              Clear
            </button>
          )}
          <input
            ref={input}
            type="file"
            accept=".md,.markdown,text/markdown"
            aria-label="Design guide file"
            tabIndex={-1}
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void add(file);
            }}
          />
        </div>
        <small>
          UTF-8 Markdown · up to 200 KB · saved locally with this collection
        </small>
        {error && (
          <p className="guide-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}

export function ReferenceGuide({
  reference,
  token,
}: {
  reference: Reference;
  token?: string;
}) {
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!token || !reference.asset) return;
    const controller = new AbortController();
    let cancelled = false;
    void fetch(`/api/assets/${reference.asset}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('This guide could not be loaded.');
        const original = await response.text();
        if (!cancelled) setContent(original);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Guide unavailable');
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reference.asset, token]);
  return (
    <>
      <button
        type="button"
        className="reference-guide-preview"
        disabled={!content}
        onClick={() => setOpen(true)}
        aria-label={`Read ${reference.title || 'design guide'}`}
      >
        <span>
          <FileText size={21} /> DESIGN GUIDE
        </span>
        <pre>
          {content.slice(0, 300) ||
            error ||
            (token
              ? 'Loading guide…'
              : 'Open the local session to read this guide.')}
        </pre>
        {content && (
          <small>
            Read original <ArrowUpRight size={14} />
          </small>
        )}
      </button>
      {reference.url && (
        <a
          className="guide-source-link"
          href={reference.url}
          target="_blank"
          rel="noreferrer"
        >
          Source: {new URL(reference.url).hostname} <ArrowUpRight size={13} />
        </a>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="guide-dialog">
          <DialogTitle>{reference.title || 'Design guide'}</DialogTitle>
          <DialogDescription>
            {reference.note ||
              'Original guide text. Add a note about the parts you want to use.'}
          </DialogDescription>
          <pre className="guide-document">{content}</pre>
        </DialogContent>
      </Dialog>
    </>
  );
}
