'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserPlus, RefreshCw, Trash2, RotateCcw, Ban, CheckCircle } from 'lucide-react';

type StudioUser = {
  username: string;
  email: string;
  status: string;
  enabled: boolean;
  createdAt: string | null;
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  CONFIRMED:            { label: 'Confirmed',        className: 'text-green-400 bg-green-900/20 border-green-700/30' },
  UNCONFIRMED:          { label: 'Unconfirmed',       className: 'text-yellow-400 bg-yellow-900/20 border-yellow-700/30' },
  FORCE_CHANGE_PASSWORD:{ label: 'Must change pw',   className: 'text-blue-400 bg-blue-900/20 border-blue-700/30' },
  RESET_REQUIRED:       { label: 'Reset required',   className: 'text-orange-400 bg-orange-900/20 border-orange-700/30' },
};

export function AdminUsers() {
  const [users, setUsers] = useState<StudioUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers(data.users);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function userAction(username: string, action: 'enable' | 'disable' | 'reset-password') {
    setBusy(b => ({ ...b, [username]: true }));
    try {
      const res = await fetch(`/api/admin/users?username=${encodeURIComponent(username)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(b => ({ ...b, [username]: false }));
    }
  }

  async function deleteUser(username: string, email: string) {
    if (!confirm(`Delete ${email}? This cannot be undone.`)) return;
    setBusy(b => ({ ...b, [username]: true }));
    try {
      const res = await fetch(`/api/admin/users?username=${encodeURIComponent(username)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers(u => u.filter(x => x.username !== username));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(b => ({ ...b, [username]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {loading ? 'Loading…' : `${users.length} ${users.length === 1 ? 'user' : 'users'}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={loadUsers}
            disabled={loading}
            className="p-1.5 text-gray-500 hover:text-white transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-sm bg-white text-black font-medium rounded px-3 py-1.5 hover:bg-gray-100 transition-colors"
          >
            <UserPlus size={14} />
            Add user
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-2.5 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* User table */}
      {!loading && users.length === 0 && !error ? (
        <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg p-8 text-center text-sm text-gray-600">
          No users yet. Add the first user with the button above.
        </div>
      ) : (
        <div className="rounded-lg border border-[#2a2a2f] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2a2f] bg-[#0f1117]">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden sm:table-cell">Added</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => {
                const isBusy = busy[user.username];
                const statusMeta = STATUS_LABELS[user.status] ?? { label: user.status, className: 'text-gray-400 bg-gray-800/40 border-gray-700/30' };
                return (
                  <tr
                    key={user.username}
                    className={`border-b border-[#1a1a1f] last:border-0 ${i % 2 === 0 ? 'bg-[#1c1c21]' : 'bg-[#161619]'} ${isBusy ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-white">{user.email || user.username}</span>
                        {!user.enabled && (
                          <span className="text-[10px] text-gray-600 bg-gray-800/60 border border-gray-700/30 px-1.5 py-0.5 rounded">
                            disabled
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 hidden sm:table-cell">
                      {user.createdAt
                        ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ActionButton
                          icon={<RotateCcw size={13} />}
                          label="Reset password"
                          onClick={() => userAction(user.username, 'reset-password')}
                          disabled={isBusy}
                        />
                        {user.enabled ? (
                          <ActionButton
                            icon={<Ban size={13} />}
                            label="Disable"
                            onClick={() => userAction(user.username, 'disable')}
                            disabled={isBusy}
                          />
                        ) : (
                          <ActionButton
                            icon={<CheckCircle size={13} />}
                            label="Enable"
                            onClick={() => userAction(user.username, 'enable')}
                            disabled={isBusy}
                            className="text-green-500 hover:text-green-400"
                          />
                        )}
                        <ActionButton
                          icon={<Trash2 size={13} />}
                          label="Delete"
                          onClick={() => deleteUser(user.username, user.email || user.username)}
                          disabled={isBusy}
                          className="text-red-500 hover:text-red-400"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadUsers(); }}
        />
      )}
    </div>
  );
}

function ActionButton({
  icon, label, onClick, disabled, className = 'text-gray-500 hover:text-white',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {icon}
    </button>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#1c1c21] border border-[#2a2a2f] rounded-xl w-full max-w-sm mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Add user</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Cognito will send an invitation email with a temporary password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com"
              autoFocus
              required
              className="w-full bg-[#0f1117] border border-[#2a2a2f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gray-500 placeholder:text-gray-600"
            />

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-gray-400 hover:text-white px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !email}
                className="text-sm bg-white text-black font-medium rounded px-4 py-1.5 hover:bg-gray-100 transition-colors disabled:opacity-40"
              >
                {loading ? 'Creating…' : 'Send invitation'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
