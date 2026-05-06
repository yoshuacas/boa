import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { NoConfig } from '@/components/no-config';

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  createdAt: string;
};

interface AuthData {
  endpoint: string;
  users: AuthUser[];
  userCount: number;
  activeSessions: number;
  hasSchema: boolean;
}

function formatDate(val: string | null) {
  if (!val) return '—';
  return new Date(val).toLocaleString();
}

export default function AuthPage() {
  const [data, setData] = useState<AuthData | null>(null);
  const [noConfig, setNoConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth-data')
      .then(r => {
        if (r.status === 404) { setNoConfig(true); return null; }
        return r.json() as Promise<AuthData & { error?: string }>;
      })
      .then(d => {
        if (!d) return;
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-[var(--tx-3)] text-sm">Loading...</div>;
  if (noConfig) return <NoConfig />;

  if (data && !data.endpoint) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-[var(--tx-1)]">Auth</h1>
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-4 text-sm text-yellow-300">
          No DSQL endpoint found in config. Auth data lives in the database.
        </div>
      </div>
    );
  }

  if (data && !data.hasSchema) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-[var(--tx-1)]">Auth</h1>
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-4 text-sm text-yellow-300">
          No <code className="font-mono">better_auth.user</code> table found. Run{' '}
          <code className="font-mono">boa migrate</code> to apply the better-auth schema.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--tx-1)]">Auth</h1>
          {data && <p className="text-sm text-[var(--tx-3)] mt-0.5">better-auth · {data.endpoint}</p>}
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Total users', value: data.userCount },
            { label: 'Active sessions', value: data.activeSessions },
          ].map(stat => (
            <div key={stat.label} className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-lg p-4">
              <div className="text-2xl font-semibold text-[var(--tx-1)]">{stat.value}</div>
              <div className="text-xs text-[var(--tx-3)] mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 text-sm text-red-300 font-mono">{error}</div>
      )}

      {data && !error && (
        <div>
          <p className="text-xs font-semibold text-[var(--tx-3)] uppercase tracking-widest mb-3">
            Users ({data.users.length})
          </p>
          {data.users.length === 0 ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-lg p-8 text-center text-sm text-[var(--tx-3)]">
              No users yet. Sign up via your app to see them here.
            </div>
          ) : (
            <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--bd)]">
                    {['Email', 'Name', 'Verified', 'Created'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--tx-3)] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u, i) => (
                    <tr key={u.id} className={i < data.users.length - 1 ? 'border-b border-[var(--bd)]' : ''}>
                      <td className="px-4 py-2.5 text-[var(--tx-1)] font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-2.5 text-[var(--tx-2)]">{u.name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block w-2 h-2 rounded-full ${u.emailVerified ? 'bg-green-500' : 'bg-gray-600'}`} />
                      </td>
                      <td className="px-4 py-2.5 text-[var(--tx-3)] text-xs">{formatDate(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-[var(--tx-3)]">
        <Link
          to={`/database/sql?query=${encodeURIComponent('SELECT * FROM better_auth.user ORDER BY "createdAt" DESC LIMIT 100;')}`}
          className="hover:text-[var(--tx-2)] transition-colors"
        >
          View in SQL editor →
        </Link>
      </p>
    </div>
  );
}
