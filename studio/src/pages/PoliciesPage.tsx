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
  '*':    'text-[var(--tx-2)] bg-gray-800/40 border-gray-700/30',
};

const PRINCIPAL_COLORS: Record<string, string> = {
  User:        'text-purple-300',
  ServiceRole: 'text-orange-300',
  AnonRole:    'text-[var(--tx-2)]',
  Any:         'text-[var(--tx-3)]',
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

  if (loading) return <div className="text-[var(--tx-3)] text-sm">Loading...</div>;
  if (noConfig) return <NoConfig />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--tx-1)]">Policies</h1>
          <p className="text-sm text-[var(--tx-3)] mt-0.5">
            Cedar authorization policies — row-level access control for your API
          </p>
        </div>
        <Link
          to="/policies/new"
          className="text-sm bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-2)] rounded px-3 py-1.5 hover:bg-[var(--bg-raised)] transition-colors"
        >
          + New policy
        </Link>
      </div>

      {policies.length === 0 ? (
        <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-lg p-8 text-center space-y-2">
          <p className="text-sm text-[var(--tx-2)]">No policy files found in <code className="font-mono text-[var(--tx-2)]">policies/</code></p>
          <p className="text-xs text-[var(--tx-3)]">
            BOA uses Cedar policies for authorization. Create a <code className="font-mono">.cedar</code> file in your project&apos;s <code className="font-mono">policies/</code> directory.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map(policy => (
            <Link
              key={policy.filename}
              to={`/policies/${encodeURIComponent(policy.filename)}`}
              className="block bg-[var(--bg-surface)] border border-[var(--bd)] rounded-lg p-4 hover:border-[var(--orange)] transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-[var(--tx-1)]">{policy.filename}</p>
                  {policy.summary.comments.length > 0 && (
                    <p className="text-xs text-[var(--tx-3)] mt-0.5 truncate">{policy.summary.comments[0]}</p>
                  )}
                </div>
                <span className="text-xs text-[var(--tx-3)] shrink-0">
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
                      <span className={`${PRINCIPAL_COLORS[rule.principal] ?? 'text-[var(--tx-2)]'} w-24 shrink-0`}>
                        {rule.principal}
                      </span>
                      <div className="flex gap-1 flex-wrap">
                        {rule.actions.map(a => (
                          <span key={a} className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${ACTION_COLORS[a] ?? ACTION_COLORS['*']}`}>
                            {a}
                          </span>
                        ))}
                      </div>
                      <span className="text-[var(--tx-3)]">on</span>
                      <span className="text-[var(--tx-2)]">{rule.resource}</span>
                      {rule.condition && (
                        <span className="text-[var(--tx-3)] truncate max-w-[200px]" title={rule.condition}>
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

      <div className="bg-[var(--bg-base)] border border-[var(--bd-subtle)] rounded-lg p-4 text-xs text-[var(--tx-3)] space-y-1.5">
        <p className="text-[var(--tx-2)] font-semibold text-[11px] uppercase tracking-wider mb-2">Cedar quick reference</p>
        <p>Principals: <code className="text-purple-300">PgrestLambda::User</code> · <code className="text-orange-300">PgrestLambda::ServiceRole</code> · <code className="text-[var(--tx-2)]">PgrestLambda::AnonRole</code></p>
        <p>Actions: <code className="text-blue-400">&quot;select&quot;</code> · <code className="text-green-400">&quot;insert&quot;</code> · <code className="text-yellow-400">&quot;update&quot;</code> · <code className="text-red-400">&quot;delete&quot;</code></p>
        <p>Resources: <code className="text-[var(--tx-2)]">PgrestLambda::Table</code> (table-level) · <code className="text-[var(--tx-2)]">PgrestLambda::Row</code> (row-level with <code>when</code>)</p>
        <p>Row conditions: <code className="text-[var(--tx-2)]">resource.user_id == principal</code> · <code className="text-[var(--tx-2)]">resource.is_public == true</code></p>
      </div>
    </div>
  );
}
