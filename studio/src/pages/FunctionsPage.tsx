import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Server } from 'lucide-react';
import { NoConfig } from '@/components/no-config';

interface StackFunction {
  logicalId: string;
  physicalId: string;
  label: string;
  kind: 'api' | 'custom';
  sourceDir?: string;
}

export default function FunctionsPage() {
  const [stackName, setStackName] = useState('');
  const [functions, setFunctions] = useState<StackFunction[]>([]);
  const [noConfig, setNoConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/config')
      .then(r => {
        if (r.status === 404) { setNoConfig(true); return null; }
        return r.json() as Promise<{ stackName?: string }>;
      })
      .then(d => { if (d?.stackName) setStackName(d.stackName); });

    fetch('/api/lambda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stack-functions' }),
    })
      .then(r => r.json() as Promise<{ functions?: StackFunction[]; error?: string }>)
      .then(d => {
        if (d.error) setError(d.error);
        else setFunctions(d.functions ?? []);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (noConfig) return <NoConfig />;

  const apiFunction = functions.find(f => f.kind === 'api');
  const customFunctions = functions.filter(f => f.kind === 'custom');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Functions</h1>
        {stackName && <p className="text-sm text-gray-500 mt-0.5">{stackName}</p>}
      </div>

      {loading && <div className="text-gray-600 text-sm">Loading...</div>}

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 text-sm text-red-300 font-mono">{error}</div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          {apiFunction && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3">API Function</p>
              <FunctionCard fn={apiFunction} />
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3">
              Custom Functions ({customFunctions.length})
            </p>
            {customFunctions.length === 0 ? (
              <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg p-6 text-sm text-gray-500">
                No custom functions yet. Add a directory under <code className="font-mono text-gray-400">functions/</code> and run <code className="font-mono text-gray-400">boa deploy</code>.
              </div>
            ) : (
              <div className="space-y-2">
                {customFunctions.map(fn => <FunctionCard key={fn.logicalId} fn={fn} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FunctionCard({ fn }: { fn: StackFunction }) {
  const Icon = fn.kind === 'api' ? Server : Zap;
  return (
    <Link
      to={`/functions/${encodeURIComponent(fn.physicalId)}`}
      className="flex items-center justify-between bg-[#1c1c21] border border-[#2a2a2f] rounded-lg px-4 py-3 hover:border-gray-500 transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Icon size={15} className={fn.kind === 'api' ? 'text-blue-400 shrink-0' : 'text-yellow-400 shrink-0'} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-white">{fn.label}</div>
          <div className="text-xs text-gray-600 font-mono truncate">{fn.physicalId}</div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {fn.sourceDir && (
          <span className="text-xs text-gray-600 font-mono hidden sm:block">{fn.sourceDir}/</span>
        )}
        <span className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors">View →</span>
      </div>
    </Link>
  );
}
