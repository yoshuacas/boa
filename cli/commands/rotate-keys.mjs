import { randomBytes } from 'node:crypto';
import * as aws from '../lib/aws.mjs';
import * as config from '../lib/config.mjs';
import { generateKeys, DEFAULT_KEY_EXPIRY_SECONDS } from '../lib/keys.mjs';

// `boa rotate-keys` — rotate the anon and service role keys in place
// without redeploying the stack.
//
// By default, re-signs fresh keys with the *existing* JWT secret
// pulled from SSM. Callers can pass --rotate-secret to also mint a
// new JWT secret (which invalidates every outstanding user session).
//
// Introduced by security review H-5. Keys are issued with a 90-day
// lifetime (see DEFAULT_KEY_EXPIRY_SECONDS) and this command is the
// supported way to refresh them before expiry.

export default async function rotateKeys(args = []) {
  const cfg = config.requireConfig();
  const rotateSecret = args.includes('--rotate-secret');

  const { stackName, region } = cfg;
  const ssmPath = `/${stackName}/jwt-secret`;

  let jwtSecret;
  if (rotateSecret) {
    console.log('Rotating JWT secret in SSM...');
    jwtSecret = randomBytes(32).toString('base64');
    aws.ssmPutParameter(ssmPath, jwtSecret, region);
    console.log('  New JWT secret written to', ssmPath);
    console.log(
      '  WARNING: every existing user session is now invalid.'
      + ' Users must sign in again.'
    );
  } else {
    jwtSecret = aws.ssmGetParameter(ssmPath, region);
    if (!jwtSecret) {
      console.error(
        `Could not read JWT secret from ${ssmPath}. Check AWS credentials.`
      );
      process.exit(1);
    }
  }

  console.log('Generating new anon and service role keys...');
  const { anonKey, serviceRoleKey } = generateKeys(jwtSecret);

  // Preserve every other field in .boa/config.json.
  config.write({
    ...cfg,
    anonKey,
    serviceRoleKey,
    keysRotatedAt: new Date().toISOString(),
  });

  const days = Math.round(DEFAULT_KEY_EXPIRY_SECONDS / 86400);
  console.log('');
  console.log('Keys rotated.');
  console.log(`  Anon Key:         ${anonKey.slice(0, 20)}...`);
  console.log(`  Service Role Key: ${serviceRoleKey.slice(0, 20)}...`);
  console.log(`  Expires:          ${days} days from now`);
  console.log('');
  console.log('Distribute the new keys to every client that uses them.');
  if (!rotateSecret) {
    console.log(
      'Run again with --rotate-secret to also invalidate existing sessions.'
    );
  }
}
