// Explicit Sandbox acceptance. No resets, expiry overrides or implicit capture.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { loadConfig } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { issueAuthorization } from '../src/policy.mjs';
import { Agent } from '../src/agent.mjs';
import { PayPal, SANDBOX_API, verifyOrder, verifyCapture } from '../src/paypal.mjs';
import { Payments } from '../src/payments.mjs';

function ensure(value, message) {
  if (!value) throw Object.assign(Error(message), { code: 'ACCEPTANCE_STOPPED', safeMessage: message });
}
export function parseOptions(args) {
  const o = { operation: args[0] || 'inspect', scenario: 'all' };
  ensure(['inspect', 'prepare', 'reconcile'].includes(o.operation), 'Use inspect, prepare or reconcile.');
  for (let i = 1; i < args.length; i++) {
    const key = args[i];
    if (['--run', '--case', '--credentials-file'].includes(key)) {
      ensure(args[i + 1] && !args[i + 1].startsWith('--'), 'Missing option value.');
      const value = args[++i];
      if (key === '--run') o.run = value;
      if (key === '--case') o.scenario = value;
      if (key === '--credentials-file') o.credentialsFile = value;
    } else if (['--new-run', '--buyer-approved', '--authorize-capture'].includes(key)) o[key.slice(2)] = true;
    else ensure(false, 'Unknown acceptance option.');
  }
  ensure(!o.run || /^[a-z0-9][a-z0-9-]{0,47}$/.test(o.run), 'Invalid run name: use 1–48 lowercase letters, digits or hyphens.');
  ensure(['all', 'allow', 'review', 'block'].includes(o.scenario), 'Choose allow, review, block or all.');
  if (o.operation !== 'inspect') {
    ensure(o.run && o.credentialsFile, 'Mutations require a named run and explicit credentials file. Legacy attempts are inspection-only.');
    ensure(o.scenario !== 'all', 'Select one case per preparation or capture.');
  }
  ensure(!o['new-run'] || o.operation === 'prepare', '--new-run is only valid for prepare.');
  if (o.operation === 'reconcile') ensure(o['buyer-approved'] && o['authorize-capture'] && o.scenario !== 'block',
    'Capture requires one ALLOW/REVIEW case, actual buyer approval and explicit --authorize-capture.');
  return o;
}
// No Store constructor, migrations, PRAGMA changes, leases or audit writes.
export function readSnapshot(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return { intents: db.prepare('SELECT data FROM intents ORDER BY rowid').all().map(r => JSON.parse(r.data)),
      authorizations: db.prepare('SELECT * FROM authorizations ORDER BY rowid').all(),
      audit: db.prepare('SELECT * FROM audit ORDER BY seq').all() };
  } finally { db.close(); }
}
export function fingerprint(config) {
  return createHash('sha256').update(JSON.stringify([SANDBOX_API, config.paypalClientId, config.payeeId])).digest('hex');
}
export function openRun(root, name, config, fresh = false) {
  ensure(/^[a-z0-9][a-z0-9-]{0,47}$/.test(name), 'Invalid run name.');
  const directory = join(root, 'artifacts', 'paypal-acceptance-runs', name);
  const manifestPath = join(directory, 'run.json');
  if (fresh) {
    mkdirSync(join(root, 'artifacts', 'paypal-acceptance-runs'), { recursive: true });
    mkdirSync(directory); // Exclusive: an existing attempt can never be reset.
    writeFileSync(manifestPath, JSON.stringify({ schema: 1, id: randomUUID(), createdAt: new Date().toISOString(),
      provider: 'PAYPAL_SANDBOX', credentialBinding: fingerprint(config) }, null, 2), { flag: 'wx', mode: 0o600 });
  }
  ensure(existsSync(manifestPath), 'Run not found. Use prepare --new-run once.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  ensure(manifest.provider === 'PAYPAL_SANDBOX' && manifest.credentialBinding === fingerprint(config),
    'Run credential binding differs. Preserve this run and select its original REST app credentials.');
  return { directory, manifest, path: join(directory, 'acceptance.sqlite') };
}
export function discoverDatabases(root) {
  const found = [];
  function visit(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.sqlite$/.test(entry.name)) found.push(path);
    }
  }
  visit(join(root, 'data')); visit(join(root, 'artifacts'));
  return found;
}
const cases = { allow: ['notebook', 5000, 5000], review: ['console', 70000, 10000], block: ['notebook', 5000, 5000] };
export async function prepareCase(store, config, paypal, runId, scenario) {
  const [productId, budgetCents, autoLimitCents] = cases[scenario];
  const body = { scenario, productId, budgetCents, autoLimitCents,
    instruction: `Sandbox acceptance: buy one ${productId} only from the authorized merchant.` };
  const auth = store.issue(issueAuthorization(body, 'shopper', config.payeeId), `${runId}-${scenario}`, JSON.stringify(body));
  const reserved = store.reserve(auth, 'deterministic');
  let item = reserved.item;
  if (reserved.fresh) {
    const result = await new Agent(config).run(auth, 'deterministic');
    item = store.finishAgent(item, result.evaluation, result.agent);
  }
  const payments = new Payments(store, paypal, config.payeeId);
  if (scenario === 'block' || (scenario === 'review' && item.approval === 'PENDING')) {
    for (const operation of ['checkout', 'capture']) {
      try { await payments.run(item.id, operation); ensure(false, 'Denial invariant failed.'); }
      catch (error) { if (error.status !== 403) throw error; }
    }
  }
  if (scenario === 'review' && item.approval === 'PENDING') store.review(item.id, 'operator', true);
  item = store.get(item.id);
  // No automatic retry of any previous uncertain create.
  if (scenario !== 'block' && !item.payment.orderId && !item.payment.createStartedAt)
    await payments.run(item.id, 'checkout');
  return store.get(item.id);
}
export async function captureCase(store, config, paypal, scenario) {
  ensure(['allow', 'review'].includes(scenario), 'Only ALLOW/REVIEW can capture.');
  const items = store.list('shopper').filter(x => x.authorization.scenario === scenario);
  ensure(items.length === 1 && items[0].payment.orderId, 'Select exactly one existing order.');
  const item = items[0];
  const order = await paypal.show(item.payment.orderId);
  verifyOrder(order, item, ['APPROVED', 'COMPLETED', 'CREATED', 'PAYER_ACTION_REQUIRED', 'VOIDED']);
  ensure(['APPROVED', 'COMPLETED'].includes(order.status), 'Provider has not approved this order. GET only; no capture submitted.');
  if (order.status === 'COMPLETED') verifyCapture(order, item);
  const payments = new Payments(store, paypal, config.payeeId);
  const result = await payments.run(item.id, 'capture');
  const verified = await paypal.show(item.payment.orderId);
  const captureId = verifyCapture(verified, result);
  ensure(result.payment.captureId === captureId, 'Stored capture differs from provider evidence.');
  const duplicate = await payments.run(item.id, 'capture');
  ensure(duplicate.payment.captureId === captureId, 'Duplicate reconciliation changed capture ID.');
  return { item: duplicate, duplicateCaptureVerified: true };
}

