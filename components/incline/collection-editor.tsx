'use client';
/* eslint-disable @next/next/no-img-element -- original local references use authenticated blob URLs in the standalone UI */
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ImagePlus,
  Link2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  collectionHasContent,
  referenceUrl,
  type Reference,
} from '@/lib/collection';
import { exportMarkdown, getRounds, type Session } from '@/lib/taste';
import type { Connection } from './use-session-store';
import { GuideInput, ReferenceGuide, type GuideUpload } from './design-guide';

function ReferenceImage({
  reference,
  token,
}: {
  reference: Reference;
  token?: string;
}) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!token || !reference.asset) return;
    let cancelled = false;
    let objectUrl = '';
    const controller = new AbortController();
    void fetch(`/api/assets/${reference.asset}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('This image could not be loaded.');
        objectUrl = URL.createObjectURL(await response.blob());
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setSrc(objectUrl);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Image unavailable');
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reference.asset, token]);
  return (
    <>
      <button
        type="button"
        className="reference-picture"
        onClick={() => setOpen(true)}
        disabled={!src}
        aria-label={`Enlarge ${reference.title || 'reference image'}`}
      >
        {src ? (
          <img src={src} alt={reference.title || 'Your reference'} />
        ) : (
          <span>
            {error ||
              (token
                ? 'Loading image…'
                : 'Open the local session to view this image.')}
          </span>
        )}
        {src && (
          <span className="image-enlarge">
            <ArrowUpRight size={16} /> Look closer
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="reference-dialog">
          <DialogTitle>{reference.title || 'Reference image'}</DialogTitle>
          <DialogDescription>
            {reference.note || 'Your original reference, without cropping.'}
          </DialogDescription>
          {src && <img src={src} alt={reference.title || 'Your reference'} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

type Props = {
  session: Session;
  connection: Connection | null;
  finishing: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  onChange: (session: Session) => void;
  onBack: () => void;
  onQuiz: () => void;
  onFinish: (session: Session) => void;
  onBusyChange: (busy: boolean) => void;
};
export function CollectionEditor({
  session,
  connection,
  finishing,
  saveState,
  onChange,
  onBack,
  onQuiz,
  onFinish,
  onBusyChange,
}: Props) {
  const collection = session.collection!;
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showHandoff, setShowHandoff] = useState(false);
  const [pendingGuide, setPendingGuide] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const latest = useRef(session);
  const inFlight = useRef(false);
  useEffect(() => {
    latest.current = session;
  }, [session]);
  useEffect(() => {
    onBusyChange(uploading);
    return () => onBusyChange(false);
  }, [uploading, onBusyChange]);
  function change(next: Session) {
    latest.current = next;
    onChange(next);
  }
  function patch(p: Partial<typeof collection>) {
    const current = latest.current;
    change({
      ...current,
      complete: false,
      collection: { ...current.collection!, ...p },
    });
  }
  function editReference(id: string, p: Partial<Reference>) {
    patch({
      references: latest.current.collection!.references.map((r) =>
        r.id === id ? { ...r, ...p } : r,
      ),
    });
  }
  function addLink() {
    const validUrl = referenceUrl(url);
    if (!validUrl || validUrl.length > 4000) {
      setError(
        'Use a complete http:// or https:// link without a username or password.',
      );
      return;
    }
    if (collection.references.length >= 24) {
      setError(
        'This collection holds up to 24 references. Start another to explore more.',
      );
      return;
    }
    patch({
      references: [
        ...latest.current.collection!.references,
        {
          id: crypto.randomUUID(),
          kind: 'link',
          url: validUrl,
          title: new URL(validUrl).hostname.slice(0, 160),
          note: '',
          intent: 'inspiration',
        },
      ],
    });
    setUrl('');
    setError('');
  }
  async function addImages(files: File[]) {
    if (inFlight.current || finishing) return;
    if (!connection) {
      setError(
        'Image uploads are available when your agent launches a local Incline session. You can still describe a direction or add links here.',
      );
      return;
    }
    if (files.length + latest.current.collection!.references.length > 24) {
      setError(
        'Choose fewer images. Each collection holds up to 24 references.',
      );
      return;
    }
    const invalid = files.find(
      (file) =>
        !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
          file.type,
        ) ||
        file.size === 0 ||
        file.size > 8_000_000,
    );
    if (invalid) {
      setError(`${invalid.name}: choose a PNG, JPG, WebP or GIF up to 8 MB.`);
      return;
    }
    inFlight.current = true;
    setUploading(true);
    setError('');
    try {
      for (const file of files) {
        const response = await fetch('/api/assets', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${connection.token}`,
            'Content-Type': file.type,
          },
          body: file,
        });
        const result: { asset?: string; error?: string } =
          await response.json();
        if (!response.ok || !result.asset)
          throw new Error(result.error || `Could not add ${file.name}.`);
        const current = latest.current;
        change({
          ...current,
          complete: false,
          collection: {
            ...current.collection!,
            references: [
              ...current.collection!.references,
              {
                id: crypto.randomUUID(),
                kind: 'image',
                asset: result.asset,
                title: file.name.slice(0, 160),
                note: '',
                intent: 'inspiration',
              },
            ],
          },
        });
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Upload failed. Please try again.',
      );
    } finally {
      inFlight.current = false;
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  async function addGuide(guide: GuideUpload): Promise<boolean> {
    if (inFlight.current || finishing || !connection) return false;
    if (latest.current.collection!.references.length >= 24) {
      setError(
        'This collection holds up to 24 references. Start another to explore more.',
      );
      return false;
    }
    inFlight.current = true;
    setUploading(true);
    setError('');
    try {
      const response = await fetch('/api/assets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${connection.token}`,
          'Content-Type': 'text/markdown',
        },
        body: guide.body,
      });
      const result: { asset?: string; error?: string } = await response.json();
      if (!response.ok || !result.asset)
        throw new Error(result.error || 'Could not save the guide.');
      patch({
        references: [
          ...latest.current.collection!.references,
          {
            id: crypto.randomUUID(),
            kind: 'guide',
            asset: result.asset,
            title: guide.title,
            note: '',
            intent: 'inspiration',
            ...(guide.sourceUrl ? { url: guide.sourceUrl } : {}),
          },
        ],
      });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the guide.');
      return false;
    } finally {
      inFlight.current = false;
      setUploading(false);
    }
  }
  const hasContent =
    collectionHasContent(collection) ||
    session.answers.length ===
      getRounds(session.answers, session.catalogVersion).length;
  const busy = uploading || finishing;
  return (
    <div className="collection-view">
      <div className="collection-toolbar">
        <button className="text-button" onClick={onBack} disabled={busy}>
          <ArrowLeft size={16} /> Your collections
        </button>
        <span
          aria-live="polite"
          className={`draft-status ${saveState === 'error' ? 'is-error' : ''}`}
        >
          {uploading
            ? 'Adding references…'
            : saveState === 'saving'
              ? 'Saving draft…'
              : saveState === 'saved'
                ? 'Draft saved'
                : saveState === 'error'
                  ? 'Draft not saved — see the message above'
                  : 'Your own starting point'}
        </span>
      </div>
      <div className="collection-heading">
        <div>
          <div className="eyebrow">A COLLECTION, WITH ROOM TO GROW</div>
          <h1>
            Follow the <span className="serif-word">feeling.</span>
          </h1>
          <p>
            A few words, a picture, an unexpected combination. Start wherever
            you are.
          </p>
        </div>
        <span className="collection-number">01 — ∞</span>
      </div>
      {session.librarySource && (
        <aside className="library-origin">
          <strong>A personal collection, ready for this project.</strong>
          <p>
            Copied from “{session.librarySource.name || 'Untitled collection'}”
            {session.librarySource.context
              ? ` · ${session.librarySource.context}`
              : ''}
            . Review its references and earlier preferences for what fits here.
            Your changes stay in this project.
          </p>
        </aside>
      )}
      <fieldset disabled={finishing} className="collection-fields">
        <div className="collection-intro-grid">
          <section className="collection-writing">
            <label htmlFor="collection-name">Collection name</label>
            <input
              id="collection-name"
              value={session.name}
              maxLength={80}
              placeholder="e.g. Letters from somewhere"
              onChange={(e) =>
                change({
                  ...latest.current,
                  name: e.target.value,
                  complete: false,
                })
              }
            />
            <label htmlFor="collection-context">
              Where might this belong? <span>optional</span>
            </label>
            <input
              id="collection-context"
              value={collection.projectContext}
              maxLength={300}
              placeholder="My portfolio, a travel journal, a new brand…"
              onChange={(e) => patch({ projectContext: e.target.value })}
            />
            <label htmlFor="collection-description">
              What are you drawn to?{' '}
              <span>your words, no style labels needed</span>
            </label>
            <textarea
              id="collection-description"
              value={collection.description}
              maxLength={6000}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Old newspaper columns, handwritten notes in the margins, a little magazine collage. Something personal and lived-in…"
            />
          </section>
          <aside className="collection-note">
            <span className="note-star">✳</span>
            <h2>
              You don’t have to
              <br />
              name your style.
            </h2>
            <p>
              “I like the feeling of this” is a good beginning. Contradictions
              can belong together.
            </p>
            <div className="note-divider" />
            <p className="note-example">
              A quiet layout.
              <br />
              An expressive detail.
              <br />
              <em>Your own combination.</em>
            </p>
          </aside>
        </div>
        <section
          className="collection-references"
          aria-labelledby="references-heading"
        >
          <div className="collection-section-heading">
            <div>
              <div className="eyebrow">PIECES OF THE PICTURE</div>
              <h2 id="references-heading">
                Your references{' '}
                <span>
                  {collection.references.length
                    ? `(${collection.references.length})`
                    : ''}
                </span>
              </h2>
            </div>
            <p>Keep what catches your eye. Notes can come later.</p>
          </div>
          <div className="reference-inputs">
            <div
              className={`reference-drop ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void addImages(Array.from(e.dataTransfer.files));
              }}
            >
              <ImagePlus size={24} />
              <strong>Drop images here</strong>
              <span>PNG, JPG, WebP or GIF · up to 8 MB each</span>
              <button
                type="button"
                className="text-button"
                onClick={() => fileInput.current?.click()}
                disabled={busy || collection.references.length >= 24}
              >
                Choose images <Plus size={15} />
              </button>
              <input
                ref={fileInput}
                className="sr-only"
                tabIndex={-1}
                type="file"
                aria-label="Reference images"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                disabled={busy}
                onChange={(e) =>
                  void addImages(Array.from(e.target.files ?? []))
                }
              />
            </div>
            <div className="reference-link-entry">
              <Link2 size={24} />
              <label htmlFor="reference-url">Or bring a link</label>
              <p>A website, a board, a design guide, a detail you love.</p>
              <div>
                <input
                  id="reference-url"
                  type="url"
                  value={url}
                  maxLength={4000}
                  placeholder="https://…"
                  disabled={busy}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addLink();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={addLink}
                  disabled={
                    !url.trim() || busy || collection.references.length >= 24
                  }
                  aria-label="Add reference link"
                >
                  <Plus size={18} />
                </Button>
              </div>
              <small>
                Saved as a source link; no preview is fetched automatically.
              </small>
            </div>
          </div>
          <GuideInput
            local={!!connection}
            busy={busy}
            full={collection.references.length >= 24}
            onAdd={addGuide}
            onPendingChange={setPendingGuide}
          />
          {error && (
            <div className="collection-error" role="alert">
              <span>{error}</span>
              <button
                type="button"
                aria-label="Dismiss reference error"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="reference-board">
            {collection.references.map((reference, index) => (
              <article className="reference-card" key={reference.id}>
                {reference.kind === 'image' ? (
                  <ReferenceImage
                    reference={reference}
                    token={connection?.token}
                  />
                ) : reference.kind === 'guide' ? (
                  <ReferenceGuide
                    reference={reference}
                    token={connection?.token}
                  />
                ) : (
                  <a
                    className="reference-link-preview"
                    href={reference.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Link2 size={30} />
                    <span>{new URL(reference.url!).hostname}</span>
                    <small>
                      Open reference <ArrowUpRight size={14} />
                    </small>
                  </a>
                )}
                <div className="reference-card-body">
                  <div className="reference-card-top">
                    <span>REFERENCE {String(index + 1).padStart(2, '0')}</span>
                    <button
                      aria-label={`Remove ${reference.title || 'reference'}`}
                      title="Remove from this collection"
                      disabled={busy}
                      onClick={() =>
                        patch({
                          references: collection.references.filter(
                            (r) => r.id !== reference.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <label className="sr-only" htmlFor={`title-${reference.id}`}>
                    Reference {index + 1} title
                  </label>
                  <input
                    id={`title-${reference.id}`}
                    maxLength={160}
                    value={reference.title}
                    placeholder="Give this reference a name"
                    onChange={(e) =>
                      editReference(reference.id, { title: e.target.value })
                    }
                  />
                  <label htmlFor={`note-${reference.id}`}>
                    What draws you to this? <span>optional</span>
                  </label>
                  <textarea
                    id={`note-${reference.id}`}
                    value={reference.note}
                    maxLength={2000}
                    placeholder="The torn edges, not the crowded text. Or just: I like the feeling."
                    onChange={(e) =>
                      editReference(reference.id, { note: e.target.value })
                    }
                  />
                  <label htmlFor={`intent-${reference.id}`}>
                    How should it guide this project?
                  </label>
                  <select
                    id={`intent-${reference.id}`}
                    value={reference.intent}
                    onChange={(e) =>
                      editReference(reference.id, {
                        intent: e.target.value as Reference['intent'],
                      })
                    }
                  >
                    <option value="inspiration">
                      Just inspiration for now
                    </option>
                    <option value="direction">
                      Use this direction for this project
                    </option>
                  </select>
                </div>
              </article>
            ))}
          </div>
        </section>
        <div className="collection-bottom-grid">
          <section className="collection-preserve">
            <label htmlFor="collection-preserve">
              What should survive an edit? <span>optional</span>
            </label>
            <textarea
              id="collection-preserve"
              value={session.notes}
              maxLength={3000}
              onChange={(e) =>
                change({
                  ...latest.current,
                  notes: e.target.value,
                  complete: false,
                })
              }
              placeholder="Keep navigation obvious and body text readable, even when the rest gets experimental."
            />
          </section>
          <aside className="collection-quiz">
            <Sparkles size={20} />
            <h3>A little more discovery?</h3>
            <p>
              The visual comparisons are here if you want them. Your references
              stay with this collection.
            </p>
            <button className="text-button" disabled={busy} onClick={onQuiz}>
              {session.answers.length ===
              getRounds(session.answers, session.catalogVersion).length
                ? 'Review comparisons'
                : session.answers.length
                  ? 'Continue comparisons'
                  : 'Explore comparisons'}{' '}
              <ArrowRight size={16} />
            </button>
          </aside>
        </div>
      </fieldset>
      <div className="collection-finish">
        <div>
          <strong>Your starting point is enough.</strong>
          <p>
            {connection
              ? 'Save the original references and your notes for your agent.'
              : 'Save this collection in your browser.'}
          </p>
        </div>
        <Button
          className="primary-button"
          disabled={
            !hasContent || busy || !!error || !!url.trim() || pendingGuide
          }
          onClick={() =>
            onFinish({
              ...session,
              name: session.name.trim() || 'Untitled collection',
              complete: true,
            })
          }
        >
          {finishing
            ? 'Saving collection…'
            : connection
              ? 'Finish & return to agent'
              : 'Save collection'}{' '}
          <ArrowUpRight size={17} />
        </Button>
      </div>
      {!!url.trim() && (
        <p className="fine-print">
          Add the link above, or clear it, before finishing.
        </p>
      )}
      {pendingGuide && (
        <p className="fine-print">
          Add the design guide above, or clear it, before finishing.
        </p>
      )}
      <button
        className="handoff-toggle text-button"
        onClick={() => setShowHandoff(!showHandoff)}
        aria-expanded={showHandoff}
      >
        {showHandoff ? 'Hide' : 'Preview'} what your agent will receive{' '}
        <ArrowUpRight size={14} />
      </button>
      {showHandoff && (
        <pre className="handoff-preview">{exportMarkdown(session)}</pre>
      )}
    </div>
  );
}
