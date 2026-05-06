import { useState, useRef, useCallback, useEffect, Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { editor as MonacoEditorType } from 'monaco-editor';
import { DatabaseTabs } from '@/components/database-tabs';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

const STORAGE_KEY = 'boa-studio:sql-tabs';
const DEFAULT_SQL = "SELECT * FROM pg_tables WHERE schemaname = 'public';";

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number | null;
  fields: { name: string; dataTypeID: number }[];
  error?: string;
  durationMs?: number;
};

type Tab = {
  id: string;
  name: string;
  sql: string;
  result: QueryResult | null;
};

function makeTab(index: number, sql = DEFAULT_SQL): Tab {
  return { id: crypto.randomUUID(), name: `Query ${index}`, sql, result: null };
}

function loadTabs(): { tabs: Tab[]; activeId: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tabs: Tab[]; activeId: string };
    if (!Array.isArray(parsed.tabs) || !parsed.tabs.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveTabs(tabs: Tab[], activeId: string) {
  try {
    const toSave = tabs.map(t => ({ ...t, result: null }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs: toSave, activeId }));
  } catch {
    // localStorage unavailable
  }
}

export default function SqlEditorPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('query');

  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab(1, initialQuery || DEFAULT_SQL)]);
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id);
  const [loading, setLoading] = useState(false);
  const [expandedCell, setExpandedCell] = useState<{ column: string; value: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);

  const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.ok ? r.json() as Promise<{ dsqlEndpoint?: string }> : null)
      .then(d => { if (d?.dsqlEndpoint) setEndpoint(d.dsqlEndpoint); });
  }, []);

  useEffect(() => {
    if (initialQuery) {
      const saved = loadTabs();
      if (saved) {
        const newTab = makeTab(saved.tabs.length + 1, initialQuery);
        setTabs([...saved.tabs, newTab]);
        setActiveId(newTab.id);
      }
    } else {
      const saved = loadTabs();
      if (saved) {
        setTabs(saved.tabs);
        setActiveId(saved.activeId);
      }
    }
    setHydrated(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hydrated) saveTabs(tabs, activeId);
  }, [tabs, activeId, hydrated]);

  const activeTab = tabs.find(t => t.id === activeId) ?? tabs[0];

  const runQuery = useCallback(async () => {
    const targetId = activeIdRef.current;
    const editor = editorRef.current;
    const currentSql = editor?.getValue() ?? '';
    let toRun = currentSql;
    if (editor) {
      const selection = editor.getSelection();
      if (selection && !selection.isEmpty()) {
        toRun = editor.getModel()?.getValueInRange(selection) ?? toRun;
      }
    }

    setLoading(true);
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'query', sql: toRun }),
      });
      const data: QueryResult = await res.json();
      setTabs(prev => prev.map(t => t.id === targetId ? { ...t, result: data } : t));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTabs(prev => prev.map(t => t.id === targetId
        ? { ...t, result: { rows: [], rowCount: 0, fields: [], error: msg } }
        : t
      ));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleEditorMount = useCallback((ed: MonacoEditorType.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
    editorRef.current = ed;
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runQuery());
  }, [runQuery]);

  const switchTab = useCallback((id: string) => {
    if (id === activeId) return;
    const currentSql = editorRef.current?.getValue() ?? activeTab.sql;
    setTabs(prev => prev.map(t => t.id === activeId ? { ...t, sql: currentSql } : t));
    setActiveId(id);
  }, [activeId, activeTab.sql]);

  const addTab = useCallback(() => {
    const currentSql = editorRef.current?.getValue() ?? activeTab.sql;
    const newTab = makeTab(tabs.length + 1);
    setTabs(prev => [...prev.map(t => t.id === activeId ? { ...t, sql: currentSql } : t), newTab]);
    setActiveId(newTab.id);
  }, [activeId, activeTab.sql, tabs.length]);

  const closeTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => {
      if (prev.length === 1) return prev;
      const idx = prev.findIndex(t => t.id === id);
      const next = prev.filter(t => t.id !== id);
      if (id === activeId) {
        const newActive = next[Math.min(idx, next.length - 1)];
        setActiveId(newActive.id);
      }
      return next;
    });
  }, [activeId]);

  const result = activeTab.result;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mb-3 shrink-0">
        <h1 className="text-xl font-semibold text-white">Database</h1>
        {endpoint && <p className="text-xs text-gray-600 font-mono mt-0.5">{endpoint}</p>}
      </div>
      <DatabaseTabs />
      <div className="flex flex-col h-[calc(100vh-13rem)]">
        {/* Tab bar + run button */}
        <div className="flex items-center justify-between mb-0">
          <div className="flex items-end gap-0 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`group flex items-center gap-1.5 px-3 py-2 text-xs border-t border-x rounded-t transition-colors whitespace-nowrap ${
                  tab.id === activeId
                    ? 'bg-[#1c1c21] border-[#2a2a2f] text-white'
                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <span>{tab.name}</span>
                {tabs.length > 1 && (
                  <span
                    onClick={(e) => closeTab(tab.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-gray-300 leading-none transition-opacity"
                  >
                    ×
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={addTab}
              className="px-2.5 py-2 text-gray-600 hover:text-gray-300 text-sm transition-colors"
              title="New tab"
            >
              +
            </button>
          </div>
          <button
            onClick={runQuery}
            disabled={loading}
            className="text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded px-3 py-1.5 transition-colors shrink-0 ml-3"
          >
            {loading ? 'Running...' : 'Run ⌘↵'}
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0 rounded-b-lg rounded-tr-lg overflow-hidden border border-[#2a2a2f]">
          <Suspense fallback={<div className="h-full bg-[#1c1c21] flex items-center justify-center text-gray-600 text-sm">Loading editor...</div>}>
            <MonacoEditor
              height="100%"
              language="sql"
              theme="vs-dark"
              value={activeTab.sql}
              onChange={v => setTabs(prev => prev.map(t => t.id === activeIdRef.current ? { ...t, sql: v ?? '' } : t))}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: 'monospace',
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 12 },
              }}
            />
          </Suspense>
        </div>

        {/* Results */}
        {result && (
          <div className="shrink-0 max-h-64 overflow-auto rounded-lg border border-[#2a2a2f] bg-[#1c1c21] mt-3">
            {result.error ? (
              <div className="p-4 text-sm text-red-400 font-mono">{result.error}</div>
            ) : (
              <>
                <div className="px-4 py-2 border-b border-[#2a2a2f]">
                  <span className="text-xs text-gray-500">
                    {result.rowCount} row{result.rowCount !== 1 ? 's' : ''}
                    {result.durationMs != null && ` · ${result.durationMs}ms`}
                  </span>
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[#2a2a2f]">
                        {result.fields.map(f => (
                          <th key={f.name} className="text-left px-3 py-1.5 text-gray-500 whitespace-nowrap">{f.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? '' : 'bg-[#0f1117]'}>
                          {result.fields.map(f => {
                            const raw = row[f.name];
                            const display = raw == null ? null : String(raw);
                            const truncated = display != null && display.length > 60;
                            return (
                              <td
                                key={f.name}
                                className={`px-3 py-1.5 whitespace-nowrap max-w-48 truncate ${truncated ? 'text-gray-300 cursor-pointer hover:text-white hover:bg-[#2a2a2f]' : 'text-gray-300'}`}
                                onClick={truncated ? () => setExpandedCell({ column: f.name, value: display! }) : undefined}
                                title={truncated ? 'Click to expand' : undefined}
                              >
                                {display == null ? <span className="text-gray-600">NULL</span> : display}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {expandedCell && (
          <CellModal
            column={expandedCell.column}
            value={expandedCell.value}
            onClose={() => setExpandedCell(null)}
          />
        )}
      </div>
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
      <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg w-full max-w-lg mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2f]">
          <span className="text-xs font-mono text-gray-400">{column}</span>
          <div className="flex items-center gap-2">
            {isJson && <span className="text-[10px] text-blue-400 bg-blue-900/20 border border-blue-700/30 px-1.5 py-0.5 rounded">JSON</span>}
            <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-xs text-gray-500 hover:text-white transition-colors">
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors text-lg leading-none">×</button>
          </div>
        </div>
        <pre className="px-4 py-3 text-xs font-mono text-gray-300 whitespace-pre-wrap break-all max-h-96 overflow-auto">{formatted}</pre>
      </div>
    </div>
  );
}
