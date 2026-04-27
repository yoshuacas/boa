import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as aws from './aws.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_SCHEMA_SQL = join(
  __dirname, '..', 'templates', 'auth', '001_better_auth_dsql.sql'
);

export function bootstrapBetterAuthSchema(dsqlEndpoint, region) {
  const token = aws.dsqlGenerateAuthToken(dsqlEndpoint, region);
  const connstr = `host=${dsqlEndpoint} port=5432 dbname=postgres user=admin sslmode=require`;
  const psqlEnv = { ...process.env, PGPASSWORD: token };

  aws.exec(`psql "${connstr}" -q -v ON_ERROR_STOP=1 -f "${AUTH_SCHEMA_SQL}"`, {
    env: psqlEnv,
  });
}

export function hasBetterAuthSchema(dsqlEndpoint, region) {
  const token = aws.dsqlGenerateAuthToken(dsqlEndpoint, region);
  const connstr = `host=${dsqlEndpoint} port=5432 dbname=postgres user=admin sslmode=require`;
  const psqlEnv = { ...process.env, PGPASSWORD: token };
  const requiredTables = ['user', 'session', 'account', 'verification', 'jwks'];
  const list = requiredTables.map((t) => `'${t}'`).join(',');
  const output = aws.exec(
    `psql "${connstr}" -t -A -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'better_auth' AND table_name IN (${list}) ORDER BY table_name"`,
    { env: psqlEnv }
  );
  const found = new Set(output.split('\n').filter(Boolean));
  return requiredTables.every((table) => found.has(table));
}
