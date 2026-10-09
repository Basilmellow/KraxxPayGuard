import { test, expect } from '@playwright/test';
import { apiFixture } from '../test/helpers.mjs';

let fixture;
test.beforeEach(async ({ page }) => {
  fixture = await apiFixture();
  await page.goto(fixture.settings.origin);
});
test.afterEach(async () => { await fixture?.close(); });

async function connect(page, role = 'shopper') {
  await page.getByLabel('Workspace access').fill(role === 'shopper' ? fixture.settings.shopperToken : fixture.settings.operatorToken);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('#access-state')).toContainText(`Connected as ${role}`);
}
async function run(page, scenario = 'allow') {
  await page.locator(`[data-case="${scenario}"]`).click();
  await page.locator('#consent-check').check();
  await page.getByRole('button', { name: 'Authorize & run agent' }).click();
  await expect(page.locator('#result .verdict')).toBeVisible();
}

test('ALLOW browser journey through mocked checkout and verified capture', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await connect(page); await run(page);
  await expect(page.locator('#result .verdict strong')).toHaveText('ALLOW');
  await expect(page.locator('#result')).toContainText('DETERMINISTIC TEST AGENT · NO MODEL CALL');
  await page.getByRole('button', { name: 'Create PayPal Sandbox order' }).click();
  const link = page.getByRole('link', { name: 'Open Sandbox buyer approval' });
  await expect(link).toHaveAttribute('href', /https:\/\/www\.sandbox\.paypal\.com\/checkoutnow/);
  fixture.fake.state.approved = true; // Mock provider approval, never a real buyer.
  await page.getByRole('button', { name: 'Verify buyer approval & capture' }).click();
  await expect(page.locator('#result')).toContainText('Mock test capture: CAPTURE12345');
  await expect(page.locator('#result')).toContainText('PAYPAL CAPTURE VERIFIED');
  await expect(page.locator('#history-list')).toContainText('COMPLETED');
  expect(errors).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/dashboard-desktop.png', fullPage: true });
});

