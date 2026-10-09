const $ = id => document.getElementById(id);
let token = '', status = null, active = null, selected = 'allow', pendingConsent = null;
const scenarios = {
  allow: { productId: 'notebook', budget: '50', auto: '50', instruction: 'Buy one Security Field Notebook from the selected store within my $50 budget.' },
  review: { productId: 'console', budget: '700', auto: '100', instruction: 'Buy one Workspace Console within my $700 budget; ask an operator above $100.' },
  block: { productId: 'notebook', budget: '50', auto: '50', instruction: 'Buy one Security Field Notebook within my $50 budget. Pay only the authorized merchant.' },
};
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const dollars = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const message = text => { $('message').textContent = text; $('message').hidden = !text; };
const cents = value => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw Error('Use a positive USD amount with at most two decimal places.');
  return Math.round(Number(value) * 100);
};

async function api(path, body, idempotencyKey) {
  if (!token) throw Error('Connect with a workspace access token first.');
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : {
      'Content-Type': 'application/json', 'X-PayGuard-Request': '1',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Request failed');
  return result;
}

document.querySelectorAll('[data-case]').forEach(button => button.addEventListener('click', () => {
  selected = button.dataset.case;
  document.querySelectorAll('[data-case]').forEach(item => {
    item.classList.toggle('selected', item === button);
    item.setAttribute('aria-pressed', String(item === button));
  });
  $('instruction').value = scenarios[selected].instruction;
  $('budget').value = scenarios[selected].budget;
  $('auto-limit').value = scenarios[selected].auto;
  $('consent-check').checked = false;
  pendingConsent = null;
}));

$('connect-form').addEventListener('submit', async event => {
  event.preventDefault();
  token = $('access-token').value.trim();
  $('access-token').value = '';
  $('connect').disabled = true;
  message('');
  try {
    status = await api('/api/status');
    $('access-state').textContent = `Connected as ${status.role}. Access token is held only in memory.`;
    $('disconnect').hidden = false;
    $('evaluate').disabled = false;
    $('refresh').disabled = false;
    $('ai-state').textContent = status.aiConfigured ? `Ready · ${status.model}` : 'Not configured · fixtures available';
    $('paypal-state').textContent = status.providerMode === 'MOCK_TEST_FIXTURE' ? 'Mock test provider · no PayPal call' :
      status.paypalConfigured ? 'Sandbox credentials configured' : 'Credentials required';
    $('ai-dot').classList.toggle('ready', status.aiConfigured);
    $('paypal-dot').classList.toggle('ready', status.paypalConfigured);
    $('merchant').textContent = `${status.authorization.merchantId} / ${status.authorization.payeeId}`;
    await refresh();
    if (active) render(active);
  } catch (error) { $('disconnect').click(); message(error.message); }
  finally { $('connect').disabled = false; }
});

$('disconnect').addEventListener('click', () => {
  token = ''; status = null; active = null; pendingConsent = null;
  $('disconnect').hidden = true;
  $('access-state').textContent = 'Disconnected. Enter a workspace token to reconnect.';
  $('evaluate').disabled = true; $('refresh').disabled = true;
  $('ai-state').textContent = 'Not connected'; $('paypal-state').textContent = 'Not connected';
  $('ai-dot').classList.remove('ready'); $('paypal-dot').classList.remove('ready');
  $('result').replaceChildren(element('p', 'Connect and authorize a purchase to inspect a decision.', 'empty'));
  $('history-list').replaceChildren(element('p', 'Connect to load your saved records.', 'history-empty'));
  message('');
});

$('purchase-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('evaluate'); button.disabled = true;
  message('');
  try {
    const body = { productId: scenarios[selected].productId, scenario: selected,
      budgetCents: cents($('budget').value), autoLimitCents: cents($('auto-limit').value), instruction: $('instruction').value };
    const fingerprint = JSON.stringify(body);
    if (!pendingConsent || pendingConsent.fingerprint !== fingerprint) pendingConsent = { fingerprint, key: crypto.randomUUID() };
    const auth = await api('/api/authorizations', body, pendingConsent.key);
    pendingConsent.authorizationId = auth.id;
    const item = await api('/api/agent/runs', { authorizationId: auth.id, mode: $('agent-mode').value });
    render(item);
    pendingConsent = null;
    $('consent-check').checked = false;
    await refresh();
  } catch (error) { message(error.message + ' Retry preserves the current consent request.'); }
  finally { button.disabled = !token; }
});

