// db.mjs — Connection pool (extracted from crud-api.mjs)

import { DsqlSigner } from "@aws-sdk/dsql-signer";
import pg from "pg";

const { Pool } = pg;

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const REGION_NAME = process.env.REGION_NAME;

// Connection pool — initialized outside handler for reuse across invocations
let pool = null;
let tokenRefreshedAt = 0;
const TOKEN_LIFETIME_MS = 10 * 60 * 1000; // 10 minutes

async function generateToken() {
  const signer = new DsqlSigner({
    hostname: DSQL_ENDPOINT,
    region: REGION_NAME,
  });
  return signer.getDbConnectAdminAuthToken();
}

export async function getPool() {
  const now = Date.now();
  if (pool && now - tokenRefreshedAt < TOKEN_LIFETIME_MS) {
    return pool;
  }

  // Close existing pool if token expired
  if (pool) {
    await pool.end().catch(() => {});
  }

  const token = await generateToken();
  tokenRefreshedAt = now;

  pool = new Pool({
    host: DSQL_ENDPOINT,
    port: 5432,
    user: "admin",
    password: token,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 60000,
  });

  return pool;
}
