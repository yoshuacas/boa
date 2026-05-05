import { NextRequest, NextResponse } from 'next/server';
import { loadBoaConfig } from '@/lib/boa-config';
import { runQuery, getTables, getTableData } from '@/lib/dsql-client';
import { getTableSchema } from '@/lib/schema-introspection';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, sql, tableName, limit, offset, configPath } = body;

    const cfg = await loadBoaConfig(configPath);
    if (!cfg) {
      return NextResponse.json({ error: 'No .boa/config.json found' }, { status: 404 });
    }

    if (action === 'query') {
      const result = await runQuery(cfg, sql);
      return NextResponse.json(result);
    }

    if (action === 'tables') {
      const tables = await getTables(cfg);
      return NextResponse.json({ tables });
    }

    if (action === 'table-data') {
      const result = await getTableData(cfg, tableName, limit ?? 100, offset ?? 0);
      return NextResponse.json(result);
    }

    if (action === 'schema') {
      const schema = await getTableSchema(cfg, tableName);
      return NextResponse.json(schema);
    }

    // Execute a DDL statement (add/drop column, add/drop index, etc.)
    // The client sends pre-built DSQL-safe SQL from the DDL generators.
    if (action === 'ddl') {
      const result = await runQuery(cfg, sql);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
