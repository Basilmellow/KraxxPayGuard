import test from 'node:test';
import assert from 'node:assert/strict';
import { Agent } from '../src/agent.mjs';
import { PayPal } from '../src/paypal.mjs';
import { issueAuthorization } from '../src/policy.mjs';
import { config, consent } from './helpers.mjs';

for (const [name, status, error, expected] of [
  ['exhausted credits', 429, { type: 'insufficient_quota', code: 'credit_balance_exhausted' }, 'MODEL_QUOTA_EXHAUSTED'],
  ['invalid model credentials', 401, { message: 'private-provider-text' }, 'MODEL_CREDENTIALS_REJECTED'],
  ['temporary model rate limit', 429, { type: 'rate_limit_error' }, 'MODEL_RATE_LIMITED'],
]) test(`show actionable, sanitized ${name} while denying payments`, async () => {
  const settings = { ...config(), openaiKey: 'private-api-key', openaiModel: 'test-model' };
  const agent = new Agent(settings, async () => Response.json({ error: { ...error, message: 'private-provider-text' } }, { status }));
  const auth = issueAuthorization(consent(), 'shopper', settings.payeeId);
  const result = await agent.run(auth, 'live');
  assert.equal(result.evaluation.decision, 'BLOCK');
  assert.equal(result.agent.errorCode, expected);
  assert.ok(result.agent.errorMessage.length > 20);
  assert.ok(!JSON.stringify(result).includes('private-api-key'));
  assert.ok(!JSON.stringify(result).includes('private-provider-text'));
});

test('PayPal invalid_client identifies the rejected Sandbox credential pair without leaking provider text', async () => {
  const paypal = new PayPal(config(), async () => Response.json({ error: 'invalid_client',
    error_description: 'private client details' }, { status: 401 }));
  await assert.rejects(paypal.show('ORDER1234567'), error =>
    error.code === 'PAYPAL_CREDENTIALS_REJECTED' && error.message.includes('same Sandbox REST app') &&
    !error.message.includes('private client details'));
});
