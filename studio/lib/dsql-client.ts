import { Pool } from 'pg';
import { DsqlSigner } from '@aws-sdk/dsql-signer';
import { fromEnv } from '@aws-sdk/credential-providers';
import { BoaConfig, QueryResult, TableInfo } from '@/types/boa';
import { getDsqlEndpoint, getDbName } from './boa-config';

// Per-endpoint pool cache. Key: endpoint string.
const pools = new Map<string, { pool: Pool; tokenExpiresAt: number }>();

// Tokens are valid for 1 hour; refresh the pool when less than 5 minutes remain.
const TOKEN_REFRESH_BEFORE_MS = 5 * 60 * 1000;

async function getPool(cfg: BoaConfig): Promise<Pool> {
  const endpoint = getDsqlEndpoint(cfg);
  const region = cfg.region || 'us-east-1';
  const dbName = getDbName(cfg);

  const existing = pools.get(endpoint);
  if (existing && existing.tokenExpiresAt > Date.now() + TOKEN_REFRESH_BEFORE_MS) {
    return existing.pool;
  }

  // Close old pool before replacing it
  if (existing) {
    await existing.pool.end().catch(() => {});
    pools.delete(endpoint);
  }

  // In Lambda, AWS_ACCESS_KEY_ID/SECRET/SESSION_TOKEN are always set by the runtime.
  // Use fromEnv() explicitly to avoid the default provider chain doing filesystem/IMDS
  // lookups that may not be bundled or may time out in the Amplify SSR Lambda.
  // Fall back to undefined (SDK default chain) for local dev where env vars aren't set.
  const hasEnvCreds = !!process.env.AWS_ACCESS_KEY_ID;
  console.log('[dsql] hasEnvCreds:', hasEnvCreds, 'region:', region, 'endpoint:', endpoint);

  const signer = new DsqlSigner({
    hostname: endpoint,
    region,
    ...(hasEnvCreds && { credentials: fromEnv() }),
  });

  const token = await signer.getDbConnectAdminAuthToken();
  const tokenExpiresAt = Date.now() + 60 * 60 * 1000; // tokens are valid 1 hour

  const pool = new Pool({
    host: endpoint,
    database: dbName,
    user: 'admin',
    password: token,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
  });

  pools.set(endpoint, { pool, tokenExpiresAt });
  return pool;
}

export async function runQuery(cfg: BoaConfig, sql: string, params?: unknown[]): Promise<QueryResult> {
  const endpoint = getDsqlEndpoint(cfg);
  if (!endpoint) {
    return { rows: [], rowCount: 0, fields: [], error: 'No DSQL endpoint in config' };
  }

  const start = Date.now();
  let pool: Pool;
  try {
    pool = await getPool(cfg);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { rows: [], rowCount: 0, fields: [], error: `Failed to get auth token: ${msg}` };
  }

  try {
    const result = await pool.query(sql, params as unknown[]);
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { rows: [], rowCount: 0, fields: [], error: msg, durationMs: Date.now() - start };
  }
}

export async function getTables(cfg: BoaConfig): Promise<TableInfo[]> {
  const result = await runQuery(cfg, `
    SELECT
      t.schemaname AS schema,
      t.tablename  AS name,
      c.reltuples::bigint AS row_count
    FROM pg_tables t
    LEFT JOIN pg_class c
      ON c.relname = t.tablename
      AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.schemaname)
    WHERE t.schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'sys')
    ORDER BY t.schemaname = 'public' DESC, t.schemaname, t.tablename
  `);

  if (result.error) throw new Error(result.error);
  return result.rows.map(r => ({
    schema: r.schema as string,
    name: r.name as string,
    rowCount: r.row_count as number | null,
  }));
}

export async function getTableData(
  cfg: BoaConfig,
  tableName: string,
  limit = 100,
  offset = 0
): Promise<QueryResult> {
  const sanitized = tableName.replace(/[^a-zA-Z0-9_]/g, '');
  return runQuery(cfg, `SELECT * FROM "${sanitized}" LIMIT $1 OFFSET $2`, [limit, offset]);
}
