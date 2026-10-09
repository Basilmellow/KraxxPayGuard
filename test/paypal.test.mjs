import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { Store } from '../src/store.mjs';
import { Payments } from '../src/payments.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Sandbox OAuth, explicit payee create, buyer approval and verified capture', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const created = await f.payments.run(f.item.id, 'checkout');
  assert.equal(created.payment.status, 'AWAITING_BUYER_APPROVAL');
  await assert.rejects(f.payments.run(f.item.id, 'capture'), /Buyer must approve/);
  f.fake.state.approved = true;
  const captured = await f.payments.run(f.item.id, 'capture');
  assert.equal(captured.payment.status, 'COMPLETED');
  assert.equal(captured.payment.captureId, 'CAPTURE12345');
  await f.payments.run(f.item.id, 'capture');
  assert.equal(f.fake.state.calls.filter(c => c.url.endsWith('/capture')).length, 1);
  assert.ok(f.fake.state.calls.every(c => c.url.startsWith('https://api-m.sandbox.paypal.com/')));
  const create = f.fake.state.calls.find(c => c.url.endsWith('/orders'));
  const unit = JSON.parse(create.body).purchase_units[0];
  assert.equal(unit.payee.merchant_id, f.auth.payeeId);
  assert.equal(unit.amount.value, '49.00');
  assert.equal(create.redirect, 'error');
  assert.equal(create.headers['PayPal-Request-Id'].length, 36);
  assert.equal(captured.audit.at(-1).event, 'PAYPAL_CAPTURE_VERIFIED');
});

test('BLOCK and unapproved/rejected REVIEW never call PayPal', async t => {
  for (const [product, scenario] of [['notebook', 'block'], ['console', 'review']]) {
    const f = fixture(product, scenario); t.after(() => f.store.close());
    await assert.rejects(f.payments.run(f.item.id, 'checkout'), /Policy denies/);
    assert.equal(f.fake.state.calls.length, 0);
    if (product === 'console') {
      f.store.review(f.item.id, 'operator', false);
      await assert.rejects(f.payments.run(f.item.id, 'checkout'), /Policy denies/);
      assert.equal(f.fake.state.calls.length, 0);
    } else assert.throws(() => f.store.review(f.item.id, 'operator', true), /Not pending/);
  }
});

test('operator approval permits REVIEW checkout within original budget', async t => {
  const f = fixture('console', 'review'); t.after(() => f.store.close());
  f.store.review(f.item.id, 'operator', true);
  const item = await f.payments.run(f.item.id, 'checkout');
  assert.equal(item.intent.amountCents, 65000);
  assert.equal(item.payment.status, 'AWAITING_BUYER_APPROVAL');
});

for (const [name, tamper] of [
  ['recipient', o => { o.purchase_units[0].payee.merchant_id = 'ATTACKER1234'; }],
  ['amount', o => { o.purchase_units[0].amount.value = '4900.00'; }],
  ['currency', o => { o.purchase_units[0].amount.currency_code = 'EUR'; }],
  ['item', o => { o.purchase_units[0].items[0].sku = 'console'; }],
  ['reference', o => { o.purchase_units[0].reference_id = 'another-intent'; }],
  ['consent reference', o => { o.purchase_units[0].custom_id = 'another-consent'; }],
  ['additional unit', o => { o.purchase_units.push(o.purchase_units[0]); }],
  ['order ID', o => { o.id = 'OTHER1234567'; }],
]) test(`reject altered PayPal ${name} before capture`, async t => {
  const f = fixture(); t.after(() => f.store.close());
  await f.payments.run(f.item.id, 'checkout');
  f.fake.state.approved = true;
  f.fake.state.tamper = tamper;
  await assert.rejects(f.payments.run(f.item.id, 'capture'), /does not match/);
  assert.equal(f.fake.state.calls.filter(c => c.url.endsWith('/capture')).length, 0);
});

test('reject unsafe PayPal approval link', async t => {
  const f = fixture(); t.after(() => f.store.close());
  f.fake.state.tamper = (o, phase) => { if (phase === 'create') o.links[0].href = 'https://www.paypal.com/checkoutnow?token=' + o.id; };
  await assert.rejects(f.payments.run(f.item.id, 'checkout'), /Unsafe PayPal/);
});

