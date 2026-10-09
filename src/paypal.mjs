import { AppError, requireValue } from './errors.mjs';

export const SANDBOX_API = 'https://api-m.sandbox.paypal.com';
const ID = /^[A-Z0-9]{8,32}$/;
export const money = cents => (cents / 100).toFixed(2);

export function verifyOrder(order, item, statuses) {
  const units = order.purchase_units;
  const unit = units?.[0];
  requireValue(ID.test(order.id || '') && (!item.payment.orderId || order.id === item.payment.orderId) &&
    order.intent === 'CAPTURE' && statuses.includes(order.status) && Array.isArray(units) && units.length === 1 &&
    unit.reference_id === item.id && unit.custom_id === item.authorizationId &&
    unit.payee?.merchant_id === item.authorization.payeeId &&
    unit.amount?.currency_code === item.authorization.currency &&
    unit.amount?.value === money(item.intent.amountCents) &&
    unit.items?.length === 1 && unit.items[0].sku === item.intent.productId &&
    unit.items[0].quantity === '1' && unit.items[0].unit_amount?.currency_code === item.intent.currency &&
    unit.items[0].unit_amount?.value === money(item.intent.amountCents),
  409, 'PayPal order does not match authorized recipient, price, currency or reference', 'PAYPAL_MISMATCH');
  return unit;
}

export function verifyCapture(order, item) {
  const unit = verifyOrder(order, item, ['COMPLETED']);
  const captures = unit.payments?.captures;
  const capture = captures?.[0];
  requireValue(Array.isArray(captures) && captures.length === 1 && ID.test(capture?.id || '') &&
    capture.status === 'COMPLETED' && capture.final_capture === true &&
    capture.amount?.currency_code === item.intent.currency &&
    capture.amount?.value === money(item.intent.amountCents),
  409, 'PayPal completed capture evidence does not match authorization', 'CAPTURE_MISMATCH');
  return capture.id;
}

export function approvalLink(order) {
  const link = order.links?.find(value => ['approve', 'payer-action'].includes(value.rel))?.href;
  let url;
  try { url = new URL(link); } catch { throw new AppError(502, 'PayPal approval link missing'); }
  requireValue(url.protocol === 'https:' && url.hostname === 'www.sandbox.paypal.com' &&
    !url.username && !url.password && !url.port && url.pathname === '/checkoutnow' &&
    url.searchParams.get('token') === order.id, 502, 'Unsafe PayPal approval URL');
  return url.href;
}

export class PayPal {
  constructor(config, fetcher = fetch) {
    this.config = config;
    this.fetcher = fetcher;
    this.accessToken = null;
    this.tokenUntil = 0;
  }
  get configured() { return !!(this.config.paypalClientId && this.config.paypalClientSecret && this.config.payeeId); }
  async request(path, { method = 'GET', body, requestId } = {}) {
    requireValue(this.configured, 503, 'PayPal Sandbox credentials and merchant ID are required', 'PAYPAL_NOT_CONFIGURED');
    requireValue(/^\/v2\/checkout\/orders(?:\/[A-Z0-9]{8,32}(?:\/capture)?)?$/.test(path), 500, 'Invalid PayPal operation');
    try {
      if (!this.accessToken || Date.now() >= this.tokenUntil) {
        const response = await this.fetcher(`${SANDBOX_API}/v1/oauth2/token`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Basic ${Buffer.from(`${this.config.paypalClientId}:${this.config.paypalClientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
        if (!response.ok) {
          const details = await response.json().catch(() => ({}));
          if (response.status === 401 && details.error === 'invalid_client')
            throw new AppError(503, 'PayPal Sandbox rejected the client ID/secret pair. Use matching credentials from the same Sandbox REST app, then restart the server.', 'PAYPAL_CREDENTIALS_REJECTED');
          throw new AppError(502, 'PayPal Sandbox OAuth failed', 'PAYPAL_OAUTH_FAILED');
        }
        const token = await response.json();
        requireValue(typeof token.access_token === 'string' && token.access_token.length > 0 &&
          Number.isFinite(token.expires_in) && token.expires_in > 60, 502, 'Invalid PayPal OAuth response');
        this.accessToken = token.access_token;
        this.tokenUntil = Date.now() + Math.min(token.expires_in - 60, 3600) * 1000;
      }
      const response = await this.fetcher(`${SANDBOX_API}${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json',
          Prefer: 'return=representation', ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      if (response.status === 401) { this.accessToken = null; this.tokenUntil = 0; }
      requireValue(response.ok, 502, `PayPal Sandbox request failed (${response.status})`, 'PAYPAL_API_FAILED');
      return await response.json();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, 'PayPal Sandbox response unavailable; retry to reconcile', 'PAYPAL_UNCERTAIN');
    }
  }
  create(item) {
    const amount = { currency_code: item.intent.currency, value: money(item.intent.amountCents) };
    return this.request('/v2/checkout/orders', { method: 'POST', requestId: item.payment.createRequestId,
      body: { intent: 'CAPTURE', payment_source: { paypal: { experience_context: {
        user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING',
        return_url: `${this.config.origin}/?paypal=return`, cancel_url: `${this.config.origin}/?paypal=cancel`,
      } } }, purchase_units: [{ reference_id: item.id, custom_id: item.authorizationId,
        payee: { merchant_id: item.authorization.payeeId }, description: item.product.label,
        amount: { ...amount, breakdown: { item_total: amount } },
        items: [{ name: item.product.label, sku: item.intent.productId, quantity: '1', unit_amount: amount }] }]
      } });
  }
  show(id) { return this.request(`/v2/checkout/orders/${id}`); }
  capture(item) { return this.request(`/v2/checkout/orders/${item.payment.orderId}/capture`,
    { method: 'POST', requestId: item.payment.captureRequestId, body: {} }); }
}
