// Client-safe: types, constants, and DDL generators only — no pg dependency.

export type ColumnDef = {
  name: string;
  dataType: string;
  udtName: string;
  isNullable: boolean;
  columnDefault: string | null;
  isPrimaryKey: boolean;
  isUnique: boolean;
  ordinalPosition: number;
};

export type IndexDef = {
  name: string;
  definition: string;
  isAsync: boolean;
};

export type ConstraintDef = {
  name: string;
  type: 'PRIMARY KEY' | 'UNIQUE' | 'CHECK';
  columns: string[];
  checkClause?: string;
};

export type TableSchema = {
  tableName: string;
  columns: ColumnDef[];
  indexes: IndexDef[];
  constraints: ConstraintDef[];
};

// DSQL-compatible types only — no SERIAL, BIGSERIAL, unsupported types
export const DSQL_TYPES = [
  { value: 'text',             label: 'TEXT',             category: 'String' },
  { value: 'character varying',label: 'VARCHAR',          category: 'String' },
  { value: 'integer',          label: 'INTEGER',          category: 'Number' },
  { value: 'bigint',           label: 'BIGINT',           category: 'Number' },
  { value: 'numeric',          label: 'NUMERIC',          category: 'Number' },
  { value: 'real',             label: 'REAL',             category: 'Number' },
  { value: 'double precision', label: 'DOUBLE PRECISION', category: 'Number' },
  { value: 'boolean',          label: 'BOOLEAN',          category: 'Boolean' },
  { value: 'timestamptz',      label: 'TIMESTAMPTZ',      category: 'Date/Time' },
  { value: 'timestamp',        label: 'TIMESTAMP',        category: 'Date/Time' },
  { value: 'date',             label: 'DATE',             category: 'Date/Time' },
  { value: 'jsonb',            label: 'JSONB',            category: 'JSON' },
  { value: 'json',             label: 'JSON',             category: 'JSON' },
  { value: 'uuid',             label: 'UUID',             category: 'Other' },
] as const;

export type DsqlTypeName = (typeof DSQL_TYPES)[number]['value'];

// ── DDL generators (DSQL-safe) ─────────────────────────────────────────────

export function sqlAddColumn(
  table: string, name: string, type: string, nullable: boolean, defaultValue: string | null
): string {
  let sql = `ALTER TABLE "${table}" ADD COLUMN "${name}" ${type.toUpperCase()}`;
  if (!nullable) sql += ' NOT NULL';
  if (defaultValue) sql += ` DEFAULT ${defaultValue}`;
  return sql + ';';
}

export function sqlDropColumn(table: string, name: string): string {
  return `ALTER TABLE "${table}" DROP COLUMN "${name}";`;
}

export function sqlRenameColumn(table: string, from: string, to: string): string {
  return `ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}";`;
}

export function sqlSetNotNull(table: string, column: string, notNull: boolean): string {
  return `ALTER TABLE "${table}" ALTER COLUMN "${column}" ${notNull ? 'SET' : 'DROP'} NOT NULL;`;
}

export function sqlSetDefault(table: string, column: string, value: string | null): string {
  if (!value) return `ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP DEFAULT;`;
  return `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT ${value};`;
}

// DSQL requires ASYNC for all indexes
export function sqlAddIndex(
  table: string, columns: string[], unique: boolean, name?: string
): string {
  const indexName = name || `idx_${table}_${columns.join('_')}`;
  const uniqueKw = unique ? 'UNIQUE ' : '';
  const cols = columns.map(c => `"${c}"`).join(', ');
  return `CREATE ${uniqueKw}INDEX ASYNC IF NOT EXISTS "${indexName}" ON "${table}" (${cols});`;
}

export function sqlDropIndex(indexName: string): string {
  return `DROP INDEX IF EXISTS "${indexName}";`;
}
