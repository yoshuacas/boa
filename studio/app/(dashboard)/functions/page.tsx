import Link from 'next/link';
import { Zap, Server } from 'lucide-react';
import { loadBoaConfig, getStackName } from '@/lib/boa-config';
import { NoConfig } from '@/components/no-config';
import { getStackFunctions, StackFunction } from '@/lib/stack-functions';

export default async function FunctionsPage() {
  const cfg = await loadBoaConfig();
  if (!cfg) return <NoConfig />;

  const stackName = getStackName(cfg);

  let functions: StackFunction[] = [];
  let error: string | null = null;

  try {
    functions = await getStackFunctions(cfg);
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : String(err);
  }

  const apiFunction = functions.find(f => f.kind === 'api');
  const customFunctions = functions.filter(f => f.kind === 'custom');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Functions</h1>
        <p className="text-sm text-gray-500 mt-0.5">{stackName}</p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 text-sm text-red-300 font-mono">
          {error}
        </div>
      )}

      {!error && (
        <div className="space-y-6">
          {/* Main API function */}
          {apiFunction && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3">
                API Function
              </p>
              <FunctionCard fn={apiFunction} />
            </div>
          )}

          {/* Custom functions */}
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
      href={`/functions/${encodeURIComponent(fn.physicalId)}`}
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
