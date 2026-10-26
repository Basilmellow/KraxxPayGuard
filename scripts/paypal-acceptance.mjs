// Explicit credentialed Sandbox acceptance harness. No mocks, state resets or new retries.
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { issueAuthorization } from '../src/policy.mjs';
import { Agent } from '../src/agent.mjs';
import { PayPal, verifyOrder } from '../src/paypal.mjs';
import { Payments } from '../src/payments.mjs';

const operation = process.argv[2] || 'inspect';
if (!['prepare', 'inspect', 'reconcile'].includes(operation)) throw Error('Use prepare, inspect or reconcile');
if (operation === 'reconcile' && !process.argv.includes('--buyer-approved'))
  throw Error('Capture-capable reconciliation requires explicit --buyer-approved after the test buyer approves. Use inspect for GET-only checks.');
mkdirSync('artifacts', { recursive: true });
// This harness uses explicit fixtures, so unrelated model configuration cannot block payments testing.
const config = loadConfig({ ...process.env, MODEL_PROVIDER: 'astropods', ASTRO_GATEWAY_URL: '', ASTRO_GATEWAY_API_KEY: '' });
const store = new Store('artifacts/paypal-acceptance.sqlite');
const observations = [];
const paypal = new PayPal(config, async (url, options) => {
  const response = await fetch(url, options);
  observations.push({ operation: url.includes('oauth2') ? 'OAUTH' : options.method === 'POST' ?
    url.endsWith('/capture') ? 'CAPTURE' : 'CREATE' : 'GET_ORDER', http: response.status });
  if (!response.ok) {
    const data = await response.clone().json().catch(() => ({}));
    observations.at(-1).issues = (data.details || []).map(x => x.issue).filter(x => /^[A-Z_]{1,80}$/.test(x));
  }
  return response;
});
const payments = new Payments(store, paypal, config.payeeId);
const cases = [['allow', 'notebook', 5000, 5000], ['review', 'console', 70000, 10000], ['block', 'notebook', 5000, 5000]];
try {
  if (operation === 'prepare') for (const [scenario, productId, budgetCents, autoLimitCents] of cases) {
    const body = { scenario, productId, budgetCents, autoLimitCents, instruction: `Sandbox acceptance: buy one ${productId} only from the authorized merchant.` };
    const auth = store.issue(issueAuthorization(body, 'shopper', config.payeeId), `acceptance-v1-${scenario}`, JSON.stringify(body));
    const reserved = store.reserve(auth, 'deterministic');
    if (reserved.fresh) {
      const result = await new Agent(config).run(auth, 'deterministic');
      store.finishAgent(reserved.item, result.evaluation, result.agent);
    }
  }
  for (const [scenario] of cases) {
    const item = store.list('shopper').find(x => x.authorization.scenario === scenario);
    if (!item) continue;
    if (operation === 'inspect' && item.payment.orderId) {
      const order = await paypal.show(item.payment.orderId);
      verifyOrder(order, item, ['CREATED', 'PAYER_ACTION_REQUIRED', 'APPROVED', 'COMPLETED', 'VOIDED']);
      console.log(JSON.stringify({ scenario, providerStatus: order.status, orderFieldsVerified: true }));
    }
    if (operation === 'prepare') {
      if (scenario !== 'allow') {
        try { await payments.run(item.id, 'checkout'); throw Error('DENIAL_INVARIANT_FAILED'); }
        catch (error) { if (error.status !== 403) throw error; }
      }
      if (scenario === 'review' && item.approval === 'PENDING') store.review(item.id, 'operator', true);
      if (scenario !== 'block' && !item.payment.orderId && !item.payment.createStartedAt) {
        try { await payments.run(item.id, 'checkout'); }
        catch (error) { console.log(JSON.stringify({ scenario, error: error.code || 'PROVIDER_UNAVAILABLE' })); }
      }
    }
    if (operation === 'reconcile' && item.payment.orderId && scenario !== 'block') {
      try { await payments.run(item.id, 'capture'); }
      catch (error) { console.log(JSON.stringify({ scenario, error: error.code || 'PROVIDER_UNAVAILABLE' })); }
    }
  }
  const evidence = { at: new Date().toISOString(), source: 'REAL_PAYPAL_SANDBOX', agentSource: 'DETERMINISTIC_FIXTURE', observations,
    cases: store.list('shopper').map(x => ({ scenario: x.authorization.scenario, intentId: x.id,
      decision: x.decision, review: x.approval, payment: x.payment.status, orderId: x.payment.orderId || null,
      captureVerified: x.payment.status === 'COMPLETED' && !!x.payment.captureId,
      auditEvents: x.audit.map(e => e.event) })) };
  writeFileSync(`artifacts/paypal-acceptance-${operation}.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
  if (operation === 'prepare') for (const x of store.list('shopper'))
    if (x.payment.approvalUrl) console.log(`${x.authorization.scenario} buyer approval: ${x.payment.approvalUrl}`);
} finally { store.close(); }
