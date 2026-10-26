import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { config, fixture, provider } from './helpers.mjs';
import { PayPal } from '../src/paypal.mjs';
import { acceptanceMain, captureCase, openRun, parseOptions, prepareCase, readSnapshot } from '../scripts/paypal-acceptance.mjs';

function temporary(t) {
  const root = mkdtempSync(join(tmpdir(), 'payguard-acceptance-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('capture CLI requires a named run, complete credentials selector, one case and both attestations', () => {
  for (const args of [ ['reconcile', '--buyer-approved'],
    ['reconcile', '--run', 'us-1', '--credentials-file', 'private.env', '--case', 'allow', '--buyer-approved'],
    ['reconcile', '--run', 'us-1', '--credentials-file', 'private.env', '--case', 'all', '--buyer-approved', '--authorize-capture'],
    ['reconcile', '--run', '../old', '--credentials-file', 'private.env', '--case', 'allow', '--buyer-approved', '--authorize-capture'],
    ['prepare'], ['prepare', '--run', 'us-1', '--credentials-file', 'private.env'],
    ['inspect', '--new-run'], ['inspect', '--unknown'] ]) assert.throws(() => parseOptions(args));
  assert.equal(parseOptions(['reconcile', '--run', 'us-1', '--credentials-file', 'private.env', '--case', 'allow',
    '--buyer-approved', '--authorize-capture']).scenario, 'allow');
});

test('isolated runs have distinct consent/request IDs, exclusive manifests and credential binding', async t => {
  const root = temporary(t), settings = config();
  const all = [];
  for (const name of ['run-a', 'run-b']) {
    const run = openRun(root, name, settings, true), store = new Store(run.path), fake = provider();
    try {
      const item = await prepareCase(store, settings, new PayPal(settings, fake.fetcher), run.manifest.id, 'allow');
      all.push(item);
      const prior = readSnapshot(run.path);
      const resumed = await prepareCase(store, settings, new PayPal(settings, fake.fetcher), run.manifest.id, 'allow');
      assert.equal(resumed.id, item.id);
      assert.deepEqual(readSnapshot(run.path), prior);
      assert.equal(fake.state.calls.filter(c => c.url.endsWith('/orders')).length, 1);
      assert.throws(() => openRun(root, name, settings, true));
      assert.throws(() => openRun(root, name, { ...settings, payeeId: 'DIFFERENT123' }));
      assert.throws(() => openRun(root, name, { ...settings, paypalClientId: 'other-client' }));
    } finally { store.close(); }
  }
  for (const read of [x => x.id, x => x.authorizationId, x => x.payment.createRequestId, x => x.payment.captureRequestId])
    assert.notEqual(read(all[0]), read(all[1]));
});

test('inspection uses readonly SQLite, sanitizes output and makes only OAuth/GET requests', async t => {
  const root = temporary(t), path = join(root, 'data', 'payguard.sqlite');
  const f = fixture('notebook', 'allow', path);
  await f.payments.run(f.item.id, 'checkout');
  f.store.close();
  const before = readFileSync(path), snapshots = readSnapshot(path), logs = [];
  f.fake.state.calls.length = 0;
  const report = await acceptanceMain(['inspect'], { root, env: {
    SHOPPER_TOKEN: 's'.repeat(64), OPERATOR_TOKEN: 'o'.repeat(64), PAYPAL_CLIENT_ID: f.settings.paypalClientId,
    PAYPAL_CLIENT_SECRET: f.settings.paypalClientSecret, PAYPAL_MERCHANT_ID: f.settings.payeeId,
  }, fetcher: f.fake.fetcher, log: value => logs.push(value) });
  assert.deepEqual(readFileSync(path), before);
  assert.deepEqual(readSnapshot(path), snapshots);
  assert.equal(report.databases[0].recordsUnchangedDuringInspection, true);
  assert.equal(report.databases[0].cases[0].providerStatus, 'PAYER_ACTION_REQUIRED');
  assert.ok(f.fake.state.calls.every(c => c.method === 'GET' || c.url.endsWith('/oauth2/token')));
  for (const value of [f.item.id, f.settings.payeeId, f.settings.paypalClientSecret, report.databases[0].cases[0].orderId])
    assert.ok(!logs.join('').includes(value));
});

test('pending order preflight makes no capture and leaves records and audit unchanged', async t => {
  const f = fixture(); t.after(() => f.store.close());
  await f.payments.run(f.item.id, 'checkout');
  const before = f.store.get(f.item.id); f.fake.state.calls.length = 0;
  await assert.rejects(captureCase(f.store, f.settings, f.paypal, 'allow'), /not approved/);
  assert.deepEqual(f.store.get(f.item.id), before);
  assert.ok(f.fake.state.calls.every(c => c.method === 'GET'));
});

test('approved capture verifies provider evidence and duplicates never make a second POST', async t => {
  const f = fixture(); t.after(() => f.store.close());
  await f.payments.run(f.item.id, 'checkout'); f.fake.state.approved = true;
  const result = await captureCase(f.store, f.settings, f.paypal, 'allow');
  assert.equal(result.duplicateCaptureVerified, true);
  assert.equal(result.item.payment.captureId, 'CAPTURE12345');
  assert.ok(result.item.audit.some(e => e.event === 'PAYPAL_CAPTURE_VERIFIED'));
  await captureCase(f.store, f.settings, f.paypal, 'allow');
  assert.equal(f.fake.state.calls.filter(c => c.url.endsWith('/capture')).length, 1);
});

test('expired approved order cannot capture and mismatch fails before capture', async t => {
  for (const mismatch of [false, true]) {
    const root = temporary(t), path = join(root, 'case.sqlite'), f = fixture('notebook', 'allow', path);
    try {
      await f.payments.run(f.item.id, 'checkout'); f.fake.state.approved = true;
      if (mismatch) f.fake.state.tamper = order => { order.purchase_units[0].amount.value = '0.01'; };
      else {
        const original = Date.now;
        Date.now = () => original() + 16 * 60 * 1000;
        try { await assert.rejects(captureCase(f.store, f.settings, f.paypal, 'allow'), /expired/); }
        finally { Date.now = original; }
      }
      if (mismatch) await assert.rejects(captureCase(f.store, f.settings, f.paypal, 'allow'), /does not match/);
      assert.equal(f.fake.state.calls.filter(c => c.url.endsWith('/capture')).length, 0);
    } finally { f.store.close(); }
  }
});

test('REVIEW rejects checkout/capture before approval; BLOCK never contacts provider', async t => {
  for (const scenario of ['review', 'block']) {
    const settings = config(), store = new Store(':memory:'), fake = provider();
    try {
      const item = await prepareCase(store, settings, new PayPal(settings, fake.fetcher), 'unique-run', scenario);
      assert.equal(item.decision, scenario.toUpperCase());
      assert.equal(item.audit.filter(e => e.event === 'PAYMENT_DENIED_OR_UNCERTAIN').length, 2);
      if (scenario === 'block') {
        assert.equal(fake.state.calls.length, 0);
        await assert.rejects(captureCase(store, settings, new PayPal(settings, fake.fetcher), 'block'));
      } else {
        assert.equal(item.approval, 'APPROVED');
        assert.equal(fake.state.calls.filter(c => c.url.endsWith('/orders')).length, 1);
        fake.state.approved = true;
        await captureCase(store, settings, new PayPal(settings, fake.fetcher), 'review');
      }
    } finally { store.close(); }
  }
});

test('partial credentials cannot inherit an old secret or mutate any run', async t => {
  const root = temporary(t), file = join(root, 'private.env');
  writeFileSync(file, 'PAYPAL_CLIENT_ID=new-client\nPAYPAL_MERCHANT_ID=MERCHANT12345\n');
  await assert.rejects(acceptanceMain(['prepare', '--run', 'new', '--new-run', '--case', 'allow', '--credentials-file', file],
    { root, env: { PAYPAL_CLIENT_SECRET: 'old-secret' }, fetcher: () => assert.fail('No provider calls') }), /complete matching/);
});

test('uncertain create is preserved on prepare replay with no second provider POST', async t => {
  const root = temporary(t), settings = config(), run = openRun(root, 'uncertain', settings, true);
  const store = new Store(run.path), fake = provider(), paypal = new PayPal(settings, fake.fetcher);
  try {
    fake.state.loseCreate = true;
    await assert.rejects(prepareCase(store, settings, paypal, run.manifest.id, 'allow'));
    const before = readSnapshot(run.path), item = store.list('shopper')[0];
    assert.equal(item.payment.status, 'CREATING');
    assert.ok(item.payment.createStartedAt);
    await prepareCase(store, settings, paypal, run.manifest.id, 'allow');
    assert.deepEqual(readSnapshot(run.path), before);
    assert.equal(fake.state.calls.filter(c => c.url.endsWith('/orders')).length, 1);
  } finally { store.close(); }
});

test('lost capture is reconciled from verified completed GET with the original operation IDs', async t => {
  const f = fixture(); t.after(() => f.store.close());
  await f.payments.run(f.item.id, 'checkout');
  const before = f.store.get(f.item.id);
  f.fake.state.approved = true; f.fake.state.loseCapture = true;
  await assert.rejects(captureCase(f.store, f.settings, f.paypal, 'allow'));
  const result = await captureCase(f.store, f.settings, f.paypal, 'allow');
  assert.equal(result.item.payment.captureRequestId, before.payment.captureRequestId);
  assert.equal(result.item.payment.createRequestId, before.payment.createRequestId);
  assert.equal(result.item.payment.orderId, before.payment.orderId);
  assert.ok(result.item.audit.some(e => e.event === 'PAYPAL_CAPTURE_RECONCILED'));
  assert.equal(f.fake.state.calls.filter(c => c.url.endsWith('/capture')).length, 1);
});

test('GET inspection distinguishes COMPLETED order from PENDING UNILATERAL capture without changing uncertain records', async t => {
  const root = temporary(t), path = join(root, 'data', 'payguard.sqlite');
  const f = fixture('notebook', 'allow', path);
  await f.payments.run(f.item.id, 'checkout'); f.fake.state.approved = true;
  f.fake.state.tamper = order => {
    if (order.status === 'COMPLETED') {
      order.purchase_units[0].payments.captures[0].status = 'PENDING';
      order.purchase_units[0].payments.captures[0].status_details = { reason: 'UNILATERAL' };
    }
  };
  await assert.rejects(f.payments.run(f.item.id, 'capture'), error => error.code === 'CAPTURE_MISMATCH');
  f.store.close();
  const before = readSnapshot(path), logs = [];
  f.fake.state.calls.length = 0;
  const report = await acceptanceMain(['inspect'], { root, env: {
    SHOPPER_TOKEN: 's'.repeat(64), OPERATOR_TOKEN: 'o'.repeat(64), PAYPAL_CLIENT_ID: f.settings.paypalClientId,
    PAYPAL_CLIENT_SECRET: f.settings.paypalClientSecret, PAYPAL_MERCHANT_ID: f.settings.payeeId,
  }, fetcher: f.fake.fetcher, log: value => logs.push(value) });
  const item = report.databases[0].cases[0];
  assert.equal(item.providerStatus, 'COMPLETED');
  assert.equal(item.captureVerified, false);
  assert.equal(item.payment, 'CAPTURING');
  assert.equal(item.error, 'CAPTURE_MISMATCH');
  assert.equal(item.providerCaptures[0].status, 'PENDING');
  assert.equal(item.providerCaptures[0].reason, 'UNILATERAL');
  assert.equal(item.providerCaptures[0].captureId, 'CAPTURE12345');
  assert.equal(item.providerCaptures[0].amountMatches, true);
  assert.equal(item.providerCaptures[0].currencyMatches, true);
  assert.ok(logs.join('').includes('UNILATERAL'));
  assert.ok(!logs.join('').includes('CAPTURE12345'));
  assert.ok(f.fake.state.calls.every(c => c.method === 'GET' || c.url.endsWith('/oauth2/token')));
  assert.deepEqual(readSnapshot(path), before);
});
