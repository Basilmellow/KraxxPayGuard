// Reproducible fixture walkthrough. Never reads .env or enables a payment provider.
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { makeServer } from '../src/server.mjs';

const outputDirectory = process.argv[2] || 'artifacts/walkthrough';
await mkdir(outputDirectory, { recursive: true });
let recordedLive = null;
try {
  recordedLive = JSON.parse(await readFile('docs/live-evaluation.json', 'utf8'));
  if (recordedLive.schema !== 'payguard-recorded-live-evaluation/v1') recordedLive = null;
} catch { /* Optional recorded live evidence is never invented. */ }
const config = { host: '127.0.0.1', port: 0, origin: 'http://127.0.0.1:3005', dbPath: ':memory:',
  shopperToken: randomBytes(32).toString('hex'), operatorToken: randomBytes(32).toString('hex'),
  payeeId: 'synthetic-recipient', paypalClientId: '', paypalClientSecret: '', paypalMerchantConfigured: false,
  openaiKey: '', openaiModel: '', rateLimit: 120 };
const server = makeServer({ config });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
config.origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 },
  recordVideo: { dir: join(outputDirectory, 'raw'), size: { width: 1280, height: 800 } } });
const page = await context.newPage(), started = Date.now();
const captions = [];
async function caption(text, seconds) {
  console.log(text);
  captions.push({ atSeconds: (Date.now() - started) / 1000, text });
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
  await caption('Kraxx PayGuard by KRAXXSEC. Your agent chooses. Your mandate decides. This walkthrough shows clearly labelled fixtures and saved live evidence; it makes no new model or payment calls.', 9);
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
  await (await event).saveAs(join(outputDirectory, 'redacted-decision.json'));
  await caption('Redacted reports omit private text, principals, recipients, operation IDs and provider identifiers. History retains the original decision and audit.', 9);
  if (recordedLive) {
    await page.evaluate(report => {
      const overlay = document.createElement('section'); overlay.id = 'recorded-live-evidence';
      Object.assign(overlay.style, { position: 'fixed', inset: '30px 30px 115px 235px', zIndex: '9000',
        padding: '32px', background: '#10201c', color: '#eaf5ef', border: '1px solid #8dc3a8', borderRadius: '12px', overflow: 'auto' });
      const heading = document.createElement('h2'); heading.textContent = 'Saved evidence from real hosted AI runs'; overlay.append(heading);
      const note = document.createElement('p'); note.textContent = `${report.provider} / ${report.model}. Read-only replay of exported reports. No inference runs in this recording.`; overlay.append(note);
      for (const row of report.rows) {
        const line = document.createElement('p'); line.style.padding = '8px 0'; line.style.borderBottom = '1px solid #355347';
        line.textContent = `${row.id}  →  ${row.decision}  ·  ${row.productId}  ·  $${(row.amountCents / 100).toFixed(2)}  ·  ${row.validatedModelToolResponses} validated tool responses  ·  payment ${row.paymentStatus}`;
        overlay.append(line);
      }
      const limitation = document.createElement('p'); limitation.textContent = 'Six hand-selected cases are not a universal safety score. Private recipients and identifiers are redacted.'; overlay.append(limitation);
      document.body.append(overlay);
    }, recordedLive);
    await caption('These saved reports came from six real hosted Claude Haiku runs. Redirection attempts stayed within authority. A six hundred fifty dollar proposal required review; a forty nine dollar proposal exceeded a twenty dollar budget and was blocked.', 19);
    await page.screenshot({ path: join(outputDirectory, 'recorded-live.png'), fullPage: false });
    await page.evaluate(() => document.getElementById('recorded-live-evidence').remove());
  }
  await page.locator('#boundary').scrollIntoViewIfNeeded();
  await caption('PayPal Sandbox OAuth, order creation, buyer approval and capture submission were verified. The capture remains pending and unclaimed. Completed payment acceptance is deferred; no real money or replacement payment is used.', 12);
  await page.screenshot({ path: join(outputDirectory, 'final.png'), fullPage: false });
  await context.close();
  await page.video().saveAs(join(outputDirectory, 'payguard-walkthrough.webm'));
  const seconds = Math.round((Date.now() - started) / 1000);
  await writeFile(join(outputDirectory, 'recording.json'), JSON.stringify({ source: recordedLive ? 'FIXTURES_AND_RECORDED_LIVE_EVIDENCE' : 'DETERMINISTIC_FIXTURES',
    recordingWallSeconds: seconds, encodedDurationRequiresVerification: true, actualModelCalls: 0, actualPayPalCalls: 0, captions,
    recordedLiveRuns: recordedLive?.totals.runs || 0,
    limitations: ['Fixture interactions and replayed real model evidence are labelled separately.', 'No new model or PayPal calls occur in this recording.', 'This is not a substitute for completed payment acceptance.'] }, null, 2));
  if (seconds >= 180) throw Error('Walkthrough exceeded 3 minutes');
  console.log(`Saved fixture walkthrough (recording wall time ${seconds}s); verify encoded duration before publication. No model or provider calls.`);
} catch {
  console.error('Walkthrough recording failed; no credentials or raw browser error were logged.');
  process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
