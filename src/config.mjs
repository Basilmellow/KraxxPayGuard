import { requireValue } from './errors.mjs';

export function loadConfig(env = process.env) {
  const parseOrigin = (value, label) => {
    try { return new URL(value); } catch { requireValue(false, 500, `${label} must be a valid exact origin`); }
  };
  const host = env.HOST || '127.0.0.1';
  const port = Number(env.PORT || 3000);
  const origin = env.APP_ORIGIN || `http://127.0.0.1:${port}`;
  const parsed = parseOrigin(origin, 'APP_ORIGIN');
  requireValue(parsed.origin === origin && !parsed.username && !parsed.password, 500, 'APP_ORIGIN must be an exact origin');
  requireValue(Number.isInteger(port) && port >= 1 && port <= 65535, 500, 'Invalid PORT');
  requireValue(/^[A-Za-z0-9_-]{32,256}$/.test(env.OPERATOR_TOKEN || '') &&
    /^[A-Za-z0-9_-]{32,256}$/.test(env.SHOPPER_TOKEN || '') &&
    env.OPERATOR_TOKEN !== env.SHOPPER_TOKEN, 500, 'Run npm run setup: distinct 32+ character operator/shopper tokens are required');
  if (!['127.0.0.1', '::1', 'localhost'].includes(host))
    requireValue(parsed.protocol === 'https:', 500, 'Remote hosting requires HTTPS APP_ORIGIN');
  const payeeId = env.PAYPAL_MERCHANT_ID || 'kraxx-sandbox-merchant';
  if (env.PAYPAL_MERCHANT_ID) requireValue(/^[A-Z0-9]{8,32}$/.test(payeeId), 500, 'Invalid Sandbox merchant ID');
  const modelProvider = env.MODEL_PROVIDER || 'astropods';
  requireValue(['astropods', 'openai'].includes(modelProvider), 500, 'Invalid MODEL_PROVIDER');
  const gatewayUrl = env.ASTRO_GATEWAY_URL || '';
  if (gatewayUrl) {
    const gateway = parseOrigin(gatewayUrl, 'ASTRO_GATEWAY_URL');
    requireValue(gateway.protocol === 'https:' && gateway.origin === gatewayUrl && !gateway.username && !gateway.password,
      500, 'ASTRO_GATEWAY_URL must be an exact HTTPS origin from Astropods');
  }
  const secondaryPayee = env.PAYPAL_SECONDARY_MERCHANT_ID || 'unconfigured-lab-merchant';
  if (env.PAYPAL_SECONDARY_MERCHANT_ID) requireValue(/^[A-Z0-9]{8,32}$/.test(secondaryPayee), 500, 'Invalid secondary Sandbox merchant ID');
  const secondaryValues = [env.PAYPAL_SECONDARY_CLIENT_ID, env.PAYPAL_SECONDARY_CLIENT_SECRET, env.PAYPAL_SECONDARY_MERCHANT_ID];
  if (secondaryValues.some(Boolean)) requireValue(secondaryValues.every(Boolean) && secondaryPayee !== payeeId,
    500, 'Secondary merchant requires its own complete credential set and distinct merchant ID');
  return { host, port, origin, operatorToken: env.OPERATOR_TOKEN, shopperToken: env.SHOPPER_TOKEN,
    merchantPayees: { 'kraxx-demo-store': payeeId, 'kraxx-lab-supply': secondaryPayee },
    secondaryPayPal: { origin, payeeId: env.PAYPAL_SECONDARY_MERCHANT_ID || '',
      paypalClientId: env.PAYPAL_SECONDARY_CLIENT_ID || '', paypalClientSecret: env.PAYPAL_SECONDARY_CLIENT_SECRET || '' },
    dbPath: env.DATABASE_PATH || 'data/payguard.sqlite', payeeId,
    paypalClientId: env.PAYPAL_CLIENT_ID || '', paypalClientSecret: env.PAYPAL_CLIENT_SECRET || '',
    paypalMerchantConfigured: !!env.PAYPAL_MERCHANT_ID,
    modelProvider, modelEndpoint: modelProvider === 'astropods' ? (gatewayUrl ? `${gatewayUrl}/v1/responses` : '') : 'https://api.openai.com/v1/responses',
    openaiKey: modelProvider === 'astropods' ? (env.ASTRO_GATEWAY_API_KEY || '') : (env.OPENAI_API_KEY || ''),
    openaiModel: modelProvider === 'astropods' ? (env.MODEL_DEFAULT || 'claude-haiku-4-5') : (env.OPENAI_MODEL || ''), rateLimit: 120 };
}