function action(label, route, payload = {}, className = 'primary') {
  const button = element('button', label, className);
  button.type = 'button';
  button.addEventListener('click', async () => {
    button.disabled = true; message('');
    try { render(await api(route, payload)); await refresh(); }
    catch (error) {
      message(error.message);
      try { render(await api(`/api/intents/${active.id}`)); await refresh(); } catch { button.disabled = false; }
    }
  });
  return button;
}

function render(item) {
  active = item;
  const out = $('result'); out.replaceChildren();
  const verdict = element('div', undefined, `verdict ${item.decision}`);
  verdict.append(element('strong', item.decision), element('small', 'Deterministic server policy / ' + (item.policyVersion || 'pending')));
  out.append(verdict);
  const details = element('div', undefined, 'detail-grid');
  for (const [label, value] of [['ITEM', item.product?.label || 'Agent evaluation pending'],
    ['PROPOSED AMOUNT', item.intent ? dollars(item.intent.amountCents) : 'Pending'],
    ['AUTHORIZED BUDGET', dollars(item.authorization.budgetCents)], ['OPERATOR REVIEW', item.approval]]) {
    const cell = element('div'); cell.append(element('span', label), element('strong', value)); details.append(cell);
  }
  out.append(details, element('p', 'VERIFIED POLICY EVIDENCE', 'section-label'));
  const checks = element('ul', undefined, 'checks');
  item.reasons.forEach(reason => checks.append(element('li', reason)));
  out.append(checks);
  const consent = element('details');
  consent.append(element('summary', 'RECORDED USER AUTHORIZATION'));
  const original = element('div', undefined, 'agent-note');
  original.append(element('small', 'IMMUTABLE SERVER RECORD · ' + item.authorizationId),
    element('p', item.authorization.instruction),
    element('p', `Item: ${item.authorization.productId} · Original price: ${dollars(item.authorization.amountCents)} · Recipient: ${item.authorization.payeeId}`));
  consent.append(original); out.append(consent);
  if (item.intent?.untrustedContext) {
    const source = element('details');
    source.append(element('summary', 'UNTRUSTED MERCHANT CONTENT'), element('p', item.intent.untrustedContext, 'agent-note'));
    out.append(source);
  }
  const agent = element('div', undefined, 'agent-note');
  agent.append(element('small', item.agent.mode === 'live' ? 'REAL MODEL API · EXPLANATION IS UNVERIFIED' : 'DETERMINISTIC TEST AGENT · NO MODEL CALL'));
  agent.append(element('span', item.agent.explanation || `Agent status: ${item.agent.status}. ${item.agent.errorCode || 'An interrupted run remains denied. Issue new consent to try again.'}`));
  out.append(element('p', 'AGENT PROVENANCE', 'section-label'), agent);
  const payment = element('div', undefined, 'payment-area');
  payment.append(element('p', `PAYMENT / ${item.payment.status}`, 'payment-state'));
  const route = `/api/intents/${item.id}`;
  if (item.approval === 'PENDING') {
    if (status?.role === 'operator') {
      const row = element('div', undefined, 'action-row');
      row.append(action('Approve review', route + '/review', { approve: true }), action('Reject', route + '/review', { approve: false }, 'quiet'));
      payment.append(row);
    } else payment.append(element('p', 'Operator review is required. Connect with the operator token, then select this record in history.', 'payment-state'));
  }
  const eligible = item.agent.status === 'COMPLETED' && item.decision !== 'BLOCK' && ['APPROVED', 'NOT_REQUIRED'].includes(item.approval);
  if (eligible && item.payment.status !== 'COMPLETED') {
    if (!status?.paypalConfigured) payment.append(element('p', 'Sandbox checkout needs PayPal credentials and the merchant ID in the server environment. No payment has been simulated.', 'payment-state'));
    else if (!item.payment.orderId) payment.append(action(item.payment.status === 'CREATING' ? 'Retry Sandbox order creation' : 'Create PayPal Sandbox order', route + '/checkout'));
    else {
      if (item.payment.approvalUrl) {
        const link = element('a', 'Open Sandbox buyer approval ↗');
        link.href = item.payment.approvalUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; payment.append(link);
      }
      payment.append(action('Verify buyer approval & capture', route + '/capture'));
    }
  }
  if (item.payment.captureId) payment.append(element('p', `${status?.providerMode === 'MOCK_TEST_FIXTURE' ? 'Mock test capture' : 'Verified Sandbox capture'}: ${item.payment.captureId}`, 'payment-state'));
  if (item.payment.orderId) payment.append(element('p', `PayPal order: ${item.payment.orderId}`, 'payment-state'));
  if (item.payment.lastError && item.payment.status !== 'COMPLETED') payment.append(element('p', `Last operation: ${item.payment.lastError}. Verify or retry this record; retain its order and request IDs.`, 'payment-state'));
  if (item.decision === 'BLOCK') payment.append(element('p', 'Payment denied. Operator review cannot override BLOCK.', 'payment-state'));
  out.append(payment);
  const audit = element('details'); audit.open = true;
  audit.append(element('summary', `DURABLE AUDIT TRAIL · ${item.audit.length} EVENTS`));
  const list = element('ol', undefined, 'audit-list');
  item.audit.forEach(event => {
    const row = element('li', event.event.replaceAll('_', ' '));
    row.append(element('small', `${new Date(event.at).toLocaleTimeString()} · ${event.actor} · event ${event.seq}`)); list.append(row);
  });
  audit.append(list); out.append(audit, element('p', `Intent ${item.id} · Consent expires ${new Date(item.authorization.expiresAt).toLocaleTimeString()}`, 'record-id'));
}

