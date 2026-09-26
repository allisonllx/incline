import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPromptStore } from './prompts.mjs';
import { savePromptSettings } from './prompt-settings.mjs';
import {
  previewPromptSelection,
  selectPrompt as actualSelectPrompt,
  validatePromptSelection,
} from './prompt-routing.mjs';

const selectPrompt = (project, input, options = {}) =>
  actualSelectPrompt(project, input, {
    readCurrentInput: async () => input,
    ...options,
  });
const input = {
  stage: {
    id: 'shade-input',
    revision: 'v1',
    brief: 'Map hand movement to the shade openness state',
    medium: 'live frontend',
  },
};
async function setup(t) {
  const project = await mkdtemp(join(tmpdir(), 'incline-route-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  const store = createPromptStore(join(project, '.incline', 'prompts'), {
    projectDirectory: project,
  });
  const first = await store.save({
    title: 'Hand motion',
    prompt: 'Preserve exact source text',
    origin: 'agent-authored',
    requirements: {
      effect: 'Map camera landmarks into bounded progress',
      medium: 'live frontend',
    },
  });
  await store.save({
    title: 'Direct drag',
    prompt: 'Drag a shade with a pointer',
    origin: 'agent-authored',
    requirements: {
      effect: 'Map pointer travel into bounded progress',
      medium: 'live frontend',
    },
  });
  await savePromptSettings(project, { recording: 'active' });
  return { project, store, first };
}
function response(preview, choice = 'c1', confidence = 0.95) {
  const options = Object.keys(preview.request.questions.recipe.criteria);
  return {
    model: 'jev-1.13.0',
    answers: {
      recipe: {
        type: 'choice',
        choice,
        confidence,
        probabilities: Object.fromEntries(
          options.map((key) => [key, key === choice ? 1 : 0]),
        ),
      },
    },
    usage: { input_tokens: 25, output_tokens: 7 },
  };
}
const reply = (data) => new Response(JSON.stringify(data), { status: 200 });
test('offline preview contains bounded metadata, no prompt bodies or local paths, and is read-only', async (t) => {
  const { project } = await setup(t);
  const before = await readdir(join(project, '.incline'));
  const preview = await previewPromptSelection(project, input);
  assert.equal(preview.candidates.length, 2);
  const payload = JSON.stringify(preview.request);
  assert.ok(!payload.includes(project));
  assert.ok(!payload.includes('Preserve exact source text'));
  assert.ok(payload.includes('abstain'));
  assert.deepEqual(await readdir(join(project, '.incline')), before);
});
test('an exact preview hash and active recording are required before any network request', async (t) => {
  const { project } = await setup(t);
  let calls = 0;
  const options = {
    apiKey: 'test',
    fetchImpl: async () => {
      calls++;
      return reply({});
    },
  };
  await assert.rejects(selectPrompt(project, input, options), /hash/i);
  const preview = await previewPromptSelection(project, input);
  await savePromptSettings(project, { recording: 'stopped' });
  await assert.rejects(
    selectPrompt(project, input, {
      ...options,
      requestHash: preview.requestHash,
    }),
    /changed/i,
  );
  const stoppedPreview = await previewPromptSelection(project, input);
  await assert.rejects(
    selectPrompt(project, input, {
      ...options,
      requestHash: stoppedPreview.requestHash,
    }),
    /recording/i,
  );
  assert.equal(calls, 0);
});
test('local-only and pinned routes skip selection; explicit exclusions are respected', async (t) => {
  const { project, first } = await setup(t);
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    throw new Error('unexpected call');
  };
  assert.equal(
    (await selectPrompt(project, input, { localOnly: true, fetchImpl })).reason,
    'local-only',
  );
  const pinned = {
    ...input,
    pinned: { scope: 'project', id: first.id, revision: first.revision },
  };
  assert.equal(
    (await selectPrompt(project, pinned, { fetchImpl })).reason,
    'pinned-choice',
  );
  const preview = await previewPromptSelection(project, {
    ...input,
    exclude: [first.id],
  });
  assert.equal(preview.skipReason, 'single-candidate');
  assert.equal(preview.candidates.length, 1);
  assert.equal(calls, 0);
});
test('valid selection records request, validation and advisory outcome without executing', async (t) => {
  const { project } = await setup(t);
  const preview = await previewPromptSelection(project, input);
  let calls = 0;
  const result = await selectPrompt(project, input, {
    requestHash: preview.requestHash,
    apiKey: 'test-secret',
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(JSON.parse(options.body), preview.request);
      return reply(response(preview));
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'advisory');
  assert.equal(result.selected.id, preview.candidates[0].id);
  const raw = await readFile(result.receiptPath, 'utf8');
  assert.ok(!raw.includes('test-secret'));
  const receipt = JSON.parse(raw);
  assert.equal(receipt.validation, 'accepted');
  assert.equal(receipt.outcome, null);
  assert.equal(receipt.cost, null);
});
test('abstention, uncertainty, invalid output and provider failure preserve ordinary retrieval without retries', async (t) => {
  const template = await setup(t);
  const templatePreview = await previewPromptSelection(template.project, input);
  const invalid = response(templatePreview);
  invalid.answers.recipe.choice = 'invented';
  for (const [reason, provider] of [
    ['abstained', async (preview) => reply(response(preview, 'abstain'))],
    ['uncertain', async (preview) => reply(response(preview, 'c1', 0.2))],
    ['invalid-response', async () => reply(invalid)],
    ['provider-http-429', async () => new Response('', { status: 429 })],
    [
      'request-failed',
      async () => {
        throw new Error('provider detail must not escape');
      },
    ],
  ]) {
    const { project } = await setup(t);
    const preview = await previewPromptSelection(project, input);
    let calls = 0;
    const result = await selectPrompt(project, input, {
      requestHash: preview.requestHash,
      apiKey: 'test',
      fetchImpl: async () => {
        calls++;
        return provider(preview);
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.reason, reason);
    assert.equal(result.selected, null);
    assert.equal(result.candidates.length, 2);
    assert.equal(
      JSON.parse(await readFile(result.receiptPath, 'utf8')).fallback,
      reason,
    );
  }
});
test('a changed prompt or stage invalidates a response before it is used', async (t) => {
  const { project, store, first } = await setup(t);
  const preview = await previewPromptSelection(project, input);
  const result = await selectPrompt(project, input, {
    requestHash: preview.requestHash,
    apiKey: 'test',
    fetchImpl: async () => {
      await store.save({
        id: first.id,
        baseRevision: first.revision,
        title: first.title,
        prompt: 'Different source',
        origin: first.origin,
      });
      return reply(response(preview));
    },
  });
  assert.equal(result.reason, 'stale-state');
  assert.equal(result.selected, null);
  const fresh = await previewPromptSelection(project, input);
  let sent = false;
  const changed = await selectPrompt(project, input, {
    requestHash: fresh.requestHash,
    apiKey: 'test',
    fetchImpl: async () => {
      sent = true;
      return reply(response(fresh));
    },
    readCurrentInput: async () => ({
      ...input,
      stage: { ...input.stage, revision: sent ? 'v2' : 'v1' },
    }),
  });
  assert.equal(changed.reason, 'stale-state');
});
test('a stop during the call retains no decision receipt', async (t) => {
  const { project } = await setup(t);
  const preview = await previewPromptSelection(project, input);
  const result = await selectPrompt(project, input, {
    requestHash: preview.requestHash,
    apiKey: 'test',
    fetchImpl: async () => {
      await savePromptSettings(project, { recording: 'stopped' });
      return reply(response(preview));
    },
  });
  assert.equal(result.reason, 'recording-stopped');
  assert.equal(result.receiptPath, null);
  assert.ok(
    !(await readdir(join(project, '.incline'))).includes('evaluations'),
  );
});
test('response distributions cannot omit candidates or contradict the selected choice', async (t) => {
  const { project } = await setup(t);
  const preview = await previewPromptSelection(project, input);
  const bad = response(preview);
  delete bad.answers.recipe.probabilities.c2;
  assert.throws(
    () => validatePromptSelection(bad, preview.request),
    /probabilities/i,
  );
  const wrong = response(preview);
  wrong.answers.recipe.choice = 'c2';
  assert.throws(
    () => validatePromptSelection(wrong, preview.request),
    /inconsistent/i,
  );
});

test('a real send requires a freshness reader and snapshots the exact sent bytes', async (t) => {
  const { project } = await setup(t);
  const current = structuredClone(input);
  const preview = await previewPromptSelection(project, current);
  await assert.rejects(
    actualSelectPrompt(project, current, {
      requestHash: preview.requestHash,
      apiKey: 'test',
    }),
    /readCurrentInput/,
  );
  let sent;
  const result = await selectPrompt(project, current, {
    requestHash: preview.requestHash,
    apiKey: 'test',
    fetchImpl: async (_, options) => {
      sent = options.body;
      current.stage.brief = 'Changed during dispatch';
      return reply(response(preview));
    },
  });
  assert.equal(result.reason, 'stale-state');
  const receipt = JSON.parse(await readFile(result.receiptPath, 'utf8'));
  assert.equal(receipt.serializedBody, sent);
  assert.deepEqual(receipt.request, JSON.parse(sent));
  assert.equal(receipt.payloadHash, preview.payloadHash);
  assert.equal(preview.stage.brief, input.stage.brief);
});
test('concurrent and repeated sends consume one call even after provider failure', async (t) => {
  const { project } = await setup(t);
  const preview = await previewPromptSelection(project, input);
  let calls = 0;
  const options = {
    requestHash: preview.requestHash,
    apiKey: 'test',
    fetchImpl: async () => {
      calls++;
      throw new Error('offline');
    },
  };
  const results = await Promise.allSettled([
    selectPrompt(project, input, options),
    selectPrompt(project, input, options),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  await assert.rejects(
    selectPrompt(project, input, options),
    /one-call budget/,
  );
  assert.equal(calls, 1);
});
test('invalid selections retain valid returned usage as cost evidence', async (t) => {
  const { project } = await setup(t);
  const preview = await previewPromptSelection(project, input);
  const invalid = response(preview);
  invalid.answers.recipe.choice = 'invented';
  invalid.usage = { input_tokens: 999, output_tokens: 7 };
  const result = await selectPrompt(project, input, {
    requestHash: preview.requestHash,
    apiKey: 'test',
    fetchImpl: async () => reply(invalid),
  });
  const receipt = JSON.parse(await readFile(result.receiptPath, 'utf8'));
  assert.equal(receipt.validation, 'rejected');
  assert.deepEqual(receipt.usage, invalid.usage);
  assert.equal(receipt.response, null);
});

test('freshness is checked before billing and provider failures survive stale-state fallback', async (t) => {
  const { project } = await setup(t);
  const current = structuredClone(input);
  const preview = await previewPromptSelection(project, current);
  let calls = 0;
  const options = {
    requestHash: preview.requestHash,
    apiKey: 'test',
    fetchImpl: async () => {
      calls++;
      current.stage.revision = 'v2';
      return new Response('', { status: 429 });
    },
  };
  await assert.rejects(
    selectPrompt(project, current, {
      ...options,
      readCurrentInput: async () => ({
        stage: { ...current.stage, revision: 'already-changed' },
      }),
    }),
    /changed before send/,
  );
  assert.equal(calls, 0);
  const result = await selectPrompt(project, current, options);
  const receipt = JSON.parse(await readFile(result.receiptPath, 'utf8'));
  assert.equal(receipt.fallback, 'stale-state');
  assert.equal(receipt.providerOutcome, 'provider-http-429');
  assert.equal(receipt.validation, 'stale');
});
test('a timed out request falls back once with its timeout outcome', async (t) => {
  const { project } = await setup(t);
  const preview = await previewPromptSelection(project, input);
  const result = await selectPrompt(project, input, {
    requestHash: preview.requestHash,
    apiKey: 'test',
    fetchImpl: async (_, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      throw new DOMException('timed out', 'TimeoutError');
    },
  });
  assert.equal(result.reason, 'request-timeout');
  assert.equal(
    JSON.parse(await readFile(result.receiptPath, 'utf8')).providerOutcome,
    'request-timeout',
  );
});
