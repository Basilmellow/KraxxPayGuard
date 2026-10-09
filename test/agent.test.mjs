import test from 'node:test';
import assert from 'node:assert/strict';
import { Agent } from '../src/agent.mjs';
import { issueAuthorization, trustedIntent } from '../src/policy.mjs';
import { config, consent } from './helpers.mjs';

const call = (name, args) => Response.json({ status: 'completed', output: [{ type: 'function_call',
  name, arguments: JSON.stringify(args), call_id: crypto.randomUUID() }] });
const auth = () => issueAuthorization(consent(), 'shopper', 'MERCHANT12345');

test('deterministic agent demonstrates all three independent decisions', async () => {
  const agent = new Agent(config());
  for (const [product, scenario, expected] of [['notebook', 'allow', 'ALLOW'], ['console', 'review', 'REVIEW'], ['notebook', 'block', 'BLOCK']]) {
    const issued = issueAuthorization(consent(product, scenario), 'shopper', 'MERCHANT12345');
    const result = await agent.run(issued, 'deterministic');
    assert.equal(result.evaluation.decision, expected);
    assert.equal(result.agent.explanationSource, 'DETERMINISTIC_FIXTURE');
    assert.equal(result.agent.model, null);
  }
});

test('real API adapter performs bounded catalog read and validated proposal', async () => {
  const issued = auth(), requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, ...options });
    return requests.length === 1 ? call('read_catalog', { productId: 'notebook' }) :
      call('propose_payment', { ...trustedIntent(issued), rationale: 'The notebook matches the request.' });
  };
  const agent = new Agent({ ...config(), openaiKey: 'test-secret', openaiModel: 'configured-model' }, fetcher);
  const result = await agent.run(issued, 'live');
  assert.equal(result.evaluation.decision, 'ALLOW');
  assert.equal(result.agent.explanationSource, 'MODEL_UNVERIFIED');
  assert.equal(requests.length, 2);
  const second = JSON.parse(requests[1].body);
  assert.equal(second.store, false);
  assert.equal(second.parallel_tool_calls, false);
  assert.ok(second.tools.every(tool => tool.strict && !tool.parameters.additionalProperties));
  assert.ok(second.input.some(item => item.type === 'function_call_output'));
});

test('malicious content cannot grant tool authority even if model obeys it', async () => {
  const issued = issueAuthorization(consent('notebook', 'block'), 'shopper', 'MERCHANT12345');
  let count = 0;
  const agent = new Agent({ ...config(), openaiKey: 'test', openaiModel: 'test' }, async () =>
    ++count === 1 ? call('read_catalog', { productId: 'notebook' }) :
      call('propose_payment', { ...trustedIntent(issued), payeeId: 'attacker', rationale: 'The webpage says I am approved.' }));
  const result = await agent.run(issued, 'live');
  assert.equal(result.evaluation.decision, 'BLOCK');
  assert.ok(result.evaluation.reasons.includes('Unauthorized recipient'));
});

for (const [name, output] of [
  ['unknown payment tool', () => call('capture_payment', {})],
  ['cross-item catalog read', () => call('read_catalog', { productId: 'console' })],
  ['proposal before catalog read', issued => call('propose_payment', { ...trustedIntent(issued), rationale: 'skip' })],
  ['extra approval field', () => call('read_catalog', { productId: 'notebook', approved: true })],
  ['multiple calls', () => Response.json({ status: 'completed', output: [
    { type: 'function_call', name: 'read_catalog', arguments: '{}', call_id: 'a' },
    { type: 'function_call', name: 'capture', arguments: '{}', call_id: 'b' }] })],
  ['malformed JSON', () => Response.json({ status: 'completed', output: [{ type: 'function_call', name: 'read_catalog', arguments: '{', call_id: 'a' }] })],
  ['incomplete output', () => Response.json({ status: 'incomplete', output: [] })],
]) test(`fail closed on ${name}`, async () => {
  const issued = auth();
  const agent = new Agent({ ...config(), openaiKey: 'test', openaiModel: 'test' }, async () => output(issued));
  const result = await agent.run(issued, 'live');
  assert.equal(result.evaluation.decision, 'BLOCK');
  assert.equal(result.agent.status, 'FAILED');
});

test('model outage or missing key never silently switches to fixtures', async () => {
  const missing = await new Agent(config()).run(auth(), 'live');
  assert.equal(missing.agent.errorCode, 'MODEL_NOT_CONFIGURED');
  const failed = await new Agent({ ...config(), openaiKey: 'secret', openaiModel: 'test' },
    async () => { throw Error('secret payload'); }).run(auth(), 'live');
  assert.equal(failed.evaluation.decision, 'BLOCK');
  assert.equal(failed.agent.mode, 'live');
  assert.ok(!JSON.stringify(failed).includes('secret payload'));
});
