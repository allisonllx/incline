import { parseSaved } from '../lib/taste.ts';

function failure(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
export function validate(sessions) {
  if (!Array.isArray(sessions) || sessions.length > 100)
    throw failure('Invalid session collection');
  const valid = parseSaved(JSON.stringify({ version: 1, sessions }));
  if (
    valid.length !== sessions.length ||
    new Set(sessions.map((s) => s.id)).size !== sessions.length
  )
    throw failure('Invalid session data');
  for (const s of valid) {
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(s.id) ||
      s.name.length > 80 ||
      s.notes.length > 3000 ||
      s.answers.some((a) => a.reason.length > 600) ||
      Number.isNaN(Date.parse(s.createdAt))
    )
      throw failure('Invalid session fields');
  }
  return valid.map((s) => ({
    id: s.id,
    catalogVersion: s.catalogVersion ?? 1,
    ...(s.catalogVersion === 3 ? { followUps: [...s.followUps] } : {}),
    name: s.name,
    context: s.context,
    exploration: s.exploration,
    answers: s.answers.map((a) => ({
      roundId: a.roundId,
      choice: a.choice,
      reason: a.reason,
    })),
    keep: [...new Set(s.keep)],
    explore: [...new Set(s.explore)],
    notes: s.notes,
    complete: s.complete,
    createdAt: s.createdAt,
    ...(s.collection ? { collection: structuredClone(s.collection) } : {}),
    ...(s.librarySource ? { librarySource: { ...s.librarySource } } : {}),
  }));
}
