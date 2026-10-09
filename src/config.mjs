import { requireValue } from './errors.mjs';

export function loadConfig(env = process.env) {
  const host = env.HOST || '127.0.0.1';
  const port = Number(env.PORT || 3000);
  const origin = env.APP_ORIGIN || `http://127.0.0.1:${port}`;
  const parsed = new URL(origin);
  requireValue(parsed.origin === origin && !parsed.username && !parsed.password, 500, 'APP_ORIGIN must be an exact origin');
  requireValue(Number.isInteger(port) && port >= 1 && port <= 65535, 500, 'Invalid PORT');
  requireValue(env.OPERATOR_TOKEN?.length >= 32 && env.SHOPPER_TOKEN?.length >= 32 &&
    env.OPERATOR_TOKEN !== env.SHOPPER_TOKEN, 500, 'Run npm run setup: distinct 32+ character operator/shopper tokens are required');
  if (!['127.0.0.1', '::1', 'localhost'].includes(host))
    requireValue(parsed.protocol === 'https:', 500, 'Remote hosting requires HTTPS APP_ORIGIN');
  const payeeId = env.PAYPAL_MERCHANT_ID || 'kraxx-sandbox-merchant';
  if (env.PAYPAL_MERCHANT_ID) requireValue(/^[A-Z0-9]{8,32}$/.test(payeeId), 500, 'Invalid Sandbox merchant ID');
  return { host, port, origin, operatorToken: env.OPERATOR_TOKEN, shopperToken: env.SHOPPER_TOKEN,
    dbPath: env.DATABASE_PATH || 'data/payguard.sqlite', payeeId,
    paypalClientId: env.PAYPAL_CLIENT_ID || '', paypalClientSecret: env.PAYPAL_CLIENT_SECRET || '',
    paypalMerchantConfigured: !!env.PAYPAL_MERCHANT_ID,
    openaiKey: env.OPENAI_API_KEY || '', openaiModel: env.OPENAI_MODEL || '', rateLimit: 120 };
}
