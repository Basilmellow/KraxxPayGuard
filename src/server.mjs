import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { catalog, merchants, merchantPayees, authorization, issueAuthorization, POLICY_VERSION } from './policy.mjs';
import { Store } from './store.mjs';
import { Agent } from './agent.mjs';
import { PayPal } from './paypal.mjs';
import { Payments } from './payments.mjs';
import { loadConfig } from './config.mjs';
import { headers, authenticate, mutationGuard, readJson, RateLimiter } from './security.mjs';
import { AppError, requireValue, exactObject } from './errors.mjs';
import { normalizeLab, publicPresets } from './lab.mjs';
import { decisionEvidence } from './evidence.mjs';
import { evaluateAttacks, judgeFixtures } from './evaluation.mjs';

const send = (res, status, payload) => {
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8',
    ...(status === 429 ? { 'Retry-After': '60' } : {}) });
  res.end(JSON.stringify(payload));
};
const owns = (item, actor) => requireValue(item && (item.owner === actor.id || actor.role === 'operator'), 404, 'Record not found');

export function makeServer(options = {}) {
  const config = options.config || loadConfig();
  const store = options.store || new Store(config.dbPath);
  const agent = options.agent || new Agent(config, options.modelFetch);
  const paypal = options.paypal || new PayPal({ ...config,
    payeeId: config.paypalMerchantConfigured ? config.payeeId : '' }, options.paypalFetch);
  const payees = merchantPayees(config);
  const providers = { 'kraxx-demo-store': paypal,
    'kraxx-lab-supply': new PayPal(config.secondaryPayPal || {}, options.secondaryPaypalFetch) };
  const payments = new Payments(store, paypal, payees, providers);
  const limiter = new RateLimiter(config.rateLimit);
  const agentLimiter = new RateLimiter(10);
  const securityAuditLimiter = new RateLimiter(10);
  const server = http.createServer(async (req, res) => {
    let actor;
    try {
      if (config.origin.startsWith('https:')) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      const path = new URL(req.url, config.origin).pathname;
      if (req.method === 'GET' && path === '/api/judge/demo') {
        limiter.check(`judge:${req.socket.remoteAddress}`);
        return send(res, 200, { source: 'JUDGE_FIXTURE', paymentExecution: false, modelCalls: 0,
          fixtures: judgeFixtures().map(item => ({ ...item, evidence: decisionEvidence(item, 'JUDGE_FIXTURE') })), evaluation: evaluateAttacks() });
      }
      if (options.judgeOnly && path.startsWith('/api/')) return send(res, 404, { error: 'Read-only judge mode; authenticated APIs are unavailable' });
      if (path.startsWith('/api/')) {
        limiter.check(`ip:${req.socket.remoteAddress}`);
        actor = authenticate(req, config);
        limiter.check(`actor:${actor.id}`);
        if (req.method === 'POST') mutationGuard(req, config);
        if (req.method === 'GET' && path === '/api/status') return send(res, 200, {
          status: 'ok', role: actor.role, paypalConfigured: paypal.configured,
          aiConfigured: agent.configured, model: config.openaiModel || null,
          providerMode: options.testProviders ? 'MOCK_TEST_FIXTURE' : 'REAL_APIS',
          authorization: { ...authorization, payeeId: config.payeeId }, policyVersion: POLICY_VERSION,
          merchants: Object.fromEntries(Object.entries(merchants).map(([id, label]) => [id, { label, payeeId: payees[id], checkoutConfigured: providers[id].configured }])) });
        if (req.method === 'GET' && path === '/api/catalog') return send(res, 200, { catalog, merchants });
        if (req.method === 'GET' && path === '/api/lab/presets') return send(res, 200, { presets: publicPresets() });
        if (req.method === 'GET' && path === '/api/lab/evaluation') return send(res, 200, evaluateAttacks());
        if (req.method === 'GET' && path === '/api/audit') {
          requireValue(actor.role === 'operator', 403, 'Operator access required', 'OPERATOR_REQUIRED');
          return send(res, 200, { events: store.events() });
        }
        if (req.method === 'GET' && path === '/api/intents') return send(res, 200, { intents: store.list(actor.id, actor.role === 'operator') });
        if (req.method === 'POST' && path === '/api/authorizations') {
          const body = await readJson(req);
          const key = req.headers['idempotency-key'];
          requireValue(typeof key === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(key), 400, 'Idempotency-Key required');
          const auth = issueAuthorization(body, actor.id, payees);
          return send(res, 201, store.issue(auth, key, JSON.stringify(body)));
        }
        if (req.method === 'POST' && path === '/api/agent/runs') {
          const body = await readJson(req);
          exactObject(body, ['authorizationId', 'mode', 'lab']);
          requireValue(typeof body.authorizationId === 'string' && ['live', 'deterministic'].includes(body.mode), 400, 'Invalid agent request');
          const auth = store.authorization(body.authorizationId);
          owns(auth, actor);
          agentLimiter.check(actor.id);
          const lab = normalizeLab(body.lab);
          const { item, fresh } = store.reserve(auth, body.mode, lab);
          if (!fresh) return send(res, 200, item);
          const result = await agent.run(auth, body.mode, lab);
          return send(res, 201, store.finishAgent(item, result.evaluation, result.agent));
        }
        const match = path.match(/^\/api\/intents\/([a-f0-9-]{36})(?:\/(review|checkout|capture|evidence))?$/);
        if (match) {
          const item = store.get(match[1]);
          owns(item, actor);
          if (req.method === 'GET' && !match[2]) return send(res, 200, item);
          if (req.method === 'GET' && match[2] === 'evidence') return send(res, 200,
            decisionEvidence(item, options.testProviders ? 'MOCK_TEST_FIXTURE' : 'REAL_APIS'));
          if (req.method === 'POST' && match[2]) {
            requireValue(match[2] !== 'evidence', 405, 'Evidence reports are read-only');
            const body = await readJson(req);
            if (match[2] === 'review') {
              requireValue(actor.role === 'operator', 403, 'Operator access required', 'OPERATOR_REQUIRED');
              exactObject(body, ['approve']);
              requireValue(typeof body.approve === 'boolean', 400, 'Boolean approve required');
              return send(res, 200, store.review(item.id, actor.id, body.approve));
            }
            exactObject(body, []);
            return send(res, 200, await payments.run(item.id, match[2]));
          }
        }
        return send(res, 404, { error: 'Not found' });
      }
      if (req.method === 'GET' && ['/', '/judge', '/app.js', '/style.css'].includes(path)) {
        const name = ['/', '/judge'].includes(path) ? 'index.html' : path.slice(1);
        const content = await readFile(new URL(`../public/${name}`, import.meta.url));
        res.writeHead(200, { ...headers, 'Content-Type': name.endsWith('.js') ? 'text/javascript; charset=utf-8' :
          name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' });
        return res.end(content);
      }
      return send(res, 404, { error: 'Not found' });
    } catch (error) {
      const known = error instanceof AppError;
      if (known && [400, 401, 403, 413, 415, 429].includes(error.status)) {
        try {
          securityAuditLimiter.check(req.socket.remoteAddress);
          store.event(null, actor?.id || 'anonymous', 'SECURITY_REQUEST_DENIED', { code: error.code });
        } catch { /* deny regardless; cap audit writes to resist denial floods */ }
      }
      return send(res, known ? error.status : 500, {
        error: known ? error.message : 'Internal request failure; payment denied',
        code: known ? error.code : 'INTERNAL_ERROR' });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.store = store;
  server.on('close', () => { if (!options.store) store.close(); });
  return server;
}

export function startServer() {
  try {
    const config = loadConfig();
    const server = makeServer({ config });
    server.listen(config.port, config.host, () => console.log(`Kraxx PayGuard: ${config.origin} (Sandbox only)`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    });
  } catch (error) {
    console.error(error instanceof AppError ? error.message : 'Server startup failed');
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startServer();
