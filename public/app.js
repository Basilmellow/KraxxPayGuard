const $ = id => document.getElementById(id);
let token = '', status = null, active = null, selected = 'allow', pendingConsent = null;
let catalogData = {}, labPresets = [], judgeData = null;
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
  $('purchase-kind').value = 'single'; $('mandate-fields').hidden = true;
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
  const previous = active;
  active = null;
  $('result').replaceChildren(element('p', 'New scenario selected. Authorize and run the agent to evaluate this purchase. Previous records remain in transaction history.', 'empty'));
  message(previous && ['CREATING', 'CAPTURING'].includes(previous.payment.status) ?
    'The previous payment has an unresolved operation. Its record and request IDs are preserved in transaction history; inspect that record before retrying it.' : '');
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
    $('ai-state').textContent = status.aiConfigured ? `Credentials configured · ${status.model}` : 'Not configured · fixtures available';
    $('paypal-state').textContent = status.providerMode === 'MOCK_TEST_FIXTURE' ? 'Mock test provider · no PayPal call' :
      status.paypalConfigured ? 'Sandbox credentials configured' : 'Credentials required';
    $('ai-dot').classList.toggle('ready', status.aiConfigured);
    $('paypal-dot').classList.toggle('ready', status.paypalConfigured);
    $('merchant').textContent = `${status.authorization.merchantId} / ${status.authorization.payeeId}`;
    judgeData = null; $('judge-panel').hidden = true;
    const [products, lab] = await Promise.all([api('/api/catalog'), api('/api/lab/presets')]);
    catalogData = products.catalog; labPresets = lab.presets;
    populateCatalog(); populateLab(); $('lab-evaluate').disabled = false;
    await refresh();
    if (active) render(active);
  } catch (error) { $('disconnect').click(); message(error.message); }
  finally { $('connect').disabled = false; }
});

