import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSaved, exportMarkdown } from './taste.ts';

const sample = () => ({
  id: 'collection-one',
  catalogVersion: 2 as const,
  name: 'Personal correspondence',
  context: 'portfolio' as const,
  exploration: 'stretch' as const,
  answers: [],
  keep: [],
  explore: [],
  notes: 'Keep the text readable',
  complete: true,
  createdAt: '2026-09-17T00:00:00.000Z',
  collection: {
    version: 1 as const,
    description: 'Old letters and magazine cutouts',
    projectContext: 'A personal writing space',
    references: [],
  },
});
const parse = (s: unknown) =>
  parseSaved(JSON.stringify({ version: 1, sessions: [s] }));
void test('a description alone can complete, while empty collections and incomplete quizzes cannot', () => {
  assert.equal(parse(sample()).length, 1);
  assert.equal(
    parse({
      ...sample(),
      collection: { ...sample().collection, description: '  ' },
    }).length,
    0,
  );
  const { collection: _collection, ...legacy } = sample();
  assert.equal(parse(legacy).length, 0);
});
void test('collection drafts retain custom context and never silently accept malformed references', () => {
  const draft = { ...sample(), complete: false };
  assert.deepEqual(parse(draft)[0], draft);
  for (const reference of [
    {
      id: 'r',
      kind: 'link',
      title: 'Link',
      note: '',
      intent: 'inspiration',
      url: 'javascript:alert(1)',
    },
    {
      id: 'r',
      kind: 'image',
      title: 'Image',
      note: '',
      intent: 'inspiration',
      asset: '../secret.png',
    },
    {
      id: 'r',
      kind: 'link',
      title: 'Link',
      note: '',
      intent: 'approved-forever',
      url: 'https://example.com',
    },
    {
      id: 'r',
      kind: 'link',
      title: 'Link',
      note: '',
      intent: ['inspiration'],
      url: 'https://example.com',
    },
    {
      id: 'r',
      kind: 'link',
      title: 'Link',
      note: '',
      intent: 'inspiration',
      url: 'https://user:pass@example.com',
    },
  ])
    assert.equal(
      parse({
        ...draft,
        collection: { ...draft.collection, references: [reference] },
      }).length,
      0,
    );
});
void test('handoff preserves sources, reasons and intent without converting inspiration to endorsement', () => {
  const s = {
    ...sample(),
    collection: {
      ...sample().collection,
      description: '',
      references: [
        {
          id: 'photo',
          kind: 'image' as const,
          title: 'Magazine study',
          note: 'I like the torn edges; avoid the cramped type.',
          intent: 'inspiration' as const,
          asset: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',
        },
        {
          id: 'site',
          kind: 'link' as const,
          title: 'Letter archive',
          note: '',
          intent: 'direction' as const,
          url: 'https://example.com/letters',
        },
      ],
    },
  };
  assert.equal(parse(s).length, 1);
  const text = exportMarkdown(s);
  assert.match(text, /A personal writing space/);
  assert.match(text, /torn edges; avoid the cramped type/);
  assert.match(
    text,
    /\.incline\/assets\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png/,
  );
  assert.match(text, /https:\/\/example.com\/letters/);
  assert.match(text, /Inspiration/);
  assert.match(text, /Direction for this project/);
  assert.match(text, /No comparisons/);
});
void test('partial comparisons can accompany a collection without changing original notes', () => {
  const s = {
    ...sample(),
    answers: [
      {
        roundId: 'range-1',
        choice: 'depends' as const,
        reason: 'Different moods',
      },
    ],
  };
  assert.equal(parse(s).length, 1);
  assert.match(exportMarkdown(s), /Different moods/);
  assert.match(exportMarkdown(s), /Keep the text readable/);
});

void test('guide references preserve source qualifications and reject mismatched files or unsafe sources', () => {
  const guide = {
    id: 'guide',
    kind: 'guide',
    title: 'Editorial',
    note: 'Layout only',
    intent: 'inspiration',
    asset: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.md',
    url: 'https://example.com/design',
  };
  const withReference = (reference: unknown) => ({
    ...sample(),
    collection: {
      ...sample().collection,
      description: '',
      references: [reference],
    },
  });
  const valid = parse(withReference(guide));
  assert.equal(valid.length, 1);
  assert.deepEqual(valid[0].collection?.references[0], guide);
  const { url: _url, ...withoutSource } = guide;
  assert.equal(parse(withReference(withoutSource)).length, 1);
  for (const invalid of [
    { ...guide, asset: '../DESIGN.md' },
    { ...guide, asset: guide.asset.replace('.md', '.png') },
    { ...guide, url: 'javascript:alert(1)' },
    { ...guide, url: 'https://user:password@example.com' },
    { ...withoutSource, kind: 'image' },
  ])
    assert.equal(parse(withReference(invalid)).length, 0);
});
