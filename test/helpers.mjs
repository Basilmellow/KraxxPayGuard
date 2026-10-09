import { Store } from '../src/store.mjs';
import { issueAuthorization, trustedIntent, evaluate } from '../src/policy.mjs';
import { PayPal } from '../src/paypal.mjs';
import { Payments } from '../src/payments.mjs';
import { makeServer } from '../src/server.mjs';

export const config = () => ({ origin: 'http://127.0.0.1:3000', host: '127.0.0.1', port: 3000,
  dbPath: ':memory:', operatorToken: 'o'.repeat(64), shopperToken: 's'.repeat(64),
  payeeId: 'MERCHANT12345', paypalMerchantConfigured: true,
  paypalClientId: 'test-client', paypalClientSecret: 'test-secret',
  openaiKey: '', openaiModel: '', rateLimit: 10000 });
export const consent = (productId = 'notebook', scenario = 'allow') => ({ productId, scenario,
  budgetCents: productId === 'console' ? 70000 : 5000, autoLimitCents: productId === 'console' ? 10000 : 5000,
  instruction: `Buy one ${productId} from the selected store within the displayed budget.` });

export function provider() {
  const state = { calls: [], orders: new Map(), approved: false, loseCreate: false,
    loseCapture: false, tamper: null, delay: 0 };
  const fetcher = async (url, options) => {
    state.calls.push({ url, ...options });
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'fake-test-token', expires_in: 3600 });
    const capture = url.endsWith('/capture');
    if (options.method === 'POST' && !capture) {
      const key = options.headers['PayPal-Request-Id'];
      if (!state.orders.has(key)) {
        const body = JSON.parse(options.body);
        state.orders.set(key, { id: `ORDER${String(state.orders.size + 1).padStart(8, '0')}`, intent: body.intent,
          status: 'PAYER_ACTION_REQUIRED', purchase_units: body.purchase_units });
      }
      const order = state.orders.get(key);
      if (state.loseCreate) { state.loseCreate = false; throw Error('Simulated response loss'); }
      const result = structuredClone(order);
      result.links = [{ rel: 'payer-action', href: `https://www.sandbox.paypal.com/checkoutnow?token=${order.id}` }];
      state.tamper?.(result, 'create');
      return Response.json(result, { status: 201 });
    }
    const id = url.split('/').at(capture ? -2 : -1);
    const order = [...state.orders.values()].find(value => value.id === id);
    if (!order) return Response.json({}, { status: 404 });
    if (capture) {
      order.status = 'COMPLETED';
      order.purchase_units[0].payments = { captures: [{ id: 'CAPTURE12345', status: 'COMPLETED',
        final_capture: true, amount: { currency_code: order.purchase_units[0].amount.currency_code,
          value: order.purchase_units[0].amount.value } }] };
      if (state.loseCapture) { state.loseCapture = false; throw Error('Simulated response loss after capture'); }
      return Response.json({ id: order.id, status: 'COMPLETED' });
    }
    const result = structuredClone(order);
    if (state.approved && result.status !== 'COMPLETED') result.status = 'APPROVED';
    state.tamper?.(result, 'show');
    return Response.json(result);
  };
  return { state, fetcher };
}

export function fixture(productId = 'notebook', scenario = 'allow', path = ':memory:') {
  const settings = config(), store = new Store(path), fake = provider();
  const auth = issueAuthorization(consent(productId, scenario), 'shopper', settings.payeeId);
  store.issue(auth, auth.id, '{}');
  const { item } = store.reserve(auth, 'deterministic');
  const proposal = trustedIntent(auth);
  if (scenario === 'block') proposal.payeeId = 'attacker';
  const saved = store.finishAgent(item, evaluate(proposal, auth), { mode: 'deterministic', status: 'COMPLETED' });
  const paypal = new PayPal(settings, fake.fetcher);
  return { settings, store, fake, auth, item: saved, paypal,
    payments: new Payments(store, paypal, settings.payeeId) };
}

export async function apiFixture(options = {}) {
  const settings = { ...config(), ...options.config }, fake = provider(), store = new Store(':memory:');
  const server = makeServer({ testProviders: true, ...options, config: settings, store, paypalFetch: fake.fetcher });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  settings.origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, role = 'shopper', extra = {}) => {
    const result = await fetch(settings.origin + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${role === 'operator' ? settings.operatorToken : settings.shopperToken}`,
        Origin: settings.origin, 'Content-Type': 'application/json', 'X-PayGuard-Request': '1', ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: result.status, body: await result.json(), headers: result.headers };
  };
  const run = async (product = 'notebook', scenario = 'allow', mode = 'deterministic', role = 'shopper') => {
    const issued = await request('/api/authorizations', consent(product, scenario), role, { 'Idempotency-Key': crypto.randomUUID() });
    return request('/api/agent/runs', { authorizationId: issued.body.id, mode }, role);
  };
  return { settings, fake, store, server, request, run,
    async close() {
      await new Promise(resolve => {
        server.close(resolve);
        // Browser preconnect sockets can remain open during test fixture replacement.
        server.closeAllConnections();
      });
      store.close();
    } };
}
