import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFixture, fixture } from './helpers.mjs';
import { decisionEvidence } from '../src/evidence.mjs';
import { evaluateAttacks } from '../src/evaluation.mjs';
import { makeServer } from '../src/server.mjs';

test('redacted evidence uses an allowlist and excludes private text, principals and provider IDs', () => {
  const f = fixture();
  try {
    const item = f.store.get(f.item.id);
    item.authorization.instruction = 'private instruction';
    item.authorization.beneficiary = { kind: 'team', label: 'private beneficiary' };
    item.agent.explanation = 'private rationale';
    item.agent.proposal = { merchantId: 'private merchant string', productId: 'private product string', payeeId: 'private recipient', currency: 'private currency', amountCents: 'private amount' };
    item.intent.untrustedContext = 'private attack'; item.lab = { id: 'custom', text: 'private payload' };
    item.payment.orderId = 'PRIVATE_ORDER'; item.payment.captureId = 'PRIVATE_CAPTURE';
    item.audit.push({ event: 'EVALUATED', at: new Date().toISOString(), seq: 99, actor: 'private actor', details: { raw: 'private details' } });
    const report = decisionEvidence(item, 'MOCK_TEST_FIXTURE');
    assert.ok(!JSON.stringify(report).includes('private'));
    for (const value of [item.id, item.authorizationId, item.payment.createRequestId, item.payment.captureRequestId, 'PRIVATE_ORDER', 'PRIVATE_CAPTURE'])
      assert.ok(!JSON.stringify(report).includes(value));
    assert.equal(report.source, 'MOCK_TEST_FIXTURE');
    assert.equal(report.payment.captureVerified, false);
    assert.equal(report.proposal.recipient, '[REDACTED]');
  } finally { f.store.close(); }
});
test('evidence endpoint requires ownership and cannot mutate a payment', async t => {
  const f = await apiFixture(); t.after(() => f.close());
  const run = await f.run('notebook', 'allow', 'deterministic', 'operator');
  const route = `/api/intents/${run.body.id}/evidence`;
  assert.equal((await f.request(route)).status, 404);
  const response = await f.request(route, undefined, 'operator');
  assert.equal(response.status, 200);
  assert.equal(response.body.source, 'MOCK_TEST_FIXTURE');
  assert.equal((await f.request(route, {}, 'operator')).status, 405);
  assert.deepEqual(f.fake.state.calls, []);
});
test('fixed evaluation records actual deterministic outcomes and false positives without model claims', () => {
  const report = evaluateAttacks();
  assert.equal(report.totals.scenarios, 12);
  assert.equal(report.totals.attacks, 9);
  assert.equal(report.totals.benign, 3);
  assert.equal(report.totals.unauthorizedProposalsAllowed, 0);
  assert.equal(report.totals.falsePositives, 0);
  assert.equal(report.actualModelCalls, 0);
  assert.equal(report.actualPayPalCalls, 0);
  assert.ok(report.rows.every(x => x.expected === x.actual));
});
test('public judge route exposes only synthetic fixtures and creates no durable records', async t => {
  const f = await apiFixture(); t.after(() => f.close());
  const response = await fetch(f.settings.origin + '/api/judge/demo');
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.paymentExecution, false);
  assert.deepEqual(data.fixtures.map(x => x.decision), ['ALLOW', 'REVIEW', 'BLOCK']);
  assert.ok(data.fixtures.every(x => x.source === 'JUDGE_FIXTURE' && !x.payment.orderId));
  assert.equal(f.store.list('shopper', true).length, 0);
  assert.deepEqual(f.fake.state.calls, []);
  assert.ok(!JSON.stringify(data).includes(f.settings.payeeId));
  assert.ok(!JSON.stringify(data).includes(f.settings.shopperToken));
  assert.equal((await fetch(f.settings.origin + '/api/intents')).status, 401);
});
test('judge-only server disables authenticated execution routes even with a valid token', async t => {
  const f = await apiFixture(); t.after(() => f.close());
  const server = makeServer({ config: { ...f.settings, dbPath: ':memory:' }, judgeOnly: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin + '/api/judge/demo')).status, 200);
  assert.equal((await fetch(origin + '/api/intents', { headers: { Authorization: `Bearer ${f.settings.shopperToken}` } })).status, 404);
});
