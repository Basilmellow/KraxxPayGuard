import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { catalog, authorization, issueAuthorization } from './policy.mjs';
import { Store } from './store.mjs';
import { Agent } from './agent.mjs';
import { PayPal } from './paypal.mjs';
import { Payments } from './payments.mjs';
import { loadConfig } from './config.mjs';
import { headers, authenticate, mutationGuard, readJson, RateLimiter } from './security.mjs';
import { AppError, requireValue, exactObject } from './errors.mjs';

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
  const payments = new Payments(store, paypal, config.payeeId);
  const limiter = new RateLimiter(config.rateLimit);
  const agentLimiter = new RateLimiter(10);
  const securityAuditLimiter = new RateLimiter(10);
  const server = http.createServer(async (req, res) => {
    let actor;
    try {
      if (config.origin.startsWith('https:')) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      const path = new URL(req.url, config.origin).pathname;
      if (path.startsWith('/api/')) {
        limiter.check(`ip:${req.socket.remoteAddress}`);
        actor = authenticate(req, config);
        limiter.check(`actor:${actor.id}`);
        if (req.method === 'POST') mutationGuard(req, config);
        if (req.method === 'GET' && path === '/api/status') return send(res, 200, {
          status: 'ok', role: actor.role, paypalConfigured: paypal.configured,
          aiConfigured: agent.configured, model: config.openaiModel || null,
          providerMode: options.testProviders ? 'MOCK_TEST_FIXTURE' : 'REAL_APIS',
          authorization: { ...authorization, payeeId: config.payeeId }, policyVersion: 'pg-v2' });
        if (req.method === 'GET' && path === '/api/catalog') return send(res, 200, { catalog });
        if (req.method === 'GET' && path === '/api/audit') {
          requireValue(actor.role === 'operator', 403, 'Operator access required', 'OPERATOR_REQUIRED');
          return send(res, 200, { events: store.events() });
        }
        if (req.method === 'GET' && path === '/api/intents') return send(res, 200, { intents: store.list(actor.id, actor.role === 'operator') });
        if (req.method === 'POST' && path === '/api/authorizations') {
          const body = await readJson(req);
          const key = req.headers['idempotency-key'];
          requireValue(typeof key === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(key), 400, 'Idempotency-Key required');
          const auth = issueAuthorization(body, actor.id, config.payeeId);
          return send(res, 201, store.issue(auth, key, JSON.stringify(body)));
        }
        if (req.method === 'POST' && path === '/api/agent/runs') {
          const body = await readJson(req);
          exactObject(body, ['authorizationId', 'mode']);
          requireValue(typeof body.authorizationId === 'string' && ['live', 'deterministic'].includes(body.mode), 400, 'Invalid agent request');
          const auth = store.authorization(body.authorizationId);
          owns(auth, actor);
          agentLimiter.check(actor.id);
          const { item, fresh } = store.reserve(auth, body.mode);
          if (!fresh) return send(res, 200, item);
          const result = await agent.run(auth, body.mode);
          return send(res, 201, store.finishAgent(item, result.evaluation, result.agent));
        }
        const match = path.match(/^\/api\/intents\/([a-f0-9-]{36})(?:\/(review|checkout|capture))?$/);
        if (match) {
          const item = store.get(match[1]);
          owns(item, actor);
          if (req.method === 'GET' && !match[2]) return send(res, 200, item);
          if (req.method === 'POST' && match[2]) {
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
      if (req.method === 'GET' && ['/', '/app.js', '/style.css'].includes(path)) {
        const name = path === '/' ? 'index.html' : path.slice(1);
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
