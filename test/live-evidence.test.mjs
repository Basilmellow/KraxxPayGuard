import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeLiveEvidence } from '../scripts/summarize-live-evidence.mjs';

function fixture(overrides = {}) {
  return { schema: 'payguard-redacted-evidence/v1', source: 'REAL_APIS', decision: 'ALLOW', approval: 'NOT_REQUIRED',
    agent: { mode: 'live', status: 'COMPLETED', provider: 'astropods', model: 'claude-haiku-4-5',
      trace: [{ tool: 'read_catalog', status: 'VALIDATED' }, { tool: 'propose_payment', status: 'VALIDATED' }] },
    mandate: { type: 'purchase-mandate/v1', currency: 'USD', budgetCents: 5000, autoLimitCents: 5000,
      offers: [{ productId: 'notebook', merchantId: 'store', amountCents: 4900, currency: 'USD' }] },
    proposal: { productId: 'notebook', merchantId: 'store', amountCents: 4900, currency: 'USD', recipient: '[REDACTED]' },
    payment: { status: 'NOT_CREATED', orderVerified: false, captureVerified: false },
    audit: [{ seq: 1, event: 'AGENT_STARTED', at: '2026-10-27T00:00:00Z' }], ...overrides };
}
const summarize = e => summarizeLiveEvidence([{ id: 'case', evidence: e }]);
test('offline summarizer records observed authority outcomes without API calls or private text', () => {
  const e = fixture({ privateText: 'PRIVATE_SENTINEL' });
  const report = summarize(e);
  assert.equal(report.totals.runs, 1); assert.equal(report.totals.allow, 1);
  assert.equal(report.totals.validatedModelToolResponses, 2);
  assert.equal(report.totals.paymentOperations, 0);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_SENTINEL'));
  assert.ok(report.limitations.some(s => s.includes('cannot independently recompute recipient')));
});
test('fixture/mock exports cannot be counted as real gateway evidence', () => {
  for (const source of ['JUDGE_FIXTURE', 'MOCK_TEST_FIXTURE', 'DETERMINISTIC_POLICY_HARNESS'])
    assert.throws(() => summarize(fixture({ source })));
  const e = fixture(); e.agent.mode = 'deterministic'; assert.throws(() => summarize(e));
});
test('duplicate exports cannot inflate live run totals even with changed generation timestamps', () => {
  const e = fixture();
  assert.throws(() => summarizeLiveEvidence([{ id: 'a', evidence: e }, { id: 'b', evidence: { ...e, generatedAt: 'later' } }]), /Duplicate/);
});
test('inconsistent ALLOW or already-executed payment evidence is refused', () => {
  const e = fixture(); e.mandate.budgetCents = 2000; assert.throws(() => summarize(e), /authority/);
  assert.throws(() => summarize(fixture({ payment: { status: 'COMPLETED' } })));
});
test('REVIEW and over-budget BLOCK remain distinct recorded outcomes', () => {
  const review = fixture({ decision: 'REVIEW', approval: 'PENDING' }); review.mandate.autoLimitCents = 1000;
  assert.equal(summarize(review).totals.review, 1);
  review.approval = 'APPROVED'; assert.throws(() => summarize(review));
  const block = fixture({ decision: 'BLOCK' }); block.mandate.budgetCents = 2000;
  assert.equal(summarize(block).rows[0].withinVisibleMandate, false);
});
