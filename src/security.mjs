import { timingSafeEqual } from 'node:crypto';
import { AppError, requireValue } from './errors.mjs';

export const headers = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const equal = (value, expected) => {
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
export function authenticate(req, config) {
  const value = req.headers.authorization || '';
  requireValue(value.startsWith('Bearer ') && value.length <= 300, 401, 'Authentication required', 'UNAUTHORIZED');
  const supplied = value.slice(7);
  if (equal(supplied, config.operatorToken)) return { id: 'operator', role: 'operator' };
  if (equal(supplied, config.shopperToken)) return { id: 'shopper', role: 'shopper' };
  throw new AppError(401, 'Invalid access token', 'UNAUTHORIZED');
}
export function mutationGuard(req, config) {
  requireValue(req.headers.origin === config.origin, 403, 'Request origin denied', 'ORIGIN_DENIED');
  requireValue(!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin', 403, 'Cross-site request denied');
  requireValue(req.headers['x-payguard-request'] === '1', 403, 'CSRF request header required', 'CSRF_DENIED');
  requireValue(/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || ''),
    415, 'Content-Type must be application/json');
}
export async function readJson(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    requireValue(bytes <= 16000, 413, 'Request too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new AppError(400, 'Invalid JSON'); }
}
export class RateLimiter {
  constructor(max = 120) { this.max = max; this.buckets = new Map(); }
  check(key, now = Date.now()) {
    for (const [id, bucket] of this.buckets) if (now >= bucket.until) this.buckets.delete(id);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      requireValue(this.buckets.size < 1000, 429, 'Rate limiter at capacity');
      bucket = { count: 0, until: now + 60000 };
      this.buckets.set(key, bucket);
    }
    requireValue(++bucket.count <= this.max, 429, 'Rate limit exceeded', 'RATE_LIMITED');
  }
}