export async function acceptanceMain(args, { root = process.cwd(), env = process.env, fetcher = fetch, log = console.log } = {}) {
  const o = parseOptions(args);
  let credentials = {};
  if (o.credentialsFile) {
    credentials = parseEnv(readFileSync(resolve(root, o.credentialsFile), 'utf8'));
    ensure(['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_MERCHANT_ID'].every(k => credentials[k]?.trim()),
      'Credentials file must contain the complete matching Sandbox REST app credential set.');
    ensure(Object.keys(credentials).every(k => ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_MERCHANT_ID'].includes(k)),
      'Credentials file may contain only the three Sandbox credential variables.');
  }
  const config = loadConfig({ ...env, ...credentials, MODEL_PROVIDER: 'astropods', ASTRO_GATEWAY_URL: '', ASTRO_GATEWAY_API_KEY: '' });
  const observations = [];
  const paypal = new PayPal(config, async (url, request) => {
    ensure(url.startsWith(`${SANDBOX_API}/`), 'Sandbox API only.');
    ensure(o.operation !== 'inspect' || request.method === 'GET' || url === `${SANDBOX_API}/v1/oauth2/token`, 'Inspection forbids payment mutations.');
    const record = { operation: url.includes('oauth2') ? 'OAUTH' : request.method === 'POST' ?
      url.endsWith('/capture') ? 'CAPTURE' : 'CREATE' : 'GET_ORDER' };
    observations.push(record);
    try {
      const response = await fetcher(url, request);
      record.http = response.status;
      if (!response.ok) {
        const data = await response.clone().json().catch(() => ({}));
        record.issues = (Array.isArray(data.details) ? data.details : []).map(x => x.issue).filter(x => /^[A-Z_]{1,80}$/.test(x));
      }
      return response;
    } catch (error) { record.error = 'RESPONSE_UNAVAILABLE'; throw error; }
  });
  let run;
  const report = { at: new Date().toISOString(), source: 'REAL_PAYPAL_SANDBOX', agentSource: 'DETERMINISTIC_FIXTURE',
    operation: o.operation, observations, databases: [] };
  if (o.run) run = openRun(root, o.run, config, o['new-run']);
  if (o.operation !== 'inspect') {
    ensure(o['new-run'] || existsSync(run.path), 'Existing run database is missing; do not recreate it.');
    const store = new Store(run.path);
    try {
      if (o.operation === 'prepare') {
        const item = await prepareCase(store, config, paypal, run.manifest.id, o.scenario);
        if (item.payment.approvalUrl) report.buyerApprovalUrl = item.payment.approvalUrl;
      } else report.duplicateCaptureVerified = (await captureCase(store, config, paypal, o.scenario)).duplicateCaptureVerified;
    } catch (error) { report.error = error.code || 'ACCEPTANCE_STOPPED'; report.blocker = error.safeMessage || 'Provider or policy denied operation; preserve run and inspect.'; }
    finally { store.close(); }
  }
  for (const path of run ? [run.path] : discoverDatabases(root)) {
    let before;
    try { before = readSnapshot(path); }
    catch { report.databases.push({ path, error: 'SNAPSHOT_UNAVAILABLE' }); continue; }
    const results = [];
    for (const item of before.intents) {
      if (o.scenario !== 'all' && item.authorization.scenario !== o.scenario) continue;
      const result = { intentId: item.id, scenario: item.authorization.scenario, decision: item.decision,
        review: item.approval, payment: item.payment.status, orderId: item.payment.orderId || null,
        createRequestId: item.payment.createRequestId, captureRequestId: item.payment.captureRequestId,
        captureId: item.payment.captureId || null, captureVerified: false,
        auditEvents: before.audit.filter(e => e.intent_id === item.id).map(e => e.event) };
      results.push(result);
      if (!item.payment.orderId) continue;
      if (item.intent.payeeId !== config.payeeId) { result.error = 'ORIGINAL_MERCHANT_CREDENTIALS_REQUIRED'; continue; }
      try {
        const order = await paypal.show(item.payment.orderId);
        verifyOrder(order, item, ['CREATED', 'PAYER_ACTION_REQUIRED', 'APPROVED', 'COMPLETED', 'VOIDED']);
        result.providerStatus = order.status; result.orderFieldsVerified = true;
        // Order COMPLETED is not capture COMPLETED. Keep pending capture evidence
        // separate from the verified local capture ID; never mutate it on inspection.
        result.providerCaptures = (order.purchase_units[0].payments?.captures || []).map(c => ({
          captureId: /^[A-Z0-9]{8,32}$/.test(c.id || '') ? c.id : null,
          status: ['COMPLETED', 'DECLINED', 'PARTIALLY_REFUNDED', 'PENDING', 'REFUNDED', 'FAILED'].includes(c.status) ? c.status : 'UNKNOWN',
          reason: /^[A-Z_]{1,80}$/.test(c.status_details?.reason || '') ? c.status_details.reason : null,
          finalCapture: c.final_capture === true,
          amountMatches: c.amount?.value === (item.intent.amountCents / 100).toFixed(2),
          currencyMatches: c.amount?.currency_code === item.intent.currency,
        }));
        if (order.status === 'COMPLETED') { result.captureId = verifyCapture(order, item); result.captureVerified = true; }
      } catch (error) { result.error = error.code || 'PROVIDER_UNAVAILABLE'; }
    }
    const after = readSnapshot(path);
    report.databases.push({ path, recordsUnchangedDuringInspection: JSON.stringify(before) === JSON.stringify(after), cases: results });
  }
  mkdirSync(join(root, 'artifacts'), { recursive: true });
  const evidencePath = join(run?.directory || join(root, 'artifacts'), `inspection-${Date.now()}-${randomUUID()}.json`);
  writeFileSync(evidencePath, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  log(JSON.stringify({ evidencePath, operation: o.operation, observations,
    error: report.error, blocker: report.blocker, duplicateCaptureVerified: report.duplicateCaptureVerified,
    databases: report.databases.map(d => ({ path: d.path, error: d.error, recordsUnchangedDuringInspection: d.recordsUnchangedDuringInspection,
      cases: d.cases?.map(({ scenario, decision, payment, providerStatus, orderFieldsVerified, captureVerified, providerCaptures, error }) =>
        ({ scenario, decision, payment, providerStatus, orderFieldsVerified, captureVerified,
          providerCaptures: providerCaptures?.map(({ captureId, ...safe }) => safe), error })) })) }));
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = await acceptanceMain(process.argv.slice(2));
    if (report.error || report.databases.some(d => d.error || d.cases?.some(c => c.error))) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ error: /^[A-Z_]+$/.test(error.code || '') ? error.code : 'ACCEPTANCE_STOPPED',
      message: error.safeMessage || 'Acceptance stopped safely; preserve state and check selected run/configuration.' }));
    process.exitCode = 1;
  }
}
