import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExploration, explorationView } from './exploration-model.mjs';

const hash = 'a'.repeat(64);
const link = { batchId: 'batch', eventId: 'event', recordHash: hash };
function fixture() {
  return {
    version: 1,
    id: 'study',
    expectedRevision: 0,
    brief: {
      goal: 'Explore the reference',
      scope: 'Hero',
      constraints: ['Keep content'],
    },
    artifacts: [
      {
        id: 'ref',
        role: 'reference',
        source: { kind: 'study-file', path: 'ref.png', sha256: hash },
      },
    ],
    observations: [
      {
        id: 'o',
        artifactId: 'ref',
        basis: 'inspected',
        region: 'whole',
        state: 'static',
        description: 'Large central mass',
      },
    ],
    hypotheses: ['a', 'b', 'c'].map((id) => ({
      id,
      parentIds: id === 'c' ? ['a', 'b'] : [],
      observationIds: ['o'],
      claim: `Claim ${id}`,
      expectedChange: 'Focus attention',
      openQuestions: [],
    })),
    attempts: [
      {
        id: 'sample',
        hypothesisIds: ['a'],
        artifactIds: ['ref'],
        feedbackLinks: [],
      },
    ],
    decisions: [],
  };
}
function decision(id, action, nodeIds, extra = {}) {
  return {
    id,
    action,
    nodeIds,
    attemptIds: [],
    returnToIds: [],
    explanation: 'Try this',
    uncertainty: 'Interpretation remains provisional',
    revisitWhen: 'New evidence',
    basis: 'inference',
    feedbackLinks: [],
    ...extra,
  };
}
function snapshot(input) {
  return {
    ...input,
    revision: 1,
    recordedAt: '2026-09-22T00:00:00.000Z',
    requestHash: hash,
  };
}

test('validated data is independent and supports multiple parents', () => {
  const input = fixture();
  const result = validateExploration(input);
  result.hypotheses[0].claim = 'Different';
  assert.equal(input.hypotheses[0].claim, 'Claim a');
});

