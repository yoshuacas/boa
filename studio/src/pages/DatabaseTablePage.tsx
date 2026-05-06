import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { NoConfig } from '@/components/no-config';
import { SchemaEditor } from '@/components/schema-editor';
import type { TableSchema } from '@/lib/schema-types';

export default function DatabaseTablePage() {
  const { table } = useParams<{ table: string }>();
  const tableRef = decodeURIComponent(table ?? '');
  const [schemaName, tableName] = tableRef.includes('.')
    ? tableRef.split('.') as [string, string]
    : ['public', tableRef];

  const [schema, setSchema] = useState<TableSchema | null>(null);
  const [noConfig, setNoConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'schema', tableName: tableRef }),
    })
      .then(r => {
        if (r.status === 404) { setNoConfig(true); return null; }
        return r.json() as Promise<TableSchema & { error?: string }>;
      })
      .then(d => {
        if (!d) return;
        if (d.error) setError(d.error);
        else setSchema(d);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [tableRef]);

  if (loading) return <div className="text-[var(--tx-3)] text-sm">Loading...</div>;
  if (noConfig) return <NoConfig />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-[var(--tx-3)]">
          <Link to="/database" className="hover:text-[var(--tx-2)] transition-colors">← Tables</Link>
          <span className="text-gray-700">/</span>
          {schemaName !== 'public' && (
            <>
              <span className="font-mono text-[var(--tx-3)]">{schemaName}</span>
              <span className="text-gray-700">.</span>
            </>
          )}
          <span className="text-[var(--tx-1)] font-mono">{tableName}</span>
        </div>
        <Link
          to={`/database/sql?query=${encodeURIComponent(`SELECT * FROM "${schemaName}"."${tableName}" LIMIT 100;`)}`}
          className="text-sm bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-2)] rounded px-3 py-1.5 hover:bg-[var(--bg-raised)] transition-colors"
        >
          Browse data →
        </Link>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 text-sm text-red-300 font-mono">{error}</div>
      )}

      {schema && <SchemaEditor initialSchema={schema} />}
    </div>
  );
}
