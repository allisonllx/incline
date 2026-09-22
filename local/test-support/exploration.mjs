import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
export const seed = () => ({
  version: 1,
  id: 'study',
  expectedRevision: 0,
  brief: {
    goal: 'Explore a reference',
    scope: 'Opening section',
    constraints: ['Keep navigation'],
  },
  artifacts: [
    {
      id: 'ref',
      role: 'reference',
      source: { kind: 'unavailable', reason: 'Synthetic description only' },
    },
  ],
  observations: [
    {
      id: 'o1',
      artifactId: 'ref',
      basis: 'user-reported',
      region: 'Opening section',
      state: 'Description',
      description: 'A tree beside large typography',
    },
  ],
  hypotheses: [
    {
      id: 'nature',
      parentIds: [],
      observationIds: ['o1'],
      claim: 'Natural imagery may appeal',
      expectedChange: 'Explore organic focal imagery',
      openQuestions: ['Subject or treatment?'],
    },
    {
      id: 'type',
      parentIds: [],
      observationIds: ['o1'],
      claim: 'Type contrast may appeal',
      expectedChange: 'Explore contrasting scale',
      openQuestions: ['Does it fit the product?'],
    },
  ],
  attempts: [],
  decisions: [],
});
export const decision = (id, action, nodeIds, extra = {}) => ({
  id,
  action,
  nodeIds,
  attemptIds: [],
  returnToIds: [],
  explanation: 'Synthetic exploration decision',
  uncertainty: 'Cause remains unknown',
  revisitWhen: 'Relevant new evidence arrives',
  basis: 'inference',
  feedbackLinks: [],
  ...extra,
});
export async function projectFixture(t) {
  const project = await mkdtemp(join(tmpdir(), 'incline-exploration-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  return project;
}
