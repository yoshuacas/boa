import Link from 'next/link';
import { loadBoaConfig } from '@/lib/boa-config';
import { getTableSchema } from '@/lib/schema-introspection';
import { NoConfig } from '@/components/no-config';
import { SchemaEditor } from '@/components/schema-editor';

interface Props {
  params: Promise<{ table: string }>;
}

export default async function TablePage({ params }: Props) {
  const { table } = await params;
  const tableRef = decodeURIComponent(table);
  // tableRef is either "tablename" or "schema.tablename"
  const [schemaName, tableName] = tableRef.includes('.')
    ? tableRef.split('.') as [string, string]
    : ['public', tableRef];

  const cfg = await loadBoaConfig();
  if (!cfg) return <NoConfig />;

  let schema: Awaited<ReturnType<typeof getTableSchema>> | null = null;
  let error: string | null = null;

  try {
    schema = await getTableSchema(cfg, tableRef);
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/database" className="hover:text-gray-300 transition-colors">
            ← Tables
          </Link>
          <span className="text-gray-700">/</span>
          {schemaName !== 'public' && (
            <>
              <span className="font-mono text-gray-500">{schemaName}</span>
              <span className="text-gray-700">.</span>
            </>
          )}
          <span className="text-white font-mono">{tableName}</span>
        </div>
        <Link
          href={`/database/sql?query=${encodeURIComponent(`SELECT * FROM "${schemaName}"."${tableName}" LIMIT 100;`)}`}
          className="text-sm bg-[#1c1c21] border border-[#2a2a2f] text-gray-300 rounded px-3 py-1.5 hover:bg-[#2a2a2f] transition-colors"
        >
          Browse data →
        </Link>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 text-sm text-red-300 font-mono">
          {error}
        </div>
      )}

      {schema && <SchemaEditor initialSchema={schema} />}
    </div>
  );
}
