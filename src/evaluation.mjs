import { issueAuthorization, trustedIntent, evaluate, POLICY_VERSION } from './policy.mjs';
import { attackPresets } from './lab.mjs';

export function evaluateAttacks() {
  const auth = issueAuthorization({ type: 'purchase-mandate/v1', productIds: ['notebook'],
    merchantIds: ['kraxx-demo-store'], categories: ['stationery'], beneficiary: { kind: 'self', label: 'Synthetic evaluation' },
    budgetCents: 5000, autoLimitCents: 5000, instruction: 'Buy one authorized notebook only.' },
  'evaluation-fixture', { 'kraxx-demo-store': 'synthetic-recipient' });
  const rows = attackPresets.map(preset => {
    const proposal = { ...trustedIntent(auth), ...preset.mutation, untrustedContext: preset.text };
    const result = evaluate(proposal, auth);
    return { scenario: preset.id, class: preset.class, kind: preset.kind, proposer: 'SYNTHETIC_COMPLIANCE_FIXTURE',
      expected: preset.kind === 'attack' ? 'BLOCK' : 'ALLOW', actual: result.decision, signals: result.signals,
      unauthorizedProposal: preset.kind === 'attack', reasons: result.reasons };
  });
  const attacks = rows.filter(x => x.kind === 'attack'), benign = rows.filter(x => x.kind === 'benign');
  return { schema: 'payguard-firewall-evaluation/v1', generatedAt: new Date().toISOString(), policyVersion: POLICY_VERSION,
    source: 'DETERMINISTIC_POLICY_HARNESS', actualModelCalls: 0, actualPayPalCalls: 0,
    totals: { scenarios: rows.length, attacks: attacks.length, benign: benign.length,
      unauthorizedProposalsAllowed: attacks.filter(x => x.actual !== 'BLOCK').length,
      falsePositives: benign.filter(x => x.actual === 'BLOCK').length,
      expectedOutcomes: rows.filter(x => x.expected === x.actual).length }, rows,
    limitations: ['Synthetic proposals test the firewall, not model robustness.', 'Three benign controls are not representative of production false-positive rates.',
      'No universal prompt-injection prevention claim.', 'Legacy single-item mode retains a conservative text-signal veto; these results concern typed mandates.'] };
}

export function judgeFixtures() {
  return ['allow', 'review', 'block'].map(scenario => {
    const auth = issueAuthorization({ productId: scenario === 'review' ? 'console' : 'notebook', scenario,
      budgetCents: scenario === 'review' ? 70000 : 5000, autoLimitCents: scenario === 'review' ? 10000 : 5000,
      instruction: 'Synthetic guided judge purchase; no payment authorization.' }, 'judge-fixture', 'synthetic-recipient');
    const proposal = { ...trustedIntent(auth), ...(scenario === 'block' ? { payeeId: 'attacker' } : {}) };
    const evaluation = evaluate(proposal, auth);
    return { id: `judge-${scenario}`, authorizationId: auth.id, source: 'JUDGE_FIXTURE', authorization: auth,
      ...evaluation, agent: { mode: 'deterministic', status: 'COMPLETED', proposal,
        explanationSource: 'DETERMINISTIC_FIXTURE', explanation: 'Synthetic proposal evaluated by the real server policy. No model call or payment is made.', trace: [] },
      approval: scenario === 'review' ? 'PENDING' : 'NOT_REQUIRED', payment: { status: 'JUDGE_NO_PAYMENT' },
      audit: [{ seq: 1, event: 'JUDGE_FIXTURE_EVALUATED', actor: 'fixture', at: new Date().toISOString(), details: {} }] };
  });
}
