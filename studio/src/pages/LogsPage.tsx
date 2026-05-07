import { useEffect, useState } from 'react';
import { NoConfig } from '@/components/no-config';
import { FunctionViewer } from '@/components/function-viewer';

export default function LogsPage() {
  const [apiFunctionName, setApiFunctionName] = useState<string | null>(null);
  const [noConfig, setNoConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/lambda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stack-functions' }),
    })
      .then(r => {
        if (r.status === 404) { setNoConfig(true); return null; }
        return r.json() as Promise<{ functions?: { physicalId: string; kind: string }[]; error?: string }>;
      })
      .then(d => {
        if (!d) return;
        if (d.error) { setError(d.error); return; }
        const apiFn = d.functions?.find(f => f.kind === 'api');
        if (apiFn) setApiFunctionName(apiFn.physicalId);
        else setError('API function not found in stack.');
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (noConfig) return <NoConfig />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--tx-1)]">Logs</h1>
        {apiFunctionName && (
          <p className="text-sm text-[var(--tx-3)] font-mono mt-0.5">{apiFunctionName}</p>
        )}
      </div>

      {loading && <div className="text-[var(--tx-3)] text-sm">Loading...</div>}

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 text-sm text-red-300 font-mono">{error}</div>
      )}

      {!loading && !error && apiFunctionName && (
        <FunctionViewer functionName={apiFunctionName} initialTab="logs" tabs={['logs']} />
      )}
    </div>
  );
}
