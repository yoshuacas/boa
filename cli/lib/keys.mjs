import { createHmac } from 'node:crypto';

function b64url(str) {
  return Buffer.from(str).toString('base64url');
}

function sign(payload, secret, iat) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload = { ...payload, iat };
  const segments = [
    b64url(JSON.stringify(header)),
    b64url(JSON.stringify(fullPayload)),
  ];
  const sig = createHmac('sha256', secret)
    .update(segments.join('.'))
    .digest('base64url');
  return [...segments, sig].join('.');
}

// 90-day default. Reduced from 10 years (security review H-5): a
// leaked service_role key bypasses Cedar, and the prior 10-year
// lifetime made the impact window unbounded. Rotate with
// `boa rotate-keys`.
export const DEFAULT_KEY_EXPIRY_SECONDS = 90 * 24 * 3600;

export function generateKeys(secret, { expirySeconds = DEFAULT_KEY_EXPIRY_SECONDS } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const anonKey = sign(
    { role: 'anon', iss: 'pgrest-lambda', exp: now + expirySeconds },
    secret, now
  );
  const serviceRoleKey = sign(
    { role: 'service_role', iss: 'pgrest-lambda', exp: now + expirySeconds },
    secret, now
  );
  return { anonKey, serviceRoleKey };
}
