import { DsqlSigner } from "@aws-sdk/dsql-signer";
import pg from "pg";

const { Pool } = pg;

const DSQL_ENDPOINT = process.env.DSQL_ENDPOINT;
const REGION_NAME = process.env.REGION_NAME;

// Connection pool — initialized outside handler for reuse across invocations
let pool = null;
let tokenRefreshedAt = 0;
const TOKEN_LIFETIME_MS = 10 * 60 * 1000; // 10 minutes

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function generateToken() {
  const signer = new DsqlSigner({
    hostname: DSQL_ENDPOINT,
    region: REGION_NAME,
  });
  return signer.getDbConnectAdminAuthToken();
}

async function getPool() {
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

export async function handler(event) {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return respond(200, { message: "OK" });
  }

  const method = event.httpMethod;
  const path = event.resource || event.path;
  const userId =
    event.requestContext?.authorizer?.claims?.sub || "anonymous";

  try {
    const db = await getPool();

    // GET /items — list items for the authenticated user
    if (method === "GET" && path === "/items") {
      const result = await db.query(
        "SELECT * FROM items WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      );
      return respond(200, { items: result.rows });
    }

    // POST /items — create a new item
    if (method === "POST" && path === "/items") {
      const body = JSON.parse(event.body || "{}");
      if (!body.name) {
        return respond(400, { error: "Missing required field: name" });
      }
      const result = await db.query(
        "INSERT INTO items (user_id, name, description) VALUES ($1, $2, $3) RETURNING *",
        [userId, body.name, body.description || null]
      );
      return respond(201, { item: result.rows[0] });
    }

    // PUT /items/{id} — update an item
    if (method === "PUT" && path === "/items/{id}") {
      const id = event.pathParameters?.id;
      if (!id) {
        return respond(400, { error: "Missing item ID" });
      }
      const body = JSON.parse(event.body || "{}");
      if (!body.name) {
        return respond(400, { error: "Missing required field: name" });
      }

      // Ensure the item belongs to the authenticated user
      const existing = await db.query(
        "SELECT id FROM items WHERE id = $1 AND user_id = $2",
        [id, userId]
      );
      if (existing.rows.length === 0) {
        return respond(404, { error: "Item not found" });
      }

      const result = await db.query(
        "UPDATE items SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING *",
        [body.name, body.description || null, id, userId]
      );
      return respond(200, { item: result.rows[0] });
    }

    // DELETE /items/{id} — delete an item
    if (method === "DELETE" && path === "/items/{id}") {
      const id = event.pathParameters?.id;
      if (!id) {
        return respond(400, { error: "Missing item ID" });
      }

      const result = await db.query(
        "DELETE FROM items WHERE id = $1 AND user_id = $2 RETURNING id",
        [id, userId]
      );
      if (result.rows.length === 0) {
        return respond(404, { error: "Item not found" });
      }
      return respond(200, { deleted: id });
    }

    return respond(404, { error: "Route not found" });
  } catch (err) {
    console.error("Handler error:", err);
    return respond(500, { error: "Internal server error" });
  }
}
