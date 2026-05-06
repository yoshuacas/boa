import { useEffect, useState } from 'react';
import { NoConfig } from '@/components/no-config';
import { FileBrowser } from '@/components/file-browser';

export default function StoragePage() {
  const [bucket, setBucket] = useState<string | null>(null);
  const [noConfig, setNoConfig] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/config')
      .then(r => {
        if (r.status === 404) { setNoConfig(true); return null; }
        return r.json() as Promise<{ bucket?: string }>;
      })
      .then(d => { if (d) setBucket(d.bucket ?? null); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-[var(--tx-3)] text-sm">Loading...</div>;
  if (noConfig) return <NoConfig />;

  if (!bucket) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-[var(--tx-1)]">Storage</h1>
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
        <h1 className="text-xl font-semibold text-[var(--tx-1)]">Storage</h1>
        <p className="text-sm text-[var(--tx-3)] font-mono mt-0.5">{bucket}</p>
      </div>
      <FileBrowser bucket={bucket} />
    </div>
  );
}
