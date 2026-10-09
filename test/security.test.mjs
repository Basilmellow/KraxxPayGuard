import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFixture, consent, fixture } from './helpers.mjs';
import { issueAuthorization, evaluate, trustedIntent } from '../src/policy.mjs';
import { loadConfig } from '../src/config.mjs';

test('configuration requires distinct tokens and HTTPS remote hosting', () => {
  assert.throws(() => loadConfig({}), /tokens are required/);
  const env = { SHOPPER_TOKEN: 's'.repeat(64), OPERATOR_TOKEN: 'o'.repeat(64) };
  assert.throws(() => loadConfig({ ...env, HOST: '0.0.0.0' }), /HTTPS/);
  assert.throws(() => loadConfig({ ...env, OPERATOR_TOKEN: env.SHOPPER_TOKEN }), /tokens are required/);
  assert.equal(loadConfig({ ...env, HOST: '0.0.0.0', APP_ORIGIN: 'https://payguard.example' }).origin, 'https://payguard.example');
});

test('immutable original item, price and budget are independent of model', () => {
  const auth = issueAuthorization(consent(), 'shopper', 'MERCHANT12345');
  assert.ok(Object.isFrozen(auth));
  assert.equal(evaluate({ ...trustedIntent(auth), productId: 'console', amountCents: 65000 }, auth).decision, 'BLOCK');
  assert.equal(evaluate({ ...trustedIntent(auth), amountCents: 1 }, auth).decision, 'BLOCK');
  assert.equal(evaluate(trustedIntent(auth), { ...auth, budgetCents: 1000 }).decision, 'BLOCK');
  assert.equal(evaluate(trustedIntent(auth), auth, auth.expiresAt).decision, 'BLOCK');
  assert.throws(() => issueAuthorization({ ...consent(), autoLimitCents: 100000 }, 'shopper', 'MERCHANT12345'));
  assert.throws(() => issueAuthorization({ ...consent(), payeeId: 'attacker' }, 'shopper', 'MERCHANT12345'));
  assert.equal(evaluate({ ...trustedIntent(auth), productId: 'toString' }).decision, 'BLOCK');
});

test('database prevents consent mutation, audit deletion and replay', t => {
  const f = fixture(); t.after(() => f.store.close());
  assert.throws(() => f.store.db.exec("UPDATE authorizations SET data='{}'"), /Immutable/);
  assert.throws(() => f.store.db.exec('DELETE FROM audit'), /Append-only/);
  assert.equal(f.store.reserve(f.auth, 'deterministic').item.id, f.item.id);
  assert.equal(f.store.list('shopper').length, 1);
});

test('authentication, origin, CSRF header and content type enforced', async t => {
  const f = await apiFixture(); t.after(() => f.close());
  const unauth = await fetch(f.settings.origin + '/api/status');
  assert.equal(unauth.status, 401);
  assert.equal((await f.request('/api/status')).status, 200);
  const path = '/api/authorizations';
  for (const [extra, status] of [[{ Origin: 'https://evil.example' }, 403],
    [{ 'X-PayGuard-Request': '' }, 403], [{ 'Content-Type': 'text/plain' }, 415],
    [{ 'Sec-Fetch-Site': 'cross-site' }, 403]]) {
    assert.equal((await f.request(path, consent(), 'shopper', { 'Idempotency-Key': crypto.randomUUID(), ...extra })).status, status);
  }
  assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event='SECURITY_REQUEST_DENIED'").get().n, 4);
});

test('body bounds and invalid JSON reject before consent issuance', async t => {
  const f = await apiFixture(); t.after(() => f.close());
  for (const [body, expected] of [['{', 400], [JSON.stringify({ text: 'x'.repeat(17000) }), 413]]) {
    const response = await fetch(f.settings.origin + '/api/authorizations', { method: 'POST',
      headers: { Authorization: `Bearer ${f.settings.shopperToken}`, Origin: f.settings.origin,
        'X-PayGuard-Request': '1', 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, expected);
  }
});

test('only operator can review; blocked intent cannot be approved or captured', async t => {
  const f = await apiFixture(); t.after(() => f.close());
  const review = await f.run('console', 'review');
  assert.equal(review.body.decision, 'REVIEW');
  const path = `/api/intents/${review.body.id}`;
  assert.equal((await f.request(path + '/review', { approve: true })).status, 403);
  assert.equal((await f.request(path + '/checkout', {})).status, 403);
  assert.equal((await f.request(path + '/review', { approve: true }, 'operator')).status, 200);
  assert.equal((await f.request(path + '/checkout', {})).status, 200);
  const block = await f.run('notebook', 'block');
  assert.equal((await f.request(`/api/intents/${block.body.id}/review`, { approve: true }, 'operator')).status, 409);
  assert.equal((await f.request(`/api/intents/${block.body.id}/checkout`, {})).status, 403);
  assert.equal((await f.request(`/api/intents/${block.body.id}/capture`, {})).status, 403);
});

test('owner access and history isolation prevent shopper from reading operator records', async t => {
  const f = await apiFixture(); t.after(() => f.close());
  const owned = await f.run('notebook', 'allow', 'deterministic', 'operator');
  assert.equal((await f.request(`/api/intents/${owned.body.id}`)).status, 404);
  assert.equal((await f.request(`/api/intents/${owned.body.id}/checkout`, {})).status, 404);
  assert.equal((await f.request('/api/intents')).body.intents.length, 0);
  assert.equal((await f.request('/api/intents', undefined, 'operator')).body.intents.length, 1);
});

test('consent and agent requests are idempotent; forged client payment fields rejected', async t => {
  const f = await apiFixture(); t.after(() => f.close());
  const key = crypto.randomUUID(), extra = { 'Idempotency-Key': key };
  const a = await f.request('/api/authorizations', consent(), 'shopper', extra);
  const b = await f.request('/api/authorizations', consent(), 'shopper', extra);
  assert.equal(a.body.id, b.body.id);
  assert.equal((await f.request('/api/authorizations', { ...consent(), budgetCents: 6000 }, 'shopper', extra)).status, 409);
  const req = { authorizationId: a.body.id, mode: 'deterministic' };
  const first = await f.request('/api/agent/runs', req), second = await f.request('/api/agent/runs', req);
  assert.equal(first.body.id, second.body.id);
  const base = `/api/intents/${first.body.id}`;
  assert.equal((await f.request(base + '/checkout', { amountCents: 1, approved: true })).status, 400);
  assert.equal((await f.request('/api/agent/runs', { ...req, approval: 'APPROVED' })).status, 400);
  assert.equal((await f.request('/api/intents', { approved: true })).status, 404);
});

test('rate limiting covers failed authentication and returns retry hint', async t => {
  const f = await apiFixture({ config: { rateLimit: 2 } }); t.after(() => f.close());
  for (let i = 0; i < 2; i++) assert.equal((await fetch(f.settings.origin + '/api/status')).status, 401);
  const denied = await fetch(f.settings.origin + '/api/status');
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get('retry-after'), '60');
});

test('expired authorization and changed merchant config cannot initiate payment', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const expired = f.store.get(f.item.id); expired.authorization.expiresAt = 0; f.store.save(expired);
  await assert.rejects(f.payments.run(f.item.id, 'checkout'), /expired or policy changed/);
  assert.equal(f.fake.state.calls.length, 0);
  expired.authorization.expiresAt = Date.now() + 100000; f.store.save(expired);
  f.payments.payeeId = 'OTHER1234567';
  await assert.rejects(f.payments.run(f.item.id, 'checkout'), /policy changed/);
});
