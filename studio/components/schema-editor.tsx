'use client';

import { useState } from 'react';
import { Plus, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  TableSchema, ColumnDef, IndexDef,
  DSQL_TYPES,
  sqlAddColumn, sqlDropColumn, sqlRenameColumn,
  sqlSetNotNull, sqlSetDefault,
  sqlAddIndex, sqlDropIndex,
} from '@/lib/schema-types';

// ── Helpers ────────────────────────────────────────────────────────────────

function typeLabel(col: ColumnDef): string {
  // Normalise some pg internal type names to friendlier labels
  const map: Record<string, string> = {
    'character varying': 'VARCHAR',
    'timestamp with time zone': 'TIMESTAMPTZ',
    'timestamp without time zone': 'TIMESTAMP',
    'double precision': 'DOUBLE PRECISION',
  };
  return (map[col.dataType] || col.dataType).toUpperCase();
}

function defaultLabel(d: string | null): string {
  if (!d) return '—';
  if (d.length > 32) return d.slice(0, 32) + '…';
  return d;
}

// ── DDL execution ──────────────────────────────────────────────────────────

async function runDdl(sql: string): Promise<string | null> {
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ddl', sql }),
  });
  const data = await res.json();
  return data.error ?? null;
}

async function reloadSchema(tableName: string): Promise<TableSchema> {
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'schema', tableName }),
  });
  return res.json();
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'blue' | 'green' | 'yellow' }) {
  const styles = {
    default: 'bg-[#2a2a2f] text-gray-400',
    blue:    'bg-blue-900/30 text-blue-400 border border-blue-700/30',
    green:   'bg-green-900/30 text-green-400 border border-green-700/30',
    yellow:  'bg-yellow-900/30 text-yellow-400 border border-yellow-700/30',
  };
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${styles[variant]}`}>
      {children}
    </span>
  );
}

function ErrorBar({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2 bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-sm text-red-300">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span className="flex-1 font-mono text-xs">{message}</span>
      <button onClick={onDismiss} className="text-red-500 hover:text-red-300 text-xs">✕</button>
    </div>
  );
}

// ── Add Column Modal ───────────────────────────────────────────────────────

function AddColumnModal({
  tableName, onClose, onSuccess,
}: {
  tableName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('text');
  const [nullable, setNullable] = useState(true);
  const [defaultValue, setDefaultValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = DSQL_TYPES.reduce<Record<string, typeof DSQL_TYPES[number][]>>((acc, t) => {
    (acc[t.category] = acc[t.category] || []).push(t);
    return acc;
  }, {});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Column name is required');
    setSaving(true);
    setError(null);
    const sql = sqlAddColumn(tableName, name.trim(), type, nullable, defaultValue.trim() || null);
    const err = await runDdl(sql);
    setSaving(false);
    if (err) return setError(err);
    onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
        <h2 className="text-base font-semibold text-white">Add Column</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Column Name</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. email"
              className="w-full bg-[#0f1117] border border-[#2a2a2f] text-white rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#2a2a2f] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
            >
              {Object.entries(grouped).map(([cat, types]) => (
                <optgroup key={cat} label={cat}>
                  {types.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500">Default Value <span className="text-gray-700">(optional — raw SQL expression)</span></label>
            <input
              value={defaultValue}
              onChange={e => setDefaultValue(e.target.value)}
              placeholder="e.g. NOW() or 'active' or gen_random_uuid()::text"
              className="w-full bg-[#0f1117] border border-[#2a2a2f] text-white rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-500"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={nullable}
              onChange={e => setNullable(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-300">Nullable</span>
          </label>

          {error && <ErrorBar message={error} onDismiss={() => setError(null)} />}

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose}
              className="text-sm text-gray-400 hover:text-white px-3 py-1.5 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded px-4 py-1.5 transition-colors">
              {saving ? 'Adding…' : 'Add Column'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add Index Modal ────────────────────────────────────────────────────────

function AddIndexModal({
  tableName, columns, onClose, onSuccess,
}: {
  tableName: string;
  columns: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [unique, setUnique] = useState(false);
  const [indexName, setIndexName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCol(col: string) {
    setSelectedCols(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedCols.length === 0) return setError('Select at least one column');
    setSaving(true);
    setError(null);
    const sql = sqlAddIndex(tableName, selectedCols, unique, indexName.trim() || undefined);
    const err = await runDdl(sql);
    setSaving(false);
    if (err) return setError(err);
    onSuccess();
    onClose();
  }

  const preview = sqlAddIndex(
    tableName,
    selectedCols.length ? selectedCols : ['column'],
    unique,
    indexName.trim() || undefined
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
        <h2 className="text-base font-semibold text-white">Add Index</h2>
        <p className="text-xs text-gray-500">Indexes are created with <code className="text-gray-400">ASYNC</code> as required by DSQL.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Columns <span className="text-gray-700">(select one or more)</span></label>
            <div className="space-y-1 max-h-40 overflow-auto">
              {columns.map(col => (
                <label key={col} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCols.includes(col)}
                    onChange={() => toggleCol(col)}
                  />
                  <span className="text-sm font-mono text-gray-300">{col}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500">Index Name <span className="text-gray-700">(optional — auto-generated if blank)</span></label>
            <input
              value={indexName}
              onChange={e => setIndexName(e.target.value)}
              placeholder={`idx_${tableName}_…`}
              className="w-full bg-[#0f1117] border border-[#2a2a2f] text-white rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-500"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={unique} onChange={e => setUnique(e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-300">Unique index</span>
          </label>

          <div className="bg-[#0f1117] rounded p-3 font-mono text-xs text-gray-400 break-all">
            {preview}
          </div>

          {error && <ErrorBar message={error} onDismiss={() => setError(null)} />}

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose}
              className="text-sm text-gray-400 hover:text-white px-3 py-1.5 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded px-4 py-1.5 transition-colors">
              {saving ? 'Creating…' : 'Create Index'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Column Modal ──────────────────────────────────────────────────────

function EditColumnModal({
  tableName, column, onClose, onSuccess,
}: {
  tableName: string;
  column: ColumnDef;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [newName, setNewName] = useState(column.name);
  const [nullable, setNullable] = useState(column.isNullable);
  const [defaultValue, setDefaultValue] = useState(column.columnDefault ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const statements: string[] = [];

    if (newName.trim() && newName.trim() !== column.name) {
      statements.push(sqlRenameColumn(tableName, column.name, newName.trim()));
    }
    if (nullable !== column.isNullable) {
      statements.push(sqlSetNotNull(tableName, newName.trim() || column.name, !nullable));
    }
    const newDefault = defaultValue.trim() || null;
    if (newDefault !== column.columnDefault) {
      statements.push(sqlSetDefault(tableName, newName.trim() || column.name, newDefault));
    }

    for (const sql of statements) {
      const err = await runDdl(sql);
      if (err) {
        setSaving(false);
        return setError(err);
      }
    }

    setSaving(false);
    onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
        <div>
          <h2 className="text-base font-semibold text-white">Edit Column</h2>
          <p className="text-xs text-gray-500 font-mono mt-0.5">{column.name} · {typeLabel(column)}</p>
        </div>

        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded p-2 text-xs text-yellow-400 flex gap-2">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          Column type changes are not editable here — use the SQL editor for type casts.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Column Name</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              disabled={column.isPrimaryKey}
              className="w-full bg-[#0f1117] border border-[#2a2a2f] text-white rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-500 disabled:opacity-40"
            />
            {column.isPrimaryKey && (
              <p className="text-xs text-gray-600">Primary key columns cannot be renamed.</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500">Default Value <span className="text-gray-700">(raw SQL expression)</span></label>
            <input
              value={defaultValue}
              onChange={e => setDefaultValue(e.target.value)}
              placeholder="e.g. NOW() or 'active'"
              className="w-full bg-[#0f1117] border border-[#2a2a2f] text-white rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-500"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={nullable}
              onChange={e => setNullable(e.target.checked)}
              disabled={column.isPrimaryKey}
              className="rounded"
            />
            <span className={`text-sm ${column.isPrimaryKey ? 'text-gray-600' : 'text-gray-300'}`}>Nullable</span>
          </label>

          {error && <ErrorBar message={error} onDismiss={() => setError(null)} />}

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose}
              className="text-sm text-gray-400 hover:text-white px-3 py-1.5 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded px-4 py-1.5 transition-colors">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main SchemaEditor ──────────────────────────────────────────────────────

export function SchemaEditor({ initialSchema }: { initialSchema: TableSchema }) {
  const [schema, setSchema] = useState<TableSchema>(initialSchema);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only allow editing tables in the public schema
  const schemaName = schema.tableName.includes('.')
    ? schema.tableName.split('.')[0]
    : 'public';
  const isReadOnly = schemaName !== 'public';

  const [modal, setModal] = useState<
    | { type: 'add-column' }
    | { type: 'edit-column'; column: ColumnDef }
    | { type: 'add-index' }
    | null
  >(null);

  async function refresh() {
    setRefreshing(true);
    try {
      const updated = await reloadSchema(schema.tableName);
      setSchema(updated);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDropColumn(col: ColumnDef) {
    if (!confirm(`Drop column "${col.name}"? This cannot be undone.`)) return;
    setError(null);
    const err = await runDdl(sqlDropColumn(schema.tableName, col.name));
    if (err) return setError(err);
    await refresh();
  }

  async function handleDropIndex(idx: IndexDef) {
    if (!confirm(`Drop index "${idx.name}"?`)) return;
    setError(null);
    const err = await runDdl(sqlDropIndex(idx.name));
    if (err) return setError(err);
    await refresh();
  }

  const columnNames = schema.columns.map(c => c.name);

  return (
    <div className="space-y-6">
      {error && <ErrorBar message={error} onDismiss={() => setError(null)} />}

      {isReadOnly && (
        <div className="flex items-center gap-2 bg-[#1c1c21] border border-[#2a2a2f] rounded-lg px-4 py-2.5 text-xs text-gray-500">
          <AlertTriangle size={12} className="shrink-0 text-gray-600" />
          <span>
            <span className="font-mono text-gray-400">{schemaName}</span> is a system schema — viewing only. Edit these tables directly in the SQL editor.
          </span>
        </div>
      )}

      {/* Columns */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest">
            Columns ({schema.columns.length})
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="text-gray-600 hover:text-gray-400 transition-colors"
              title="Refresh schema"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            </button>
            {!isReadOnly && (
              <button
                onClick={() => setModal({ type: 'add-column' })}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-[#1c1c21] border border-[#2a2a2f] rounded px-2 py-1 hover:border-gray-500 transition-colors"
              >
                <Plus size={12} />
                Add Column
              </button>
            )}
          </div>
        </div>

        <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2a2f]">
                {['Column', 'Type', 'Nullable', 'Default', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider first:pl-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schema.columns.map((col, i) => (
                <tr key={col.name} className={i < schema.columns.length - 1 ? 'border-b border-[#2a2a2f]' : ''}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-white text-xs">{col.name}</span>
                      <div className="flex gap-1">
                        {col.isPrimaryKey && <Badge variant="blue">PK</Badge>}
                        {col.isUnique && !col.isPrimaryKey && <Badge variant="green">UQ</Badge>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-300">
                    {typeLabel(col)}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className={col.isNullable ? 'text-gray-500' : 'text-gray-400'}>
                      {col.isNullable ? 'YES' : 'NO'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-600 max-w-[180px] truncate">
                    {defaultLabel(col.columnDefault)}
                  </td>
                  {!isReadOnly && (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setModal({ type: 'edit-column', column: col })}
                          className="text-xs text-gray-600 hover:text-gray-300 transition-colors"
                        >
                          Edit
                        </button>
                        {!col.isPrimaryKey && (
                          <button
                            onClick={() => handleDropColumn(col)}
                            className="text-gray-700 hover:text-red-400 transition-colors"
                            title="Drop column"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Indexes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest">
            Indexes ({schema.indexes.length})
          </p>
          {!isReadOnly && (
            <button
              onClick={() => setModal({ type: 'add-index' })}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-[#1c1c21] border border-[#2a2a2f] rounded px-2 py-1 hover:border-gray-500 transition-colors"
            >
              <Plus size={12} />
              Add Index
            </button>
          )}
        </div>

        {schema.indexes.length === 0 ? (
          <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg p-4 text-sm text-gray-600 text-center">
            No indexes. Add one to speed up queries.
          </div>
        ) : (
          <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2f]">
                  {['Name', 'Definition', ''].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schema.indexes.map((idx, i) => (
                  <tr key={idx.name} className={i < schema.indexes.length - 1 ? 'border-b border-[#2a2a2f]' : ''}>
                    <td className="px-4 py-2.5 font-mono text-xs text-white whitespace-nowrap">{idx.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500 max-w-md truncate">{idx.definition}</td>
                    {!isReadOnly && (
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => handleDropIndex(idx)}
                          className="text-gray-700 hover:text-red-400 transition-colors"
                          title="Drop index"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Constraints */}
      {schema.constraints.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3">
            Constraints ({schema.constraints.length})
          </p>
          <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2f]">
                  {['Name', 'Type', 'Columns / Clause'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schema.constraints.map((c, i) => (
                  <tr key={c.name} className={i < schema.constraints.length - 1 ? 'border-b border-[#2a2a2f]' : ''}>
                    <td className="px-4 py-2.5 font-mono text-xs text-white">{c.name}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={c.type === 'UNIQUE' ? 'green' : 'yellow'}>{c.type}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                      {c.checkClause || c.columns.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'add-column' && (
        <AddColumnModal
          tableName={schema.tableName}
          onClose={() => setModal(null)}
          onSuccess={refresh}
        />
      )}
      {modal?.type === 'edit-column' && (
        <EditColumnModal
          tableName={schema.tableName}
          column={modal.column}
          onClose={() => setModal(null)}
          onSuccess={refresh}
        />
      )}
      {modal?.type === 'add-index' && (
        <AddIndexModal
          tableName={schema.tableName}
          columns={columnNames}
          onClose={() => setModal(null)}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}