test('verify capture amount/status, never claim mismatched completion', async t => {
  const f = fixture(); t.after(() => f.store.close());
  await f.payments.run(f.item.id, 'checkout'); f.fake.state.approved = true;
  f.fake.state.tamper = o => { if (o.status === 'COMPLETED') o.purchase_units[0].payments.captures[0].amount.value = '0.01'; };
  await assert.rejects(f.payments.run(f.item.id, 'capture'), /capture evidence/);
  assert.notEqual(f.store.get(f.item.id).payment.status, 'COMPLETED');
});

test('concurrent create/capture claims prevent parallel payment requests', async t => {
  const f = fixture(); t.after(() => f.store.close()); f.fake.state.delay = 10;
  const creates = await Promise.allSettled([f.payments.run(f.item.id, 'checkout'), f.payments.run(f.item.id, 'checkout')]);
  assert.equal(creates.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.fake.state.orders.size, 1);
  f.fake.state.approved = true;
  const captures = await Promise.allSettled([f.payments.run(f.item.id, 'capture'), f.payments.run(f.item.id, 'capture')]);
  assert.equal(captures.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.fake.state.calls.filter(c => c.url.endsWith('/capture')).length, 1);
});

test('lost create response retries same request ID; lost capture reconciles via GET', async t => {
  const f = fixture(); t.after(() => f.store.close()); f.fake.state.loseCreate = true;
  await assert.rejects(f.payments.run(f.item.id, 'checkout'), /unavailable/);
  await f.payments.run(f.item.id, 'checkout');
  assert.equal(f.fake.state.orders.size, 1);
  const calls = f.fake.state.calls.filter(c => c.url.endsWith('/orders'));
  assert.equal(calls[0].headers['PayPal-Request-Id'], calls[1].headers['PayPal-Request-Id']);
  f.fake.state.approved = true; f.fake.state.loseCapture = true;
  await assert.rejects(f.payments.run(f.item.id, 'capture'), /unavailable/);
  const item = await f.payments.run(f.item.id, 'capture');
  assert.equal(item.payment.status, 'COMPLETED');
  assert.equal(item.audit.at(-1).event, 'PAYPAL_CAPTURE_RECONCILED');
  assert.equal(f.fake.state.calls.filter(c => c.url.endsWith('/capture')).length, 1);
});

test('durable history, request IDs and claims survive reopening SQLite', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'payguard-'));
  let reopened;
  t.after(async () => { reopened?.close(); await rm(directory, { recursive: true, force: true }); });
  const path = join(directory, 'test.sqlite'), f = fixture('notebook', 'allow', path);
  await f.payments.run(f.item.id, 'checkout');
  const before = f.store.get(f.item.id); f.store.close();
  reopened = new Store(path);
  assert.deepEqual(reopened.get(f.item.id), before);
  f.fake.state.approved = true;
  const payments = new Payments(reopened, f.paypal, f.settings.payeeId);
  const result = await payments.run(f.item.id, 'capture');
  assert.equal(result.payment.captureRequestId, before.payment.captureRequestId);
  assert.equal(result.payment.status, 'COMPLETED');
});

test('expired grants deny fresh checkout even when a cached decision allowed it', async t => {
  const f = fixture(); t.after(() => f.store.close());
  t.mock.method(Date, 'now', () => f.auth.expiresAt + 1);
  await assert.rejects(f.payments.run(f.item.id, 'checkout'), /expired/);
  assert.equal(f.fake.state.calls.length, 0);
});

test('completed capture reconciliation is permitted after expiry with no second POST', async t => {
  const f = fixture(); t.after(() => f.store.close());
  await f.payments.run(f.item.id, 'checkout');
  f.fake.state.approved = true; f.fake.state.loseCapture = true;
  await assert.rejects(f.payments.run(f.item.id, 'capture'));
  t.mock.method(Date, 'now', () => f.auth.expiresAt + 1);
  assert.equal((await f.payments.run(f.item.id, 'capture')).payment.status, 'COMPLETED');
  assert.equal(f.fake.state.calls.filter(c => c.url.endsWith('/capture')).length, 1);
});

