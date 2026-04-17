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

const TEN_YEARS = 10 * 365 * 24 * 3600;

export function generateKeys(secret) {
  const now = Math.floor(Date.now() / 1000);
  const anonKey = sign(
    { role: 'anon', iss: 'pgrest-lambda', exp: now + TEN_YEARS },
    secret, now
  );
  const serviceRoleKey = sign(
    { role: 'service_role', iss: 'pgrest-lambda', exp: now + TEN_YEARS },
    secret, now
  );
  return { anonKey, serviceRoleKey };
}
