// Server-only: introspection queries using pg (not safe for client import).
// Types and DDL generators live in schema-types.ts (client-safe).
import { BoaConfig } from '@/types/boa';
import { runQuery } from './dsql-client';
export type {
  ColumnDef, IndexDef, ConstraintDef, TableSchema,
  DsqlTypeName,
} from './schema-types';
export {
  DSQL_TYPES,
  sqlAddColumn, sqlDropColumn, sqlRenameColumn,
  sqlSetNotNull, sqlSetDefault, sqlAddIndex, sqlDropIndex,
} from './schema-types';
import type { TableSchema, ColumnDef, IndexDef, ConstraintDef } from './schema-types';

// Accepts either "tablename" (defaults to public schema) or "schema.tablename"
export async function getTableSchema(cfg: BoaConfig, tableRef: string): Promise<TableSchema> {
  let schemaName: string;
  let tableName: string;

  if (tableRef.includes('.')) {
    const dot = tableRef.indexOf('.');
    schemaName = tableRef.slice(0, dot).replace(/[^a-zA-Z0-9_]/g, '');
    tableName  = tableRef.slice(dot + 1).replace(/[^a-zA-Z0-9_]/g, '');
  } else {
    schemaName = 'public';
    tableName  = tableRef.replace(/[^a-zA-Z0-9_]/g, '');
  }

  const [columnsResult, indexesResult, constraintsResult, pkResult] = await Promise.all([
    runQuery(cfg, `
      SELECT
        column_name        AS name,
        data_type          AS data_type,
        udt_name           AS udt_name,
        is_nullable        AS is_nullable,
        column_default     AS column_default,
        ordinal_position   AS ordinal_position
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `, [schemaName, tableName]),

    runQuery(cfg, `
      SELECT indexname AS name, indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = $1 AND tablename = $2
      ORDER BY indexname
    `, [schemaName, tableName]),

    runQuery(cfg, `
      SELECT
        tc.constraint_name   AS name,
        tc.constraint_type   AS type,
        kcu.column_name      AS column_name,
        cc.check_clause      AS check_clause
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema   = kcu.table_schema
        AND tc.table_name     = kcu.table_name
      LEFT JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name
        AND tc.constraint_schema = cc.constraint_schema
      WHERE tc.table_schema = $1
        AND tc.table_name   = $2
        AND tc.constraint_type IN ('UNIQUE', 'CHECK')
      ORDER BY tc.constraint_type, tc.constraint_name, kcu.ordinal_position
    `, [schemaName, tableName]),

    runQuery(cfg, `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema   = kcu.table_schema
        AND tc.table_name     = kcu.table_name
      WHERE tc.table_schema   = $1
        AND tc.table_name     = $2
        AND tc.constraint_type = 'PRIMARY KEY'
    `, [schemaName, tableName]),
  ]);

  const pkColumns = new Set((pkResult.rows || []).map(r => r.column_name as string));

  const uniqueColumns = new Set<string>();
  for (const row of constraintsResult.rows || []) {
    if (row.type === 'UNIQUE' && row.column_name) {
      uniqueColumns.add(row.column_name as string);
    }
  }

  const columns: ColumnDef[] = (columnsResult.rows || []).map(r => ({
    name: r.name as string,
    dataType: r.data_type as string,
    udtName: r.udt_name as string,
    isNullable: (r.is_nullable as string) === 'YES',
    columnDefault: r.column_default as string | null,
    isPrimaryKey: pkColumns.has(r.name as string),
    isUnique: uniqueColumns.has(r.name as string),
    ordinalPosition: r.ordinal_position as number,
  }));

  const indexes: IndexDef[] = (indexesResult.rows || []).map(r => ({
    name: r.name as string,
    definition: r.definition as string,
    isAsync: (r.definition as string).includes('ASYNC'),
  }));

  const constraintMap = new Map<string, ConstraintDef>();
  for (const row of constraintsResult.rows || []) {
    const name = row.name as string;
    if (!constraintMap.has(name)) {
      constraintMap.set(name, {
        name,
        type: row.type as ConstraintDef['type'],
        columns: [],
        checkClause: row.check_clause as string | undefined,
      });
    }
    if (row.column_name) {
      constraintMap.get(name)!.columns.push(row.column_name as string);
    }
  }

  return {
    tableName: `${schemaName}.${tableName}`,
    columns,
    indexes,
    constraints: Array.from(constraintMap.values()),
  };
}

