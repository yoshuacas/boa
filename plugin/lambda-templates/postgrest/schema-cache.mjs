// schema-cache.mjs — pg_catalog introspection + TTL cache
// Stub: throws "not implemented" until real implementation is added.

export async function getSchema(pool) {
  throw new Error('getSchema not implemented');
}

export async function refresh(pool) {
  throw new Error('refresh not implemented');
}

export function hasTable(schema, table) {
  throw new Error('hasTable not implemented');
}

export function hasColumn(schema, table, column) {
  throw new Error('hasColumn not implemented');
}

export function getPrimaryKey(schema, table) {
  throw new Error('getPrimaryKey not implemented');
}
