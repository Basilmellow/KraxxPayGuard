import { AppError, requireValue } from './errors.mjs';
import { evaluate } from './policy.mjs';
import { verifyOrder, verifyCapture, approvalLink } from './paypal.mjs';

const RETRY_WINDOW = 5 * 60 * 60 * 1000;
export class Payments {
  constructor(store, paypal, payeeId) { Object.assign(this, { store, paypal, payeeId }); }
  eligible(item, now = Date.now()) {
    requireValue(item.agent.status === 'COMPLETED' && item.decision !== 'BLOCK' &&
      ['NOT_REQUIRED', 'APPROVED'].includes(item.approval), 403, 'Policy denies payment');
    const current = evaluate(item.intent, item.authorization, now);
    requireValue(current.decision === item.decision && current.decision !== 'BLOCK' &&
      item.authorization.payeeId === this.payeeId, 403, 'Authorization expired or policy changed');
  }
  async run(id, operation) {
    const { item, token } = this.store.claim(id);
    try {
      requireValue(item.decision !== 'BLOCK' && item.agent.status === 'COMPLETED' &&
        ['NOT_REQUIRED', 'APPROVED'].includes(item.approval), 403, 'Policy denies payment');
      if (item.payment.status === 'COMPLETED') {
        this.store.checkpoint(item, token, null, {}, true);
        return this.store.get(id);
      }
      requireValue(this.paypal.configured, 503, 'PayPal Sandbox credentials and merchant ID are required', 'PAYPAL_NOT_CONFIGURED');
      if (operation === 'checkout') {
        if (item.payment.orderId) {
          this.store.checkpoint(item, token, null, {}, true);
          return this.store.get(id);
        }
        this.eligible(item);
        requireValue(!item.payment.createStartedAt || Date.now() - item.payment.createStartedAt < RETRY_WINDOW,
          409, 'Creation retry window expired; operator reconciliation required', 'RECONCILE_REQUIRED');
        item.payment.createStartedAt ||= Date.now();
        item.payment.status = 'CREATING';
        this.store.checkpoint(item, token, 'PAYPAL_CREATE_REQUESTED');
        const order = await this.paypal.create(item);
        verifyOrder(order, item, ['CREATED', 'PAYER_ACTION_REQUIRED', 'APPROVED', 'COMPLETED']);
        item.payment.orderId = order.id;
        if (order.status === 'COMPLETED') {
          item.payment.captureId = verifyCapture(order, item);
          item.payment.status = 'COMPLETED';
        } else {
          item.payment.approvalUrl = approvalLink(order);
          item.payment.status = 'AWAITING_BUYER_APPROVAL';
        }
        this.store.checkpoint(item, token, 'PAYPAL_ORDER_VERIFIED', { orderId: order.id }, true);
        return this.store.get(id);
      }
      requireValue(item.payment.orderId, 409, 'No PayPal order to capture');
      // Reconcile before expiry checks: a lost prior capture response can be
      // resolved without initiating another payment after authorization expiry.
      const order = await this.paypal.show(item.payment.orderId);
      verifyOrder(order, item, ['APPROVED', 'COMPLETED', 'CREATED', 'PAYER_ACTION_REQUIRED']);
      if (order.status === 'COMPLETED') {
        item.payment.captureId = verifyCapture(order, item);
        item.payment.status = 'COMPLETED';
        this.store.checkpoint(item, token, 'PAYPAL_CAPTURE_RECONCILED', { captureId: item.payment.captureId }, true);
        return this.store.get(id);
      }
      this.eligible(item);
      requireValue(order.status === 'APPROVED', 409, 'Buyer must approve the Sandbox order first', 'BUYER_APPROVAL_REQUIRED');
      requireValue(!item.payment.captureStartedAt || Date.now() - item.payment.captureStartedAt < RETRY_WINDOW,
        409, 'Capture retry window expired; operator reconciliation required', 'RECONCILE_REQUIRED');
      item.payment.captureStartedAt ||= Date.now();
      item.payment.status = 'CAPTURING';
      this.store.checkpoint(item, token, 'PAYPAL_CAPTURE_REQUESTED');
      const response = await this.paypal.capture(item);
      requireValue(response.id === item.payment.orderId && response.status === 'COMPLETED',
        409, 'PayPal capture not confirmed', 'CAPTURE_UNCONFIRMED');
      // Capture responses can omit order fields; fetch the complete order for
      // recipient/item verification and recorded completed capture evidence.
      const captured = await this.paypal.show(item.payment.orderId);
      item.payment.captureId = verifyCapture(captured, item);
      item.payment.status = 'COMPLETED';
      this.store.checkpoint(item, token, 'PAYPAL_CAPTURE_VERIFIED', { captureId: item.payment.captureId }, true);
      return this.store.get(id);
    } catch (error) {
      item.payment.lastError = error instanceof AppError ? error.code : 'PAYMENT_FAILED';
      this.store.checkpoint(item, token, 'PAYMENT_DENIED_OR_UNCERTAIN', { code: item.payment.lastError }, true);
      throw error;
    }
  }
}