$('disconnect').addEventListener('click', () => {
  token = ''; status = null; active = null; pendingConsent = null;
  judgeData = null; $('judge-panel').hidden = true; $('lab-evaluate').disabled = true;
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
  const originalButtonNodes = [...button.childNodes];
  button.textContent = 'Authorizing purchase…';
  message('');
  try {
    const shared = { budgetCents: cents($('budget').value), autoLimitCents: cents($('auto-limit').value), instruction: $('instruction').value };
    const body = $('purchase-kind').value === 'mandate' ? { ...shared, type: 'purchase-mandate/v1',
      productIds: checkedValues('product'), merchantIds: checkedValues('merchant'), categories: checkedValues('category'),
      beneficiary: { kind: $('beneficiary-kind').value, label: $('beneficiary-label').value } } :
      { ...shared, productId: scenarios[selected].productId, scenario: selected };
    const lab = $('lab-enabled').checked ? { presetId: $('lab-preset').value,
      ...($('lab-preset').value === 'custom' ? { customText: $('lab-text').value } : {}) } : undefined;
    const fingerprint = JSON.stringify({ body, lab, mode: $('agent-mode').value });
    if (!pendingConsent || pendingConsent.fingerprint !== fingerprint) pendingConsent = { fingerprint, key: crypto.randomUUID() };
    const auth = await api('/api/authorizations', body, pendingConsent.key);
    pendingConsent.authorizationId = auth.id;
    button.textContent = $('agent-mode').value === 'live' ? 'Calling model & checking policy…' : 'Checking policy…';
    const item = await api('/api/agent/runs', { authorizationId: auth.id, mode: $('agent-mode').value, ...(lab ? { lab } : {}) });
    render(item);
    pendingConsent = null;
    $('consent-check').checked = false;
    await refresh();
  } catch (error) { message(error.message + ' Retry preserves the current consent request.'); }
  finally { button.replaceChildren(...originalButtonNodes); button.disabled = !token; }
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
  if (item.signals?.length) {
    const note = element('div', undefined, 'signal-note');
    note.append(element('strong', item.authorization.offers ? 'Advisory content signals' : 'Legacy content veto'));
    item.signals.forEach(signal => note.append(element('p', signal)));
    out.append(note);
  }
  const comparison = element('div', undefined, 'comparison-grid');
  const boundary = element('div', undefined, 'trusted-card');
  boundary.append(element('small', 'TRUSTED · IMMUTABLE BUYER MANDATE'));
  const offers = item.authorization.offers || [{ productId: item.authorization.productId,
    merchantId: item.authorization.merchantId, payeeId: item.authorization.payeeId, amountCents: item.authorization.amountCents }];
  const scope = element('ul');
  offers.forEach(offer => scope.append(element('li', `${offer.productId} · ${dollars(offer.amountCents)} · ${offer.merchantId}`)));
  boundary.append(scope, element('p', `One purchase · ${item.authorization.currency} · Budget ${dollars(item.authorization.budgetCents)}`));
  if (item.authorization.beneficiary) boundary.append(element('p', `For ${item.authorization.beneficiary.kind}: ${item.authorization.beneficiary.label}`));
  const proposed = element('div', undefined, 'untrusted-card');
  proposed.append(element('small', item.agent.mode === 'live' ? 'MODEL PROPOSAL · UNVERIFIED AUTHORITY' : 'SYNTHETIC PROPOSER · NOT AI'));
  const raw = item.agent.proposal;
  if (raw) {
    const fields = element('dl');
    for (const [label, value] of [['Item', raw.productId], ['Amount', Number.isSafeInteger(raw.amountCents) ? dollars(raw.amountCents) : 'Invalid amount'],
      ['Currency', raw.currency], ['Merchant', raw.merchantId], ['Recipient', raw.payeeId]]) {
      fields.append(element('dt', label), element('dd', value));
    }
    const technical = element('details'); technical.append(element('summary', 'Inspect bounded proposal fields'), element('pre', JSON.stringify(raw, null, 2)));
    proposed.append(fields, technical);
  } else proposed.append(element('p', 'No retained proposal; inspect failure evidence.'));
  comparison.append(boundary, proposed); out.append(comparison);
  const consent = element('details');
  consent.append(element('summary', 'RECORDED USER AUTHORIZATION'));
  const original = element('div', undefined, 'agent-note');
  original.append(element('small', 'IMMUTABLE SERVER RECORD · ' + item.authorizationId),
    element('p', item.authorization.instruction),
    element('p', offers.map(offer => `Item: ${offer.productId} · Original price: ${dollars(offer.amountCents)} · Recipient: ${offer.payeeId}`).join('\n')));
  consent.append(original); out.append(consent);
  if (item.intent?.untrustedContext) {
    const source = element('details');
    source.append(element('summary', 'UNTRUSTED MERCHANT CONTENT'), element('p', item.intent.untrustedContext, 'agent-note'));
    out.append(source);
  }
  const agent = element('div', undefined, 'agent-note');
  agent.append(element('small', item.agent.mode === 'live' ? 'REAL MODEL API · EXPLANATION IS UNVERIFIED' : 'DETERMINISTIC TEST AGENT · NO MODEL CALL'));
  agent.append(element('span', item.agent.explanation || item.agent.errorMessage ||
    `Agent status: ${item.agent.status}. ${item.agent.errorCode || 'An interrupted run remains denied. Issue new consent to try again.'}`));
  if (item.agent.errorCode) agent.append(element('small', item.agent.errorCode));
  out.append(element('p', 'AGENT PROVENANCE', 'section-label'), agent);
  if (item.lab) out.append(element('p', `Merchant test: ${item.lab.label}. Text is lower-trust data; it grants no authority.`, 'form-note'));
  const timeline = element('ol', undefined, 'tool-timeline'); timeline.setAttribute('aria-label', 'Validated tool timeline');
  (item.agent.trace || []).forEach((step, index) => {
    const row = element('li');
    row.append(element('strong', `${index + 1}. ${step.tool}`), element('small', `${step.productId || 'scoped input'} · ${step.status}`));
    timeline.append(row);
  });
  if (timeline.children.length) out.append(element('p', 'BOUNDED TOOL EXECUTION', 'section-label'), timeline);
  const payment = element('div', undefined, 'payment-area');
  payment.append(element('p', `PAYMENT / ${item.payment.status}`, 'payment-state'));
  const route = `/api/intents/${item.id}`;
  const isJudge = item.source === 'JUDGE_FIXTURE';
  if (isJudge) payment.append(element('p', 'Read-only judge fixture. Operator review and payment execution require a separate authenticated purchase.', 'payment-state'));
  if (!isJudge && item.approval === 'PENDING') {
    if (status?.role === 'operator') {
      const row = element('div', undefined, 'action-row');
      row.append(action('Approve review', route + '/review', { approve: true }), action('Reject', route + '/review', { approve: false }, 'quiet'));
      payment.append(row);
    } else payment.append(element('p', 'Operator review is required. Connect with the operator token, then select this record in history.', 'payment-state'));
  }
  const eligible = item.agent.status === 'COMPLETED' && item.decision !== 'BLOCK' && ['APPROVED', 'NOT_REQUIRED'].includes(item.approval);
  if (!isJudge && eligible && item.payment.status !== 'COMPLETED') {
    const configured = status?.merchants?.[item.intent?.merchantId]?.checkoutConfigured ?? status?.paypalConfigured;
    if (!configured) payment.append(element('p', 'Sandbox checkout needs matching credentials and the merchant ID for this merchant in the server environment. No payment has been simulated.', 'payment-state'));
    else if (!item.payment.orderId) payment.append(action(item.payment.createStartedAt ? 'Retry Sandbox order creation' : 'Create PayPal Sandbox order', route + '/checkout'));
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
  audit.append(element('summary', `${isJudge ? 'SYNTHETIC EVALUATION TRACE' : 'DURABLE AUDIT TRAIL'} · ${item.audit.length} EVENTS`));
  const list = element('ol', undefined, 'audit-list');
  item.audit.forEach(event => {
    const row = element('li', event.event.replaceAll('_', ' '));
    row.append(element('small', `${new Date(event.at).toLocaleTimeString()} · ${event.actor} · event ${event.seq}`)); list.append(row);
  });
  audit.append(list); out.append(audit, element('p', `Intent ${item.id} · Consent expires ${new Date(item.authorization.expiresAt).toLocaleTimeString()}`, 'record-id'));
  const exportButton = element('button', 'Export redacted decision report', 'quiet'); exportButton.type = 'button';
  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    try { downloadJson(isJudge ? item.evidence : await api(route + '/evidence'), 'payguard-decision.json'); }
    catch (error) { message(error.message); }
    finally { exportButton.disabled = false; }
  });
  out.append(exportButton);
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

function checkedValues(name) { return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value); }
function clearDraft() {
  pendingConsent = null; $('consent-check').checked = false;
  if (active) {
    const unresolved = ['CREATING', 'CAPTURING'].includes(active.payment.status);
    active = null; $('result').replaceChildren(element('p', 'Draft changed. Authorize a new purchase to evaluate these boundaries. Saved records remain in history.', 'empty'));
    if (unresolved) message('An unresolved payment remains in history with its original operation IDs. Inspect it before another payment attempt.');
  }
}
function populateCatalog() {
  const merchants = $('merchant-options'); merchants.replaceChildren();
  Object.entries(status.merchants || {}).forEach(([id, merchant]) => {
    const label = element('label', undefined, 'scope-choice');
    const input = element('input'); input.type = 'checkbox'; input.name = 'merchant'; input.value = id; input.checked = id === 'kraxx-demo-store';
    const text = element('span', merchant.label); text.append(element('small', `${merchant.payeeId} · ${merchant.checkoutConfigured ? 'Sandbox configured' : 'evaluation only; checkout unavailable'}`));
    label.append(input, text); merchants.append(label);
  });
  const products = $('product-options'); products.replaceChildren();
  Object.entries(catalogData).forEach(([id, product]) => {
    const label = element('label', undefined, 'offer-card'); const input = element('input');
    input.type = 'checkbox'; input.name = 'product'; input.value = id; input.checked = id === 'notebook';
    const text = element('span', product.label); text.append(element('strong', dollars(product.amountCents)),
      element('small', `${product.category} · ${product.merchantId}`));
    label.append(input, text); products.append(label);
  });
}
function populateLab() {
  $('lab-preset').replaceChildren();
  labPresets.forEach(preset => { const option = element('option', preset.label); option.value = preset.id; $('lab-preset').append(option); });
  const custom = element('option', 'Custom bounded merchant text'); custom.value = 'custom'; $('lab-preset').append(custom);
  $('lab-text').readOnly = true; $('lab-text').value = labPresets[0]?.text || '';
}
$('purchase-kind').addEventListener('change', () => {
  $('mandate-fields').hidden = $('purchase-kind').value !== 'mandate'; clearDraft();
  if ($('purchase-kind').value === 'mandate') {
    $('quick-demos').open = false;
    if (Object.values(scenarios).some(value => value.instruction === $('instruction').value))
      $('instruction').value = 'Choose one of my approved offers within these merchant, category and spending limits.';
  }
});
$('mandate-fields').addEventListener('change', clearDraft);
for (const id of ['instruction', 'budget', 'auto-limit', 'agent-mode', 'lab-enabled']) $(id).addEventListener('change', clearDraft);
$('lab-preset').addEventListener('change', () => {
  $('lab-text').readOnly = $('lab-preset').value !== 'custom';
  $('lab-text').value = labPresets.find(x => x.id === $('lab-preset').value)?.text || '';
  clearDraft();
});
$('lab-text').addEventListener('input', clearDraft);
function downloadJson(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = element('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderEvaluation(report) {
  const out = $('lab-evaluation'); out.replaceChildren();
  out.append(element('p', `${report.totals.scenarios} synthetic scenarios · ${report.actualModelCalls} model calls · ${report.actualPayPalCalls} PayPal calls`, 'section-label'));
  const metrics = element('div', undefined, 'evaluation-metrics');
  for (const [label, value] of [['Unauthorized proposals allowed', report.totals.unauthorizedProposalsAllowed], ['Benign cases blocked', report.totals.falsePositives], ['Expected outcomes', `${report.totals.expectedOutcomes}/${report.totals.scenarios}`]]) {
    const cell = element('div'); cell.append(element('strong', value), element('small', label)); metrics.append(cell);
  }
  out.append(metrics);
  const table = element('table', undefined, 'evaluation-table'), head = element('tr');
  ['CASE', 'EXPECTED', 'ACTUAL'].forEach(label => head.append(element('th', label))); table.append(head);
  report.rows.forEach(row => { const line = element('tr'); [row.scenario, row.expected, row.actual].forEach(value => line.append(element('td', value))); table.append(line); });
  out.append(table);
  report.limitations.forEach(value => out.append(element('p', value, 'form-note')));
  const button = element('button', 'Export synthetic evaluation report', 'quiet'); button.type = 'button';
  button.addEventListener('click', () => downloadJson(report, 'payguard-synthetic-evaluation.json')); out.append(button);
}
$('lab-evaluate').addEventListener('click', async () => {
  $('lab-evaluate').disabled = true;
  try { renderEvaluation(judgeData ? judgeData.evaluation : await api('/api/lab/evaluation')); }
  catch (error) { message(error.message); }
  finally { $('lab-evaluate').disabled = !(token || judgeData); }
});
async function startJudge() {
  $('disconnect').click();
  try {
    const response = await fetch('/api/judge/demo');
    if (!response.ok) throw Error('Guided demo unavailable');
    judgeData = await response.json();
    status = { role: 'judge', paypalConfigured: false, providerMode: 'JUDGE_FIXTURE' };
    $('judge-panel').hidden = false; $('lab-evaluate').disabled = false;
    $('access-state').textContent = 'Read-only judge walkthrough. Connect separately to run a real agent or payment.';
    render(judgeData.fixtures[0]); renderEvaluation(judgeData.evaluation);
  } catch (error) { message(error.message); }
}
$('judge-start').addEventListener('click', startJudge);
$('judge-exit').addEventListener('click', () => $('disconnect').click());
document.querySelectorAll('[data-judge]').forEach(button => button.addEventListener('click', () => {
  const item = judgeData?.fixtures.find(value => value.id === `judge-${button.dataset.judge}`);
  if (item) render(item);
}));
if (location.pathname === '/judge') startJudge();