async function refresh() {
  const { intents } = await api('/api/intents');
  const out = $('history-list'); out.replaceChildren();
  if (!intents.length) { out.append(element('p', 'No saved records yet. Your first authorized agent run appears here.', 'history-empty')); return; }
  const table = element('table', undefined, 'history-table');
  const head = element('thead'), header = element('tr');
  ['ITEM / RECORD', 'DECISION', 'AMOUNT', 'AGENT', 'PAYMENT'].forEach(label => header.append(element('th', label)));
  head.append(header); table.append(head);
  const body = element('tbody');
  intents.forEach(item => {
    const row = element('tr'), product = element('td');
    const button = element('button', item.product?.label || 'Pending evaluation', 'record-button');
    button.type = 'button'; button.addEventListener('click', async () => {
      try { render(await api(`/api/intents/${item.id}`)); $('result').scrollIntoView({ behavior: 'auto', block: 'nearest' }); }
      catch (error) { message(error.message); }
    });
    product.append(button); row.append(product);
    row.append(element('td', item.decision, `decision ${item.decision === 'ALLOW' ? 'green' : item.decision === 'REVIEW' ? 'amber' : 'red'}`),
      element('td', item.intent ? dollars(item.intent.amountCents) : '—'),
      element('td', item.agent.mode === 'live' ? 'Model API' : 'Test agent'),
      element('td', item.payment.status.replaceAll('_', ' ')));
    body.append(row);
  });
  table.append(body); out.append(table);
}
$('refresh').addEventListener('click', async () => {
  try { await refresh(); if (active) render(await api(`/api/intents/${active.id}`)); message(''); }
  catch (error) { message(error.message); }
});
