import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { NoConfig } from '@/components/no-config';
import type { PolicySummary } from '@/lib/cedar-policies-client';

interface Policy {
  filename: string;
  content: string;
  summary: { comments: string[]; rules: PolicySummary['rules'] };
}

const ACTION_COLORS: Record<string, string> = {
  select: 'text-blue-400 bg-blue-900/20 border-blue-700/30',
  insert: 'text-green-400 bg-green-900/20 border-green-700/30',
  update: 'text-yellow-400 bg-yellow-900/20 border-yellow-700/30',
  delete: 'text-red-400 bg-red-900/20 border-red-700/30',
  '*':    'text-gray-400 bg-gray-800/40 border-gray-700/30',
};

const PRINCIPAL_COLORS: Record<string, string> = {
  User:        'text-purple-300',
  ServiceRole: 'text-orange-300',
  AnonRole:    'text-gray-400',
  Any:         'text-gray-500',
};

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [noConfig, setNoConfig] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/policies')
      .then(r => {
        if (r.status === 404) { setNoConfig(true); return null; }
        return r.json() as Promise<{ policies?: Policy[] }>;
      })
      .then(d => { if (d?.policies) setPolicies(d.policies); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-600 text-sm">Loading...</div>;
  if (noConfig) return <NoConfig />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Policies</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cedar authorization policies — row-level access control for your API
          </p>
        </div>
        <Link
          to="/policies/new"
          className="text-sm bg-[#1c1c21] border border-[#2a2a2f] text-gray-300 rounded px-3 py-1.5 hover:bg-[#2a2a2f] transition-colors"
        >
          + New policy
        </Link>
      </div>

      {policies.length === 0 ? (
        <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg p-8 text-center space-y-2">
          <p className="text-sm text-gray-400">No policy files found in <code className="font-mono text-gray-300">policies/</code></p>
          <p className="text-xs text-gray-600">
            BOA uses Cedar policies for authorization. Create a <code className="font-mono">.cedar</code> file in your project&apos;s <code className="font-mono">policies/</code> directory.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map(policy => (
            <Link
              key={policy.filename}
              to={`/policies/${encodeURIComponent(policy.filename)}`}
              className="block bg-[#1c1c21] border border-[#2a2a2f] rounded-lg p-4 hover:border-[#3a3a3f] transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-white">{policy.filename}</p>
                  {policy.summary.comments.length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{policy.summary.comments[0]}</p>
                  )}
                </div>
                <span className="text-xs text-gray-600 shrink-0">
                  {policy.summary.rules.length} {policy.summary.rules.length === 1 ? 'rule' : 'rules'}
                </span>
              </div>

              {policy.summary.rules.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {policy.summary.rules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={rule.effect === 'permit'
                        ? 'text-green-500 font-semibold w-12 shrink-0'
                        : 'text-red-500 font-semibold w-12 shrink-0'
                      }>
                        {rule.effect}
                      </span>
                      <span className={`${PRINCIPAL_COLORS[rule.principal] ?? 'text-gray-400'} w-24 shrink-0`}>
                        {rule.principal}
                      </span>
                      <div className="flex gap-1 flex-wrap">
                        {rule.actions.map(a => (
                          <span key={a} className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${ACTION_COLORS[a] ?? ACTION_COLORS['*']}`}>
                            {a}
                          </span>
                        ))}
                      </div>
                      <span className="text-gray-600">on</span>
                      <span className="text-gray-400">{rule.resource}</span>
                      {rule.condition && (
                        <span className="text-gray-600 truncate max-w-[200px]" title={rule.condition}>
                          when {'{' + (rule.condition.length > 40 ? rule.condition.slice(0, 40) + '…' : rule.condition) + '}'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      <div className="bg-[#0f1117] border border-[#1c1c21] rounded-lg p-4 text-xs text-gray-500 space-y-1.5">
        <p className="text-gray-400 font-semibold text-[11px] uppercase tracking-wider mb-2">Cedar quick reference</p>
        <p>Principals: <code className="text-purple-300">PgrestLambda::User</code> · <code className="text-orange-300">PgrestLambda::ServiceRole</code> · <code className="text-gray-400">PgrestLambda::AnonRole</code></p>
        <p>Actions: <code className="text-blue-400">&quot;select&quot;</code> · <code className="text-green-400">&quot;insert&quot;</code> · <code className="text-yellow-400">&quot;update&quot;</code> · <code className="text-red-400">&quot;delete&quot;</code></p>
        <p>Resources: <code className="text-gray-300">PgrestLambda::Table</code> (table-level) · <code className="text-gray-300">PgrestLambda::Row</code> (row-level with <code>when</code>)</p>
        <p>Row conditions: <code className="text-gray-300">resource.user_id == principal</code> · <code className="text-gray-300">resource.is_public == true</code></p>
      </div>
    </div>
  );
}
