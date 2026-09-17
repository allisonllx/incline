'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, BookmarkPlus, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type Connection } from './use-session-store';
import { type Session } from '@/lib/taste';
import { collectionHasContent } from '@/lib/collection';

type Entry = {
  id: string;
  name: string;
  context: string;
  referenceCount: number;
  comparisonCount: number;
  savedAt: string;
  sourceProject: string;
};

export function SavePersonalCopy({
  session,
  connection,
  disabled,
  onBusyChange,
}: {
  session: Session;
  connection: Connection;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const hasContent =
    (session.collection && collectionHasContent(session.collection)) ||
    session.answers.length > 0 ||
    session.notes.trim() ||
    session.keep.length ||
    session.explore.length;
  async function save() {
    setPending(true);
    onBusyChange(true);
    setMessage('');
    setError('');
    try {
      await api('/api/library/save', connection.token, { session });
      setMessage('Copy saved to your personal library.');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not save a personal copy.',
      );
    } finally {
      setPending(false);
      onBusyChange(false);
    }
  }
  return (
    <div className="personal-copy-action">
      <button
        className="text-button"
        disabled={disabled || pending || !hasContent}
        onClick={() => void save()}
        aria-label={`Save ${session.name || 'Untitled collection'} to personal library`}
      >
        <BookmarkPlus size={16} />{' '}
        {pending
          ? 'Saving copy…'
          : message
            ? 'Save another copy'
            : 'Save to personal library'}
      </button>
      {message && <output>{message}</output>}
      {error && (
        <p role="alert" className="personal-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function PersonalLibrary({
  connection,
  onImport,
  onBusyChange,
}: {
  connection: Connection;
  onImport: (session: Session) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void api<{ entries: Entry[] }>('/api/library', connection.token)
      .then((data) => {
        if (!cancelled) setEntries(data.entries);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : 'Could not open your library.',
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connection.token, attempt]);
  async function importEntry(entry: Entry) {
    setPending(entry.id);
    onBusyChange(true);
    setError('');
    try {
      const data = await api<{ session: Session }>(
        '/api/library/use',
        connection.token,
        { id: entry.id },
      );
      onImport(data.session);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not add this collection to your project.',
      );
    } finally {
      setPending(null);
      onBusyChange(false);
    }
  }
  return (
    <section className="personal-library" aria-label="Personal library">
      <p className="library-explanation">
        Keep different sides of your taste here. Using a collection creates a
        copy you can adapt for this project.
      </p>
      {error && (
        <div className="personal-error" role="alert">
          <p>{error}</p>
          <button
            className="text-button"
            disabled={!!pending}
            onClick={() => {
              setError('');
              setLoading(true);
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {loading ? (
        <output>Opening your library…</output>
      ) : !error && entries.length === 0 ? (
        <div className="empty-state">
          <Layers size={35} />
          <h2>A little of you, across projects.</h2>
          <p>
            Save a collection from “This project” to keep it here. Nothing is
            shared automatically.
          </p>
        </div>
      ) : (
        <div className="personal-entry-list">
          {entries.map((entry) => (
            <article className="personal-entry" key={entry.id}>
              <div>
                <h2>{entry.name || 'Untitled collection'}</h2>
                <p>{entry.context || 'Open direction'}</p>
                <small>
                  {entry.referenceCount} references · {entry.comparisonCount}{' '}
                  comparisons · From {entry.sourceProject}
                </small>
              </div>
              <Button
                className="primary-button"
                disabled={!!pending}
                onClick={() => void importEntry(entry)}
              >
                {pending === entry.id
                  ? 'Adding a copy…'
                  : 'Use in this project'}{' '}
                <ArrowUpRight size={16} />
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