for (const [name, change] of [
  [
    'unknown fields',
    (x) => {
      x.confirmed = true;
    },
  ],
  [
    'nested unknown fields',
    (x) => {
      x.hypotheses[0].preferred = true;
    },
  ],
  [
    'missing array',
    (x) => {
      delete x.decisions;
    },
  ],
  [
    'duplicate IDs',
    (x) => {
      x.hypotheses.push(x.hypotheses[0]);
    },
  ],
  [
    'dangling evidence',
    (x) => {
      x.hypotheses[0].observationIds = ['missing'];
    },
  ],
  [
    'empty evidence',
    (x) => {
      x.hypotheses[0].observationIds = [];
    },
  ],
  [
    'cycles',
    (x) => {
      x.hypotheses[0].parentIds = ['c'];
    },
  ],
  [
    'invalid hash',
    (x) => {
      x.artifacts[0].source.sha256 = 'ABC';
    },
  ],
  [
    'absolute paths',
    (x) => {
      x.artifacts[0].source.path = '/ref.png';
    },
  ],
  [
    'parent paths',
    (x) => {
      x.artifacts[0].source.path = '../ref.png';
    },
  ],
  [
    'mixed source kinds',
    (x) => {
      x.artifacts[0].source.reason = 'Gone';
    },
  ],
  [
    'blank content',
    (x) => {
      x.brief.goal = ' ';
    },
  ],
  [
    'too-long content',
    (x) => {
      x.brief.goal = 'x'.repeat(4001);
    },
  ],
  [
    'unsafe revision',
    (x) => {
      x.expectedRevision = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    'duplicate references',
    (x) => {
      x.hypotheses[0].observationIds = ['o', 'o'];
    },
  ],
  [
    'empty instruction evidence',
    (x) => {
      x.decisions.push(
        decision('d', 'park', ['a'], { basis: 'user-instruction' }),
      );
    },
  ],
  [
    'return without target',
    (x) => {
      x.decisions.push(decision('d', 'return', ['a']));
    },
  ],
  [
    'overlapping return',
    (x) => {
      x.decisions.push(decision('d', 'return', ['a'], { returnToIds: ['a'] }));
    },
  ],
  [
    'combine one node',
    (x) => {
      x.decisions.push(decision('d', 'combine', ['a']));
    },
  ],
  [
    'unexpected return target',
    (x) => {
      x.decisions.push(decision('d', 'park', ['a'], { returnToIds: ['b'] }));
    },
  ],
])
  test(`rejects ${String(name)}`, () => {
    const input = fixture();
    change(input);
    assert.throws(() => validateExploration(input));
  });

test('append-only history allows new feedback but rejects changed meaning or reordered evidence', () => {
  const previous = snapshot(fixture());
  const next = fixture();
  next.expectedRevision = 1;
  next.attempts[0].feedbackLinks.push(link);
  assert.doesNotThrow(() => validateExploration(next, previous));
  for (const mutate of [
    (x) => (x.brief.goal = 'Changed'),
    (x) => x.hypotheses.reverse(),
    (x) => x.artifacts.pop(),
    (x) => x.attempts[0].hypothesisIds.push('b'),
  ]) {
    const bad = structuredClone(next);
    mutate(bad);
    assert.throws(() => validateExploration(bad, previous));
  }
  const later = structuredClone(next);
  later.expectedRevision = 2;
  later.attempts[0].feedbackLinks = [];
  assert.throws(() => validateExploration(later, { ...next, revision: 2 }));
});

test('supersession forms a single prior-row chain and flags dependent interpretation', () => {
  const input = fixture();
  input.observations.push({
    ...input.observations[0],
    id: 'o2',
    supersedesId: 'o',
    description: 'Corrected mass',
  });
  input.hypotheses.push({
    ...input.hypotheses[0],
    id: 'a2',
    supersedesId: 'a',
    observationIds: ['o2'],
  });
  validateExploration(input);
  const view = explorationView(snapshot(input), { nodeId: 'a' });
  assert.equal(view.nodes[0].replacementId, 'a2');
  assert.equal(view.nodes[0].needsReview, true);
  assert.ok(
    !explorationView(snapshot(input)).alternatives.some((n) => n.id === 'a'),
  );
  const bad = structuredClone(input);
  bad.observations.push({ ...bad.observations[1], id: 'o3' });
  assert.throws(() => validateExploration(bad));
  bad.observations[2].supersedesId = 'o2';
  assert.doesNotThrow(() => validateExploration(bad));
  input.observations[0].supersedesId = 'o2';
  assert.throws(() => validateExploration(input));
});

test('return changes explicit targets only, and finish requires an explicit reopen', () => {
  const input = fixture();
  input.decisions = [
    decision('d1', 'explore', ['c']),
    decision('d2', 'return', ['a'], { returnToIds: ['b'] }),
    decision('d3', 'finish', []),
  ];
  const view = explorationView(snapshot(input));
  assert.deepEqual(
    view.nodes.map((n) => n.id),
    ['b', 'c'],
  );
  assert.equal(view.parked[0].id, 'a');
  assert.equal(view.sessionState, 'finished');
  input.decisions.push(decision('d4', 'refine', ['b']));
  assert.throws(() => validateExploration(input));
  input.decisions.splice(3, 0, decision('resume', 'reopen', ['b']));
  assert.doesNotThrow(() => validateExploration(input));
});

test('node view preserves selected node, ancestor IDs, attempts, and evidence despite bounded arrays', () => {
  const input = fixture();
  input.attempts.push({
    ...input.attempts[0],
    id: 'sample2',
    hypothesisIds: ['c'],
    feedbackLinks: [link],
  });
  input.decisions = [
    decision('d1', 'explore', ['c']),
    decision('d2', 'park', ['c']),
  ];
  const view = explorationView(snapshot(input), { nodeId: 'c', limit: 1 });
  assert.equal(view.nodes[0].id, 'c');
  assert.deepEqual(view.ancestorIds, ['a', 'b']);
  assert.deepEqual(view.nodes[0].parentIds, ['a', 'b']);
  assert.deepEqual(view.nodes[0].attemptIds, ['sample2']);
  assert.equal(view.nodes[0].attempts[0].feedbackLinks[0].eventId, 'event');
  assert.equal(view.omitted.nodes, 2);
  assert.equal(view.decisions.length, 1);
  assert.equal(view.omitted.decisions, 1);
  assert.throws(() => explorationView(snapshot(input), { nodeId: 'missing' }));
  assert.throws(() => explorationView(snapshot(input), { limit: 0 }));
  assert.throws(() => explorationView(snapshot(input), { limit: 51 }));
});

test('a reaction never automatically parks related interpretations', () => {
  const input = fixture();
  input.attempts[0].feedbackLinks.push(link);
  const view = explorationView(snapshot(input));
  assert.equal(view.parked.length, 0);
  assert.equal(
    view.alternatives.find((n) => n.id === 'b').searchState,
    'untested',
  );
  assert.equal(view.nodes.find((n) => n.id === 'a').searchState, 'attempted');
});

test('bounded views retain IDs for omitted branches and expose complete source observations', () => {
  const input = fixture();
  const view = explorationView(snapshot(input), { limit: 1 });
  assert.deepEqual(view.alternativeIds, ['b', 'c']);
  assert.equal(view.alternatives.length, 1);
  assert.equal(view.omitted.alternatives, 1);
  assert.equal(view.nodes[0].sources[0].description, 'Large central mass');
});

test('resource limit rejects oversize data without changing it', () => {
  const input = fixture();
  input.brief.constraints = Array(300).fill('x'.repeat(4000));
  assert.throws(() => validateExploration(input), /1,000,000/);
  assert.equal(input.brief.constraints.length, 300);
});

test('a past inspection can be recorded with an explicit retention gap', () => {
  const input = fixture();
  input.artifacts[0].source = {
    kind: 'unavailable',
    reason: 'Inspected live, but no capture was retained',
  };
  const valid = validateExploration(input);
  assert.equal(valid.observations[0].basis, 'inspected');
  const view = explorationView(snapshot(valid));
  assert.equal(view.nodes[0].sources[0].source.kind, 'unavailable');
  assert.equal(view.nodes[0].sources[0].basis, 'inspected');
});

test('feedback sources and explicit instruction links are valid pending store resolution', () => {
  const input = fixture();
  input.artifacts[0].source = {
    kind: 'feedback',
    batchId: 'batch',
    artifactId: 'ref',
    recordHash: hash,
  };
  input.decisions.push(
    decision('instruction', 'park', ['a'], {
      basis: 'user-instruction',
      feedbackLinks: [link],
    }),
  );
  assert.doesNotThrow(() => validateExploration(input));
});

test('snapshot metadata is not accepted as input and view rejects an unsaved input', () => {
  assert.throws(
    () => validateExploration(snapshot(fixture())),
    /unknown field/,
  );
  assert.throws(() => explorationView(fixture()), /saved snapshot/);
});

test('targeted view includes bounded decision-named attempts without expanding sibling histories', () => {
  const input = fixture();
  input.attempts.push(
    {
      id: 'comparison-one',
      hypothesisIds: ['b'],
      artifactIds: ['ref'],
      feedbackLinks: [link],
    },
    {
      id: 'comparison-two',
      hypothesisIds: ['b'],
      artifactIds: ['ref'],
      feedbackLinks: [],
    },
    {
      id: 'unrelated',
      hypothesisIds: ['b'],
      artifactIds: ['ref'],
      feedbackLinks: [],
    },
  );
  input.decisions.push(
    decision('comparison', 'park', ['a'], {
      attemptIds: ['comparison-one', 'comparison-two'],
    }),
    decision('sibling', 'refine', ['b'], {
      attemptIds: ['comparison-one', 'unrelated'],
    }),
  );
  const view = explorationView(snapshot(input), { nodeId: 'a', limit: 1 });
  assert.deepEqual(view.decisionAttemptIds, [
    'comparison-one',
    'comparison-two',
  ]);
  assert.equal(view.decisionAttempts.length, 1);
  assert.equal(view.decisionAttempts[0].feedbackLinks[0].eventId, 'event');
  assert.equal(view.omitted.decisionAttempts, 1);
  assert.deepEqual(view.decisionIds, ['comparison']);
  assert.deepEqual(view.nodes[0].attemptIds, ['sample']);
});
