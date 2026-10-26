import { POLICY_VERSION, catalog, merchants } from './policy.mjs';

export function decisionEvidence(item, providerMode = 'REAL_APIS') {
  // Allowlist only. Never export free text, labels, recipients, tokens or operation IDs.
  const auth = item.authorization;
  const offers = auth.offers || [{ productId: auth.productId, merchantId: auth.merchantId, amountCents: auth.amountCents, currency: auth.currency }];
  const proposal = item.agent.proposal || item.intent;
  return { schema: 'payguard-redacted-evidence/v1', generatedAt: new Date().toISOString(),
    source: item.source === 'JUDGE_FIXTURE' ? 'JUDGE_FIXTURE' : providerMode,
    policyVersion: item.policyVersion || POLICY_VERSION, decision: item.decision, approval: item.approval,
    mandate: { type: auth.type || 'legacy-single-item', maxPurchases: 1, currency: auth.currency,
      budgetCents: auth.budgetCents, autoLimitCents: auth.autoLimitCents,
      beneficiaryKind: auth.beneficiary?.kind || 'self', expiresAt: auth.expiresAt,
      offers: offers.map(({ productId, merchantId, amountCents, currency }) => ({ productId, merchantId, amountCents, currency })) },
    proposal: proposal ? { productId: Object.hasOwn(catalog, proposal.productId) ? proposal.productId : '[UNRECOGNIZED_PRODUCT]',
      merchantId: Object.hasOwn(merchants, proposal.merchantId) ? proposal.merchantId : '[UNRECOGNIZED_MERCHANT]',
      amountCents: Number.isSafeInteger(proposal.amountCents) ? proposal.amountCents : '[INVALID]',
      currency: /^[A-Z]{3}$/.test(proposal.currency || '') ? proposal.currency : '[INVALID]', recipient: '[REDACTED]' } : null,
    agent: { mode: item.agent.mode, status: item.agent.status, provider: item.agent.provider || null,
      model: item.agent.model || null, explanationSource: item.agent.explanationSource || null,
      trace: (item.agent.trace || []).map(({ tool, productId, status }) => ({ tool, productId, status })) },
    policy: { reasons: [...item.reasons], signals: [...(item.signals || [])] },
    lab: item.lab ? { preset: item.lab.id === 'custom' ? 'custom-text-redacted' : item.lab.id } : null,
    payment: { status: item.payment.status, orderVerified: !!item.payment.orderId,
      captureVerified: item.payment.status === 'COMPLETED' && !!item.payment.captureId },
    audit: item.audit.map(({ seq, event, at }) => ({ seq, event, at })),
    redacted: ['authorization and intent IDs', 'recipient IDs', 'operation IDs', 'provider order/capture IDs',
      'original instruction', 'beneficiary label', 'merchant payload', 'model explanation', 'principal identities'],
    limitations: ['Application audit is not independently tamper-proof.', 'Provider configuration alone does not prove payment completion.',
      'Fixture, mock and live results must be evaluated separately.'] };
}
