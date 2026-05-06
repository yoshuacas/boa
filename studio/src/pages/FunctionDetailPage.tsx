import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { NoConfig } from '@/components/no-config';
import { FunctionViewer } from '@/components/function-viewer';

interface StackFunction {
  logicalId: string;
  physicalId: string;
  label: string;
  kind: 'api' | 'custom';
  sourceDir?: string;
}

export default function FunctionDetailPage() {
  const { name } = useParams<{ name: string }>();
  const physicalId = decodeURIComponent(name ?? '');

  const [fnMeta, setFnMeta] = useState<StackFunction | null>(null);
  const [noConfig, setNoConfig] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/lambda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stack-functions' }),
    })
      .then(r => {
        if (r.status === 404) { setNoConfig(true); return null; }
        return r.json() as Promise<{ functions?: StackFunction[] }>;
      })
      .then(d => {
        if (!d) return;
        const fn = d.functions?.find(f => f.physicalId === physicalId);
        if (fn) setFnMeta(fn);
      })
      .finally(() => setLoading(false));
  }, [physicalId]);

  if (noConfig) return <NoConfig />;

  const label = fnMeta?.label ?? physicalId;
  const sourceDir = fnMeta?.sourceDir;
  const kind = fnMeta?.kind ?? 'custom';

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="text-[var(--tx-3)] text-sm">Loading...</div>
      ) : (
        <div>
          <div className="flex items-center gap-2 text-sm text-[var(--tx-3)] mb-1">
            <Link to="/functions" className="hover:text-[var(--tx-2)] transition-colors">Functions</Link>
            <span>/</span>
            <span className="text-[var(--tx-1)]">{label}</span>
          </div>
          <h1 className="text-xl font-semibold text-[var(--tx-1)]">{label}</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-sm text-[var(--tx-3)] font-mono">{physicalId}</p>
            {sourceDir && (
              <span className="text-xs text-[var(--tx-3)] font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded">
                {sourceDir}/
              </span>
            )}
            {kind === 'api' && (
              <span className="text-xs text-blue-400 bg-blue-900/20 border border-blue-700/30 px-1.5 py-0.5 rounded">
                pgrest-lambda
              </span>
            )}
          </div>
        </div>
      )}

      <FunctionViewer functionName={physicalId} />
    </div>
  );
}
