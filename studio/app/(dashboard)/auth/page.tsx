import Link from 'next/link';
import { loadBoaConfig, getDsqlEndpoint } from '@/lib/boa-config';
import { NoConfig } from '@/components/no-config';
import { getUsers, getUserCount, getActiveSessions, checkBetterAuthSchema } from '@/lib/auth-tables';

function formatDate(val: string | null) {
  if (!val) return '—';
  return new Date(val).toLocaleString();
}

export default async function AuthPage() {
  const cfg = await loadBoaConfig();
  if (!cfg) return <NoConfig />;

  const endpoint = getDsqlEndpoint(cfg);
  if (!endpoint) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-white">Auth</h1>
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-4 text-sm text-yellow-300">
          No DSQL endpoint found in config. Auth data lives in the database.
        </div>
      </div>
    );
  }

  const hasSchema = await checkBetterAuthSchema(cfg);

  if (!hasSchema) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-white">Auth</h1>
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-4 text-sm text-yellow-300">
          No <code className="font-mono">better_auth.user</code> table found. Run{' '}
          <code className="font-mono">boa migrate</code> to apply the better-auth schema.
        </div>
      </div>
    );
  }

  let users: Awaited<ReturnType<typeof getUsers>> = [];
  let userCount = 0;
  let activeSessions = 0;
  let error: string | null = null;

  try {
    [users, userCount, activeSessions] = await Promise.all([
      getUsers(cfg),
      getUserCount(cfg),
      getActiveSessions(cfg),
    ]);
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Auth</h1>
          <p className="text-sm text-gray-500 mt-0.5">better-auth · {endpoint}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total users', value: userCount },
          { label: 'Active sessions', value: activeSessions },
        ].map(stat => (
          <div key={stat.label} className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg p-4">
            <div className="text-2xl font-semibold text-white">{stat.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 text-sm text-red-300 font-mono">
          {error}
        </div>
      )}

      {/* Users table */}
      {!error && (
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3">
            Users ({users.length})
          </p>
          {users.length === 0 ? (
            <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg p-8 text-center text-sm text-gray-500">
              No users yet. Sign up via your app to see them here.
            </div>
          ) : (
            <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a2f]">
                    {['Email', 'Name', 'Verified', 'Created'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} className={i < users.length - 1 ? 'border-b border-[#2a2a2f]' : ''}>
                      <td className="px-4 py-2.5 text-white font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-2.5 text-gray-400">{u.name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block w-2 h-2 rounded-full ${u.emailVerified ? 'bg-green-500' : 'bg-gray-600'}`} />
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{formatDate(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Raw query link */}
      <p className="text-xs text-gray-600">
        <Link href={`/database/sql?query=${encodeURIComponent('SELECT * FROM better_auth.user ORDER BY "createdAt" DESC LIMIT 100;')}`}
          className="hover:text-gray-400 transition-colors">
          View in SQL editor →
        </Link>
      </p>
    </div>
  );
}
