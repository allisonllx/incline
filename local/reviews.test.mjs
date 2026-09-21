import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordFeedback, validateBatch } from './feedback.mjs';
import { saveInsight } from './insights.mjs';
import { listPendingEvidence, saveReview } from './reviews.mjs';
const batch = () => ({ id: 'batch', mode: 'live', coverage: { source: 'Synthetic conversation', limitations: [] }, artifacts: [], events: ['spacing', 'publish'].map(id => ({ id, kind: 'directed-edit', evidence: 'verbatim', text: id === 'spacing' ? 'Keep related controls together' : 'push', source: 'User', occurredAt: null, context: 'Synthetic lesson', artifactIds: [] })) });
async function setup(t) { const p = await mkdtemp(join(tmpdir(), 'incline-review-')); t.after(() => rm(p, {recursive:true, force:true})); return p; }
const review = (id, refs, action = 'no-change', revisions = []) => ({ id, events: refs, outcomes: [{eventRefs: refs, action, reason: 'Inspected in context', insightRevisions: revisions}] });
test('dispositions are additive, contextual and validated without interpreting words', () => {
 const legacy = batch(); const original = JSON.stringify(legacy); assert.deepEqual(validateBatch(legacy), legacy); assert.equal(JSON.stringify(legacy), original);
 for (const aesthetic of ['unknown','positive','preferred']) {
  const b = batch(); b.events[0].disposition = { publication:'unknown',readiness:'unknown',aesthetic,basis:'Context supplied by the user' }; assert.equal(validateBatch(b), b);
 }
 for (const change of [{publication:'yes'}, {basis:''}, {confidence:1}, {readiness:'excellent'}, {aesthetic:'perfect'}]) {
  const b = batch(); b.events[0].disposition = {publication:'unknown',readiness:'unknown',aesthetic:'unknown',basis:'Context',...change}; assert.throws(() => validateBatch(b));
 }
});
test('read-only pending creates nothing; legacy folders warn and malformed records fail', async t => {
 const p = await setup(t); assert.deepEqual(await listPendingEvidence(p), {pending:[],warnings:[]}); assert.deepEqual(await readdir(p), []);
 await mkdir(join(p,'.incline/feedback/legacy'), {recursive:true}); assert.equal((await listPendingEvidence(p)).warnings.length,1);
 await writeFile(join(p,'.incline/feedback/legacy/record.json'), '{}'); await assert.rejects(listPendingEvidence(p));
});
test('per-event receipts preserve archives, replay safely, defer and reopen changed hashes', async t => {
 const p = await setup(t); await recordFeedback(p,batch(),p);
 const path = join(p,'.incline/feedback/batch/record.json'); const original = await readFile(path,'utf8');
 const refs = (await listPendingEvidence(p)).pending;
 const r = review('one',[refs[0]]); assert.equal((await saveReview(p,r)).status,'saved'); assert.equal((await saveReview(p,r)).status,'already-recorded');
 await assert.rejects(saveReview(p,{...r,outcomes:[{...r.outcomes[0],reason:'different'}]}), /conflicting/);
 await saveReview(p,review('defer',[refs[1]],'deferred'));
 assert.deepEqual((await listPendingEvidence(p)).pending,[refs[1]]);
 assert.equal(await readFile(path,'utf8'),original);
 await writeFile(path,original+'\n'); assert.equal((await listPendingEvidence(p)).pending.length,2);
 await assert.rejects(saveReview(p,review('stale',[refs[1]])),/changed/);
});
test('updated receipts require exact linked revisions; incomplete and duplicate coverage rejected', async t => {
 const p = await setup(t); await recordFeedback(p,batch(),p); const refs = (await listPendingEvidence(p)).pending;
 await saveInsight(p,{id:'spacing',aspect:'spacing',finding:'Group related controls',scope:'lesson',status:'tentative',qualifications:[],openQuestions:[],supportingEvidence:[{batchId:'batch',eventId:'spacing'}],conflictingEvidence:[],expectedRevision:0});
 await assert.rejects(saveReview(p,review('wrong',[refs[1]],'updated',[{id:'spacing',revision:1}])),/link each/);
 await assert.rejects(saveReview(p,review('missing',[refs[0]],'updated',[{id:'spacing',revision:2}])));
 await assert.rejects(saveReview(p,{...review('partial',refs),outcomes:review('x',[refs[0]]).outcomes}),/exactly once/);
 await assert.rejects(saveReview(p,review('duplicate',[refs[0],refs[0]])),/duplicate/);
 const valid = review('updated',[refs[0]],'updated',[{id:'spacing',revision:1}]);
 const results = await Promise.all([saveReview(p,valid),saveReview(p,valid)]); assert.deepEqual(results.map(r=>r.status).sort(),['already-recorded','saved']);
 assert.deepEqual((await listPendingEvidence(p)).pending,[refs[1]]);
});

test('standalone packaged CLI reviews one batch without hiding another', async t => {
 const p = await setup(t);
 await recordFeedback(p,batch(),p);
 const second = batch(); second.id = 'second'; await recordFeedback(p,second,p);
 const installed = join(p,'installed'); await cp('skills/incline',installed,{recursive:true});
 const cli = join(installed,'scripts/insights.mjs');
 const run = async (...args) => JSON.parse((await exec(process.execPath,[cli,...args,'--project',p])).stdout);
 const {pending} = await run('pending'); assert.equal(pending.length,4);
 const input = join(p,'receipt.json'); await writeFile(input,JSON.stringify(review('cli',pending.filter(r=>r.batchId==='batch'))));
 assert.equal((await run('review','--input',input)).status,'saved');
 assert.equal((await run('review','--input',input)).status,'already-recorded');
 assert.deepEqual((await run('pending')).pending.map(r=>r.batchId),['second','second']);
});
test('review storage rejects symlink destinations', async t => {
 const p = await setup(t); await recordFeedback(p,batch(),p);
 const refs = (await listPendingEvidence(p)).pending;
 const elsewhere = await setup(t); await symlink(elsewhere,join(p,'.incline/reviews'));
 await assert.rejects(saveReview(p,review('redirect',refs)),/directory/);
 assert.deepEqual(await readdir(elsewhere),[]);
});
