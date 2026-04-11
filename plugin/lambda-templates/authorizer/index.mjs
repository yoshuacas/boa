import jwt from 'jsonwebtoken';

const ISSUER = 'boa';
const SECRET = process.env.JWT_SECRET;

export async function handler(event) {
  try {
    const secret = SECRET;
    const apikey = event.headers?.apikey
      || event.headers?.Apikey || '';
    const authHeader = event.headers?.Authorization
      || event.headers?.authorization || '';

    // 1. Validate apikey
    if (!apikey) throw 'Unauthorized';
    const apikeyPayload = jwt.verify(apikey, secret,
      { issuer: ISSUER });
    if (!['anon', 'service_role'].includes(apikeyPayload.role))
      throw 'Unauthorized';

    // 2. Determine effective identity
    let role = apikeyPayload.role;
    let userId = '';
    let email = '';

    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = jwt.verify(token, secret,
        { issuer: ISSUER });
      role = payload.role;
      userId = payload.sub || '';
      email = payload.email || '';
    }

    // 3. Return Allow policy with context
    return allow(event.methodArn, { role, userId, email });
  } catch (err) {
    // Throw "Unauthorized" string so API Gateway returns 401
    // (a Deny policy returns 403, which breaks supabase-js token refresh)
    throw 'Unauthorized';
  }
}

function allow(methodArn, context) {
  // Replace specific method/path with wildcard for caching
  const arnBase = methodArn.split('/').slice(0, 2).join('/');
  return {
    principalId: context.userId || 'anon',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: 'Allow',
        Resource: arnBase + '/*',
      }],
    },
    context,
  };
}

function deny(methodArn) {
  return {
    principalId: 'unauthorized',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: 'Deny',
        Resource: '*',
      }],
    },
  };
}