test('REVIEW requires operator login and durable approval', async ({ page }) => {
  await connect(page); await run(page, 'review');
  await expect(page.locator('#result .verdict strong')).toHaveText('REVIEW');
  await expect(page.getByRole('button', { name: 'Approve review' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create PayPal Sandbox order' })).toHaveCount(0);
  await connect(page, 'operator');
  await page.getByRole('button', { name: 'Approve review' }).click();
  await expect(page.locator('#result')).toContainText('APPROVED');
  await expect(page.getByRole('button', { name: 'Create PayPal Sandbox order' })).toBeVisible();
});

test('BLOCK denies malicious redirection with no payment or review action', async ({ page }) => {
  await connect(page, 'operator'); await run(page, 'block');
  await expect(page.locator('#result .verdict strong')).toHaveText('BLOCK');
  await expect(page.locator('#result')).toContainText('Unauthorized recipient');
  await expect(page.locator('#result')).toContainText('Suspected instruction injection');
  await expect(page.getByRole('button', { name: 'Approve review' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create PayPal Sandbox order' })).toHaveCount(0);
  expect(fixture.fake.state.calls).toEqual([]);
});

test('real model mode fails closed without credentials, no automatic fallback', async ({ page }) => {
  await connect(page); await page.locator('#agent-mode').selectOption('live'); await run(page);
  await expect(page.locator('#result .verdict strong')).toHaveText('BLOCK');
  await expect(page.locator('#result')).toContainText('MODEL_NOT_CONFIGURED');
  await expect(page.locator('#result')).toContainText('REAL MODEL API');
  expect(fixture.fake.state.calls).toEqual([]);
});

test('access token is cleared from input, lost on reload and not persisted', async ({ page }) => {
  await connect(page);
  await expect(page.getByLabel('Workspace access')).toHaveValue('');
  const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
  expect(storage).toEqual({ local: 0, session: 0 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Authorize & run agent' })).toBeDisabled();
});

test('mobile purchase flow remains usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connect(page); await run(page, 'block');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#result .verdict strong')).toHaveText('BLOCK');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/dashboard-mobile.png', fullPage: true });
});

test('missing PayPal configuration is visible; UI never invents payment completion', async ({ page }) => {
  await fixture.close();
  fixture = await apiFixture({ config: { paypalMerchantConfigured: false }, testProviders: false });
  await page.goto(fixture.settings.origin); await connect(page); await run(page);
  await expect(page.locator('#paypal-state')).toHaveText('Credentials required');
  await expect(page.locator('#result')).toContainText('No payment has been simulated');
  await expect(page.getByRole('button', { name: 'Create PayPal Sandbox order' })).toHaveCount(0);
  expect(fixture.fake.state.calls).toEqual([]);
});

test('hostile model rationale and original instruction render as text, never HTML', async ({ page }) => {
  await fixture.close();
  const hostile = '<img src=x onerror="window.injected=true">';
  let count = 0, grant;
  fixture = await apiFixture({ config: { openaiKey: 'fake-test-key', openaiModel: 'test-model' },
    modelFetch: async (_url, options) => {
      const input = JSON.parse(options.body).input;
      grant ||= JSON.parse(input[0].content).originalAuthorization;
      return Response.json({ status: 'completed', output: [{ type: 'function_call', call_id: crypto.randomUUID(),
        name: ++count === 1 ? 'read_catalog' : 'propose_payment',
        arguments: JSON.stringify(count === 1 ? { productId: 'notebook' } : {
          productId: 'notebook', merchantId: grant.merchantId, payeeId: grant.payeeId,
          amountCents: grant.amountCents, currency: 'USD', rationale: hostile }) }] });
    } });
  await page.goto(fixture.settings.origin); await connect(page);
  await page.locator('#instruction').fill(hostile);
  await page.locator('#agent-mode').selectOption('live');
  await page.locator('#consent-check').check();
  await page.getByRole('button', { name: 'Authorize & run agent' }).click();
  await expect(page.locator('#result .verdict strong')).toHaveText('ALLOW');
  await expect(page.locator('#result')).toContainText(hostile);
  await expect(page.locator('#result img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  const response = await page.request.get(fixture.settings.origin);
  expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
});

test('changing scenario clears the stale verdict and preserves the saved intent', async ({ page }) => {
  await connect(page); await run(page, 'allow');
  await expect(page.locator('#result .verdict strong')).toHaveText('ALLOW');
  await page.locator('[data-case="review"]').click();
  await expect(page.locator('#result .verdict')).toHaveCount(0);
  await expect(page.locator('#result')).toContainText('New scenario selected');
  await expect(page.locator('#history-list')).toContainText('Security Field Notebook');
  expect(fixture.store.list('shopper')).toHaveLength(1);
  await expect(page.locator('#access-help')).toContainText('SHOPPER_TOKEN=');
  await expect(page.locator('#access-help')).toContainText('OPERATOR_TOKEN=');
});

test('exhausted model credits show an actionable error while retaining BLOCK', async ({ page }) => {
  await fixture.close();
  fixture = await apiFixture({ config: { openaiKey: 'fake-test-key', openaiModel: 'test-model' },
    modelFetch: async () => Response.json({ error: { type: 'insufficient_quota',
      code: 'credit_balance_exhausted', message: 'private provider body' } }, { status: 429 }) });
  await page.goto(fixture.settings.origin); await connect(page);
  await expect(page.locator('#ai-state')).toContainText('Credentials configured');
  await page.locator('#agent-mode').selectOption('live'); await run(page);
  await expect(page.locator('#result .verdict strong')).toHaveText('BLOCK');
  await expect(page.locator('#result')).toContainText('MODEL_QUOTA_EXHAUSTED');
  await expect(page.locator('#result')).toContainText('Check API billing');
  await expect(page.locator('#result')).not.toContainText('private provider body');
  expect(fixture.fake.state.calls).toEqual([]);
});
