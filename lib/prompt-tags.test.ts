import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagsFromText } from './prompt-tags.ts';

void test('unchanged duplicate facet/value lines retain distinct provenance on a revision edit', () => {
  const previous = [
    {
      facet: 'technique',
      value: 'bounded progress',
      provenance: 'source-text',
    },
    { facet: 'technique', value: 'bounded progress', provenance: 'user' },
  ];
  const edited = tagsFromText(
    'technique: bounded progress\ntechnique: bounded progress',
    previous,
  );
  assert.deepEqual(edited, previous);
  assert.notEqual(edited[0], edited[1]);
});

void test('a changed tag becomes user sourced without altering an unchanged peer', () => {
  const previous = [
    {
      facet: 'technique',
      value: 'bounded progress',
      provenance: 'source-text',
    },
    { facet: 'medium', value: 'motion', provenance: 'inspected-visual' },
  ];
  assert.deepEqual(
    tagsFromText(
      'technique: bounded progress\nmedium: live frontend',
      previous,
    ),
    [
      previous[0],
      { facet: 'medium', value: 'live frontend', provenance: 'user' },
    ],
  );
  assert.deepEqual(previous[1], {
    facet: 'medium',
    value: 'motion',
    provenance: 'inspected-visual',
  });
});
