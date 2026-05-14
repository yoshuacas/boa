import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { TableIcon, RefreshCw } from 'lucide-react';
import { DatabaseTabs } from '@/components/database-tabs';

type TableInfo = { schema: string; name: string; rowCount: number | null };

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number | null;
  fields: { name: string; dataTypeID: number }[];
  error?: string;
  durationMs?: number;
};

type DataTab = {
  id: string;
  schema: string;
  table: string;
  result: QueryResult | null;
  loading: boolean;
};

export default function DatabasePage() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [selectedSchema, setSelectedSchema] = useState<string>('public');
  const [tabs, setTabs] = useState<DataTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [expandedCell, setExpandedCell] = useState<{ col: string; val: string } | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);

  const schemas = [...new Map(tables.map(t => [t.schema, true])).keys()];
  const schemaTables = tables.filter(t => t.schema === selectedSchema);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.ok ? r.json() as Promise<{ dsqlEndpoint?: string }> : null)
      .then(d => { if (d?.dsqlEndpoint) setEndpoint(d.dsqlEndpoint); });

    fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'tables' }),
    })
      .then(r => r.json() as Promise<{ tables?: TableInfo[] }>)
      .then(d => {
        const fetched = d.tables ?? [];
        setTables(fetched);
        const firstSchema = fetched[0]?.schema ?? 'public';
        setSelectedSchema(firstSchema);
      })
      .finally(() => setLoadingTables(false));
  }, []);

  const fetchTableData = useCallback(async (id: string, schema: string, table: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, loading: true } : t));
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'query', sql: `SELECT * FROM "${schema}"."${table}" LIMIT 100` }),
      });
      const data: QueryResult = await res.json();
      setTabs(prev => prev.map(t => t.id === id ? { ...t, result: data, loading: false } : t));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTabs(prev => prev.map(t => t.id === id
        ? { ...t, result: { rows: [], rowCount: 0, fields: [], error: msg }, loading: false }
        : t
      ));
    }
  }, []);

  const openTable = useCallback((schema: string, table: string) => {
    const existing = tabs.find(t => t.schema === schema && t.table === table);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const id = crypto.randomUUID();
    setTabs(prev => [...prev, { id, schema, table, result: null, loading: true }]);
    setActiveTabId(id);
    fetchTableData(id, schema, table);
  }, [tabs, fetchTableData]);

  const closeTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (id === activeTabId) {
        const idx = prev.findIndex(t => t.id === id);
        setActiveTabId(next.length > 0 ? next[Math.min(idx, next.length - 1)].id : null);
      }
      return next;
    });
  }, [activeTabId]);

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mb-3 shrink-0">
        <h1 className="text-xl font-semibold text-[var(--tx-1)]">Database</h1>
        {endpoint && <p className="text-xs text-[var(--tx-3)] font-mono mt-0.5">{endpoint}</p>}
      </div>
      <DatabaseTabs />
      <div className="flex h-[calc(100vh-13rem)] min-h-0">
        {/* Left: Schema list */}
        <div className="w-40 shrink-0 border-r border-[var(--bd)] flex flex-col overflow-hidden">
          <div className="px-3 py-2 text-[10px] font-semibold text-[var(--tx-3)] uppercase tracking-widest shrink-0">
            Schemas
          </div>
          <div className="flex-1 overflow-y-auto">
            {schemas.map(schema => (
              <button
                key={schema}
                onClick={() => setSelectedSchema(schema)}
                className={`w-full text-left px-3 py-2 text-xs font-mono truncate transition-colors ${
                  schema === selectedSchema
                    ? 'bg-[var(--bg-raised)] text-[var(--tx-1)]'
                    : 'text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-surface)]'
                }`}
              >
                {schema}
              </button>
            ))}
          </div>
        </div>

        {/* Middle: Table list */}
        <div className="w-52 shrink-0 border-r border-[var(--bd)] flex flex-col overflow-hidden">
          <div className="px-3 py-2 text-[10px] font-semibold text-[var(--tx-3)] uppercase tracking-widest shrink-0">
            Tables
            {!loadingTables && (
              <span className="ml-1.5 normal-case tracking-normal font-normal text-gray-700">
                ({schemaTables.length})
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingTables ? (
              <div className="px-3 py-2 text-xs text-[var(--tx-3)]">Loading...</div>
            ) : schemaTables.length === 0 ? (
              <div className="px-3 py-4 text-xs text-gray-700 text-center">No tables</div>
            ) : (
              schemaTables.map(t => {
                const isOpen = tabs.some(tab => tab.schema === t.schema && tab.table === t.name);
                const isActive = activeTab?.schema === t.schema && activeTab?.table === t.name;
                return (
                  <button
                    key={t.name}
                    onClick={() => openTable(t.schema, t.name)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                      isActive
                        ? 'bg-[var(--bg-raised)] text-[var(--tx-1)]'
                        : isOpen
                          ? 'text-blue-400 hover:bg-[var(--bg-surface)]'
                          : 'text-[var(--tx-2)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-surface)]'
                    }`}
                  >
                    <TableIcon size={12} className="shrink-0 text-[var(--tx-3)]" />
                    <span className="font-mono text-xs truncate">{t.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Data viewer */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {tabs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-[var(--tx-3)]">
              <TableIcon size={24} className="text-gray-700" />
              <span>Select a table to browse data</span>
            </div>
          ) : (
            <>
              {/* Tab bar */}
              <div className="flex items-center border-b border-[var(--bd)] overflow-x-auto shrink-0 bg-[var(--bg-base)]">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    className={`group flex items-center gap-1.5 px-4 py-2.5 text-xs border-r border-[var(--bd)] whitespace-nowrap transition-colors ${
                      tab.id === activeTabId
                        ? 'bg-[var(--bg-surface)] text-[var(--tx-1)]'
                        : 'text-[var(--tx-3)] hover:text-[var(--tx-2)] hover:bg-[var(--bg-surface)]'
                    }`}
                  >
                    <TableIcon size={11} className="text-[var(--tx-3)] shrink-0" />
                    <span className="font-mono">{tab.table}</span>
                    {tab.loading && <span className="text-[var(--tx-3)] text-[10px]">…</span>}
                    <span
                      onClick={(e) => closeTab(tab.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-[var(--tx-3)] hover:text-[var(--tx-2)] transition-opacity leading-none ml-0.5"
                    >
                      ×
                    </span>
                  </button>
                ))}
              </div>

              {/* Active tab content */}
              {activeTab && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--bd)] shrink-0">
                    <span className="text-xs font-mono text-[var(--tx-3)]">
                      {activeTab.schema}.{activeTab.table}
                      <span className="text-gray-700 ml-2">· LIMIT 100</span>
                    </span>
                    <div className="flex items-center gap-3">
                      {activeTab.schema === 'public' && (
                        <Link
                          to={`/database/${encodeURIComponent(`${activeTab.schema}.${activeTab.table}`)}`}
                          className="text-xs text-[var(--tx-3)] hover:text-[var(--tx-1)] transition-colors"
                        >
                          Edit schema →
                        </Link>
                      )}
                      <button
                        onClick={() => fetchTableData(activeTab.id, activeTab.schema, activeTab.table)}
                        disabled={activeTab.loading}
                        className="text-[var(--tx-3)] hover:text-[var(--tx-1)] transition-colors disabled:opacity-40"
                        title="Refresh"
                      >
                        <RefreshCw size={12} className={activeTab.loading ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-auto">
                    {activeTab.loading ? (
                      <div className="p-6 text-xs text-[var(--tx-3)]">Loading...</div>
                    ) : activeTab.result?.error ? (
                      <div className="p-4 text-xs text-red-400 font-mono">{activeTab.result.error}</div>
                    ) : activeTab.result && activeTab.result.fields.length > 0 ? (
                      <table className="w-full text-xs font-mono border-collapse">
                        <thead>
                          <tr className="sticky top-0 bg-[var(--bg-base)] z-10">
                            {activeTab.result.fields.map(f => (
                              <th key={f.name} className="text-left px-3 py-2 text-[var(--tx-3)] border-b border-[var(--bd)] whitespace-nowrap font-medium">
                                {f.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {activeTab.result.rows.map((row, i) => (
                            <tr key={i} className={`border-b border-[var(--bd-subtle)] hover:bg-[var(--bg-surface)] transition-colors ${i % 2 !== 0 ? 'bg-[var(--bg-base)]' : ''}`}>
                              {activeTab.result!.fields.map(f => {
                                const raw = row[f.name];
                                const display = raw == null ? null : String(raw);
                                const truncated = display != null && display.length > 60;
                                return (
                                  <td
                                    key={f.name}
                                    className={`px-3 py-1.5 whitespace-nowrap max-w-xs truncate ${truncated ? 'text-[var(--tx-2)] cursor-pointer hover:text-[var(--tx-1)] hover:bg-[var(--bg-raised)]' : 'text-[var(--tx-2)]'}`}
                                    onClick={truncated ? () => setExpandedCell({ col: f.name, val: display! }) : undefined}
                                    title={truncated ? 'Click to expand' : undefined}
                                  >
                                    {display == null ? <span className="text-gray-700 italic">null</span> : display}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : activeTab.result ? (
                      <div className="p-6 text-xs text-[var(--tx-3)] text-center">No rows</div>
                    ) : null}
                  </div>

                  {activeTab.result && !activeTab.result.error && (
                    <div className="shrink-0 px-4 py-1.5 border-t border-[var(--bd)] text-xs text-[var(--tx-3)]">
                      {(activeTab.result.rowCount ?? activeTab.result.rows.length).toLocaleString()} row
                      {(activeTab.result.rowCount ?? activeTab.result.rows.length) !== 1 ? 's' : ''}
                      {activeTab.result.durationMs != null && ` · ${activeTab.result.durationMs}ms`}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {expandedCell && (
        <CellModal column={expandedCell.col} value={expandedCell.val} onClose={() => setExpandedCell(null)} />
      )}
    </div>
  );
}

function CellModal({ column, value, onClose }: { column: string; value: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  let formatted = value;
  let isJson = false;
  try { const p = JSON.parse(value); formatted = JSON.stringify(p, null, 2); isJson = true; } catch { /* not JSON */ }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-lg w-full max-w-lg mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--bd)]">
          <span className="text-xs font-mono text-[var(--tx-2)]">{column}</span>
          <div className="flex items-center gap-2">
            {isJson && <span className="text-[10px] text-blue-400 bg-blue-900/20 border border-blue-700/30 px-1.5 py-0.5 rounded">JSON</span>}
            <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-xs text-[var(--tx-3)] hover:text-[var(--tx-1)] transition-colors">
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button onClick={onClose} className="text-[var(--tx-3)] hover:text-[var(--tx-1)] transition-colors text-lg leading-none">×</button>
          </div>
        </div>
        <pre className="px-4 py-3 text-xs font-mono text-[var(--tx-2)] whitespace-pre-wrap break-all max-h-96 overflow-auto">{formatted}</pre>
      </div>
    </div>
  );
}
