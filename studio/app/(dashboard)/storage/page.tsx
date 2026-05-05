import { loadBoaConfig, getBucketName } from '@/lib/boa-config';
import { NoConfig } from '@/components/no-config';
import { FileBrowser } from '@/components/file-browser';

export default async function StoragePage() {
  const cfg = await loadBoaConfig();
  if (!cfg) return <NoConfig />;

  const bucket = getBucketName(cfg);

  if (!bucket) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-white">Storage</h1>
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-4 text-sm text-yellow-300">
          No S3 bucket found in <code className="font-mono">.boa/config.json</code>.
          Make sure your stack has been deployed with storage enabled.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Storage</h1>
        <p className="text-sm text-gray-500 font-mono mt-0.5">{bucket}</p>
      </div>
      <FileBrowser bucket={bucket} />
    </div>
  );
}
