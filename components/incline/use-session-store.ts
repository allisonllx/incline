'use client';
import { useEffect, useRef, useState } from 'react';
import { parseSaved, type Session } from '@/lib/taste';

export type Connection = {
  token: string;
  directory: string;
  personalLibrary?: { available: boolean; directory: string | null };
};
export type SavedResult = {
  status: string;
  profilePath: string;
  statePath: string;
  revisionPath: string;
};
const storageKey = 'incline.sessions.v1';
export async function api<T>(path: string, token: string, data?: unknown) {
  const response = await fetch(path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result && typeof result === 'object' && 'error' in result
        ? String(result.error)
        : 'Could not save this profile.',
    );
  return result as T;
}
export function useSessionStore() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<Connection | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [result, setResult] = useState<SavedResult | null>(null);
  const [initialId, setInitialId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const revision = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const token = new URLSearchParams(window.location.hash.slice(1)).get(
        'incline',
      );
      try {
        if (token) {
          const boot = await api<{
            sessions: Session[];
            directory: string;
            initialId?: string;
            personalLibrary?: Connection['personalLibrary'];
          }>('/api/boot', token);
          if (cancelled) return;
          setSessions(boot.sessions);
          setConnection({
            token,
            directory: boot.directory,
            personalLibrary: boot.personalLibrary,
          });
          setInitialId(boot.initialId ?? null);
        } else {
          const raw = localStorage.getItem(storageKey);
          if (cancelled) return;
          setSessions(parseSaved(raw));
        }
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(
            token
              ? `Local session unavailable: ${e instanceof Error ? e.message : 'restart Incline to continue.'}`
              : 'Browser storage is unavailable. Export your profile to keep it.',
          );
          if (!token) setReady(true);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!ready || stopped.current || sessions.length === 0) return;
    const current = ++revision.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflects asynchronous persistence, not derived UI data
    setSaveState('saving');
    debounce.current = setTimeout(() => {
      if (stopped.current) return;
      if (connection) {
        queue.current = queue.current
          .catch(() => {})
          .then(() => api('/api/draft', connection.token, { sessions }))
          .then(() => {
            if (current === revision.current) {
              setSaveState('saved');
              setError('');
            }
          })
          .catch((e) => {
            if (current === revision.current) setSaveState('error');
            setError(
              `Draft could not be saved: ${e instanceof Error ? e.message : 'try again before closing.'}`,
            );
          });
      } else
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({ version: 1, sessions }),
          );
          setSaveState('saved');
        } catch {
          setSaveState('error');
          setError(
            'Changes could not be saved in this browser. Export your profile to keep a copy.',
          );
        }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [sessions, connection, ready]);
  async function finish(activeId: string, snapshot: Session[] = sessions) {
    if (!connection || stopped.current) return;
    stopped.current = true;
    setFinishing(true);
    setError('');
    if (debounce.current) clearTimeout(debounce.current);
    try {
      await queue.current;
      const saved = await api<SavedResult>('/api/finish', connection.token, {
        sessions: snapshot,
        activeId,
      });
      setResult(saved);
    } catch (e) {
      stopped.current = false;
      setError(
        `Profile not committed: ${e instanceof Error ? e.message : 'restart Incline and resume the draft.'}`,
      );
    } finally {
      setFinishing(false);
    }
  }
  return {
    sessions,
    setSessions,
    ready,
    error,
    connection,
    finishing,
    result,
    finish,
    initialId,
    saveState,
  };
}