test('expired grant prevents capture even if the buyer approved the order', async t => {
  const f = fixture(); t.after(() => f.store.close());
  await f.payments.run(f.item.id, 'checkout'); f.fake.state.approved = true;
  t.mock.method(Date, 'now', () => f.auth.expiresAt + 1);
  await assert.rejects(f.payments.run(f.item.id, 'capture'), /expired/);
  assert.equal(f.fake.state.calls.filter(c => c.url.endsWith('/capture')).length, 0);
});

test('create retry cutoff prevents a new POST outside provider retention', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const saved = f.store.get(f.item.id); saved.payment.createStartedAt = Date.now() - 6 * 60 * 60 * 1000; f.store.save(saved);
  await assert.rejects(f.payments.run(f.item.id, 'checkout'), /retry window expired/);
  assert.equal(f.fake.state.calls.length, 0);
});

test('capture retry cutoff permits GET only, never a late duplicate POST', async t => {
  const f = fixture(); t.after(() => f.store.close());
  await f.payments.run(f.item.id, 'checkout'); f.fake.state.approved = true;
  const saved = f.store.get(f.item.id); saved.payment.captureStartedAt = Date.now() - 6 * 60 * 60 * 1000; f.store.save(saved);
  await assert.rejects(f.payments.run(f.item.id, 'capture'), /retry window expired/);
  assert.equal(f.fake.state.calls.filter(c => c.url.endsWith('/capture')).length, 0);
});

for (const [name, change] of [
  ['pending', c => { c.status = 'PENDING'; }],
  ['nonfinal', c => { c.final_capture = false; }],
  ['missing capture ID', c => { delete c.id; }],
  ['wrong capture currency', c => { c.amount.currency_code = 'EUR'; }],
]) test(`reject ${name} capture evidence`, async t => {
  const f = fixture(); t.after(() => f.store.close());
  await f.payments.run(f.item.id, 'checkout'); f.fake.state.approved = true;
  f.fake.state.tamper = order => { if (order.status === 'COMPLETED') change(order.purchase_units[0].payments.captures[0]); };
  await assert.rejects(f.payments.run(f.item.id, 'capture'), /capture evidence/);
  assert.notEqual(f.store.get(f.item.id).payment.status, 'COMPLETED');
});

test('OAuth errors and provider redirect failures do not expose secrets', async t => {
  const f = fixture(); t.after(() => f.store.close());
  f.paypal.fetcher = async () => Response.json({ message: 'test-secret' }, { status: 401 });
  await assert.rejects(f.payments.run(f.item.id, 'checkout'), error =>
    error.message === 'PayPal Sandbox OAuth failed' && !error.message.includes('test-secret'));
  f.paypal.fetcher = async () => { throw Error('Redirect to live endpoint with test-secret'); };
  await assert.rejects(f.payments.run(f.item.id, 'checkout'), error => !error.message.includes('test-secret'));
  assert.ok(!JSON.stringify(f.store.events()).includes('test-secret'));
});

test('independent SQLite connections honor persistent lease and expired lease takeover', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'payguard-lease-'));
  const path = join(directory, 'test.sqlite');
  const f = fixture('notebook', 'allow', path), second = new Store(path);
  t.after(async () => { second.close(); f.store.close(); await rm(directory, { recursive: true, force: true }); });
  const first = f.store.claim(f.item.id);
  assert.throws(() => second.claim(f.item.id), /in progress/);
  t.mock.method(Date, 'now', () => f.auth.createdAt + 181000);
  const takeover = second.claim(f.item.id);
  assert.notEqual(takeover.token, first.token);
  assert.throws(() => f.store.checkpoint(first.item, first.token, 'STALE_WRITE'), /lease lost/);
  second.checkpoint(takeover.item, takeover.token, 'LEASE_RECOVERED', {}, true);
  assert.equal(second.get(f.item.id).audit.at(-1).event, 'LEASE_RECOVERED');
});
