// Reproducible fixture walkthrough. Never reads .env or enables a payment provider.
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { makeServer } from '../src/server.mjs';

await mkdir('artifacts/walkthrough', { recursive: true });
const config = { host: '127.0.0.1', port: 0, origin: 'http://127.0.0.1:3005', dbPath: ':memory:',
  shopperToken: randomBytes(32).toString('hex'), operatorToken: randomBytes(32).toString('hex'),
  payeeId: 'synthetic-recipient', paypalClientId: '', paypalClientSecret: '', paypalMerchantConfigured: false,
  openaiKey: '', openaiModel: '', rateLimit: 120 };
const server = makeServer({ config });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
config.origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 },
  recordVideo: { dir: 'artifacts/walkthrough/raw', size: { width: 1280, height: 800 } } });
const page = await context.newPage(), started = Date.now();
const captions = [];
async function caption(text, seconds) {
  console.log(text);
  captions.push({ atSeconds: Math.round((Date.now() - started) / 1000), text });
  await page.evaluate(text => {
    let node = document.getElementById('recording-caption');
    if (!node) { node = document.createElement('div'); node.id = 'recording-caption'; document.body.append(node); }
    Object.assign(node.style, { position: 'fixed', bottom: '12px', left: '240px', right: '20px', zIndex: '9999',
      padding: '16px 20px', background: '#d4e9dc', color: '#14221b', borderRadius: '8px',
      font: '15px/1.5 Segoe UI, sans-serif', boxShadow: '0 4px 18px #0009', pointerEvents: 'none' });
    node.textContent = text;
  }, text);
  await page.waitForTimeout(seconds * 1000);
}
try {
  await page.goto(config.origin + '/judge');
  await page.locator('#judge-panel').waitFor({ state: 'visible' });
  await caption('Kraxx PayGuard by KRAXXSEC — buyer authority for agentic commerce. This recording uses deterministic fixtures: no model or payment calls.', 7);
  await page.locator('#result').scrollIntoViewIfNeeded();
  await caption('A matching proposal receives ALLOW from the actual server firewall. The synthetic proposal is labelled separately from permission.', 10);
  await page.locator('[data-judge="review"]').click();
  await page.locator('#result').scrollIntoViewIfNeeded();
  await caption('A purchase above the automatic limit needs independent operator review. Guided mode cannot grant approval or execute a payment.', 10);
  await page.locator('[data-judge="block"]').click();
  await page.locator('#result').scrollIntoViewIfNeeded();
  await caption('A recipient substitution receives BLOCK. Merchant text and the model cannot replace the buyer’s authorized recipient.', 12);
  await page.locator('#lab-evaluation').scrollIntoViewIfNeeded();
  await caption('Twelve reproducible synthetic policy tests: nine unauthorized proposals, three benign controls. These are not model robustness scores.', 12);
  await page.locator('#judge-exit').click();
  await page.getByLabel('Workspace access').fill(config.shopperToken);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.getByText('Connected as shopper.', { exact: false }).waitFor();
  await page.locator('input[name="product"][value="pen"]').check();
  await page.locator('#mandate-fields').scrollIntoViewIfNeeded();
  await caption('In a separate isolated workspace, the buyer explicitly selects offers, merchant, category and spending scope. There are no provider credentials here.', 9);
  await page.locator('#consent-check').check();
  await page.getByRole('button', { name: 'Authorize & run agent' }).click();
  await page.locator('#result .verdict').waitFor();
  await page.locator('#result .comparison-grid').scrollIntoViewIfNeeded();
  await caption('The fixture chooses the $18 pen within the immutable two-offer mandate. A real gateway run uses the same independent checks and retains its genuine proposal.', 15);
  await page.locator('#lab-preset').selectOption('recipient');
  await page.locator('#lab-enabled').check();
  await page.locator('#consent-check').check();
  await page.getByRole('button', { name: 'Authorize & run agent' }).click();
  await page.locator('#result .verdict strong').getByText('BLOCK', { exact: true }).waitFor();
  await page.locator('#result .comparison-grid').scrollIntoViewIfNeeded();
  await caption('The Attack Lab supplies lower-trust merchant text. This synthetic adversarial proposer follows it; the firewall still blocks the unauthorized recipient.', 12);
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export redacted decision report', exact: true }).click();
  await (await event).saveAs('artifacts/walkthrough/redacted-decision.json');
  await caption('Redacted reports omit private text, principals, recipients, operation IDs and provider identifiers. History retains the original decision and audit.', 9);
  await page.locator('#boundary').scrollIntoViewIfNeeded();
  await caption('Real Sandbox OAuth, order creation and GET verification passed. Buyer approval is blocked by PayPal’s seller-currency error; completed capture remains unverified.', 10);
  await page.screenshot({ path: 'artifacts/walkthrough/final.png', fullPage: false });
  await context.close();
  await page.video().saveAs('artifacts/walkthrough/payguard-fixture-walkthrough.webm');
  const seconds = Math.round((Date.now() - started) / 1000);
  await writeFile('artifacts/walkthrough/recording.json', JSON.stringify({ source: 'DETERMINISTIC_FIXTURES',
    recordingWallSeconds: seconds, encodedDurationRequiresVerification: true, actualModelCalls: 0, actualPayPalCalls: 0, captions,
    limitations: ['No real AI run is shown.', 'No real Sandbox payment is shown.', 'This is not a substitute for final payment acceptance.'] }, null, 2));
  if (seconds >= 180) throw Error('Walkthrough exceeded 3 minutes');
  console.log(`Saved fixture walkthrough (recording wall time ${seconds}s); verify encoded duration before publication. No model or provider calls.`);
} catch {
  console.error('Walkthrough recording failed; no credentials or raw browser error were logged.');
  process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
