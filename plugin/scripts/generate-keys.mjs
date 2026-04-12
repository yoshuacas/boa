import { createHmac } from 'node:crypto';

const secret = process.argv[2];
if (!secret) {
  console.error('Usage: node generate-keys.mjs <jwt-secret>');
  process.exit(1);
}

function sign(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now };
  const segments = [
    b64url(JSON.stringify(header)),
    b64url(JSON.stringify(fullPayload)),
  ];
  const sig = createHmac('sha256', secret)
    .update(segments.join('.'))
    .digest('base64url');
  return [...segments, sig].join('.');
}

function b64url(str) {
  return Buffer.from(str).toString('base64url');
}

const TEN_YEARS = 10 * 365 * 24 * 3600;
const now = Math.floor(Date.now() / 1000);

const anonKey = sign(
  { role: 'anon', iss: 'pgrest-lambda', exp: now + TEN_YEARS },
  secret
);
const serviceRoleKey = sign(
  { role: 'service_role', iss: 'pgrest-lambda', exp: now + TEN_YEARS },
  secret
);

console.log(JSON.stringify({ anonKey, serviceRoleKey }));
