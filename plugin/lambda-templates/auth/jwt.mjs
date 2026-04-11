const SECRET = process.env.JWT_SECRET;
const ISSUER = 'boa';

export function signAccessToken({ sub, email }) {
  throw new Error('not implemented');
}

export function signRefreshToken(sub, providerRefreshToken) {
  throw new Error('not implemented');
}

export function verifyToken(token) {
  throw new Error('not implemented');
}
