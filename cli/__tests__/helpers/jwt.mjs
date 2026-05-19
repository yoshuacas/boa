import { createHmac } from 'node:crypto';

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

export function makeJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const content = `${base64url(header)}.${base64url(payload)}`;
  if (secret) {
    const sig = createHmac('sha256', secret).update(content).digest('base64url');
    return `${content}.${sig}`;
  }
  return `${content}.fake-signature`;
}
