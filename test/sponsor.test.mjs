import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.mjs';
import { Agent } from '../src/agent.mjs';

const env = { SHOPPER_TOKEN: 's'.repeat(64), OPERATOR_TOKEN: 'o'.repeat(64) };
test('default sponsor mode ignores paid provider keys and cannot fall back', async () => {
  const config = loadConfig({ ...env, OPENAI_API_KEY: 'paid-key', OPENAI_MODEL: 'paid-model' });
  assert.equal(config.openaiKey, '');
  assert.equal(config.modelProvider, 'astropods');
  let calls = 0;
  const agent = new Agent(config, async () => { calls++; });
  assert.equal(agent.configured, false);
  await assert.rejects(agent.response([]), error => error.code === 'MODEL_NOT_CONFIGURED');
  assert.equal(calls, 0);
});
test('sponsor requests use only gateway credentials and retain bounded tools', async () => {
  const config = loadConfig({ ...env, ASTRO_GATEWAY_URL: 'https://gateway.example',
    ASTRO_GATEWAY_API_KEY: 'sponsor-key', OPENAI_API_KEY: 'paid-key' });
  const agent = new Agent(config, async (url, options) => {
    assert.equal(url, 'https://gateway.example/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer sponsor-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'claude-haiku-4-5');
    assert.equal(body.store, false);
    assert.equal(body.max_output_tokens, 1200);
    assert.deepEqual(body.tools.map(tool => tool.name), ['read_catalog', 'propose_payment']);
    assert.equal(options.redirect, 'error');
    return Response.json({ status: 'completed', output: [] });
  });
  assert.equal(agent.configured, true);
  await agent.response([]);
});
test('gateway configuration rejects plaintext, credentials, and arbitrary paths', () => {
  for (const url of ['http://gateway.example', 'https://user:secret@gateway.example', 'https://gateway.example/v1'])
    assert.throws(() => loadConfig({ ...env, ASTRO_GATEWAY_URL: url }));
});
