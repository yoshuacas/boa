import Link from 'next/link';
import { loadBoaConfig, getStackName } from '@/lib/boa-config';
import { getStackFunctions } from '@/lib/stack-functions';
import { FunctionViewer } from '@/components/function-viewer';
import { NoConfig } from '@/components/no-config';

interface Props {
  params: Promise<{ name: string }>;
}

export default async function FunctionDetailPage({ params }: Props) {
  const { name } = await params;
  const physicalId = decodeURIComponent(name);

  const cfg = await loadBoaConfig();
  if (!cfg) return <NoConfig />;

  // Look up this function in the stack to get its metadata
  let label = physicalId;
  let sourceDir: string | undefined;
  let kind: 'api' | 'custom' = 'custom';

  try {
    const functions = await getStackFunctions(cfg);
    const fn = functions.find(f => f.physicalId === physicalId);
    if (fn) {
      label = fn.label;
      sourceDir = fn.sourceDir;
      kind = fn.kind;
    }
  } catch {
    // Non-fatal — still show the viewer
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/functions" className="hover:text-gray-300 transition-colors">
            Functions
          </Link>
          <span>/</span>
          <span className="text-white">{label}</span>
        </div>
        <h1 className="text-xl font-semibold text-white">{label}</h1>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-sm text-gray-500 font-mono">{physicalId}</p>
          {sourceDir && (
            <span className="text-xs text-gray-600 font-mono bg-[#1c1c21] px-1.5 py-0.5 rounded">
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

      <FunctionViewer functionName={physicalId} />
    </div>
  );
}
