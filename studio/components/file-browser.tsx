'use client';

import { useState, useEffect, useCallback } from 'react';
import { Folder, File, Download, Trash2, ChevronRight, RefreshCw } from 'lucide-react';

type S3File = {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
};

type ListResult = {
  folders: string[];
  files: S3File[];
  isTruncated: boolean;
  error?: string;
};

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(val: string) {
  return new Date(val).toLocaleString();
}

function fileName(key: string) {
  return key.split('/').filter(Boolean).pop() || key;
}

export function FileBrowser({ bucket }: { bucket: string }) {
  const [prefix, setPrefix] = useState('');
  const [result, setResult] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/s3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', prefix: p }),
      });
      setResult(await res.json());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ folders: [], files: [], isTruncated: false, error: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(prefix); }, [prefix, load]);

  async function handlePresign(key: string) {
    setCopying(key);
    try {
      const res = await fetch('/api/s3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'presign', key }),
      });
      const { url } = await res.json();
      await navigator.clipboard.writeText(url);
    } finally {
      setTimeout(() => setCopying(null), 1500);
    }
  }

  async function handleDelete(key: string) {
    if (!confirm(`Delete ${key}?`)) return;
    setDeleting(key);
    try {
      await fetch('/api/s3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', key }),
      });
      await load(prefix);
    } finally {
      setDeleting(null);
    }
  }

  // Breadcrumb parts
  const parts = prefix.split('/').filter(Boolean);
  const breadcrumbs = [
    { label: bucket, prefix: '' },
    ...parts.map((p, i) => ({ label: p, prefix: parts.slice(0, i + 1).join('/') + '/' })),
  ];

  return (
    <div className="space-y-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((b, i) => (
          <span key={b.prefix} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="text-gray-600" />}
            <button
              onClick={() => setPrefix(b.prefix)}
              className={i === breadcrumbs.length - 1
                ? 'text-white font-medium'
                : 'text-gray-500 hover:text-white transition-colors'}
            >
              {b.label}
            </button>
          </span>
        ))}
        <button
          onClick={() => load(prefix)}
          className="ml-2 text-gray-600 hover:text-gray-400 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Error */}
      {result?.error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 text-sm text-red-300 font-mono">
          {result.error}
        </div>
      )}

      {/* Contents */}
      {!result?.error && (
        <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg overflow-hidden">
          {loading && !result && (
            <div className="p-8 text-center text-sm text-gray-500">Loading...</div>
          )}

          {result && result.folders.length === 0 && result.files.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-500">
              {prefix ? 'Empty folder' : 'Bucket is empty'}
            </div>
          )}

          {(result?.folders.length ?? 0) + (result?.files.length ?? 0) > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2f]">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Size</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Modified</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {result?.folders.map((folder, i) => {
                  const name = folder.replace(prefix, '').replace('/', '');
                  return (
                    <tr key={folder} className="border-b border-[#2a2a2f]">
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => setPrefix(folder)}
                          className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          <Folder size={14} />
                          {name}/
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">—</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">—</td>
                      <td className="px-4 py-2.5" />
                    </tr>
                  );
                })}
                {result?.files.map((file, i) => {
                  const isLast = !result?.folders.length
                    ? i === (result?.files.length ?? 0) - 1
                    : false;
                  return (
                    <tr key={file.key} className={!isLast ? 'border-b border-[#2a2a2f]' : ''}>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2 text-gray-300 font-mono text-xs">
                          <File size={14} className="text-gray-500 shrink-0" />
                          {fileName(file.key)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 text-xs">
                        {formatBytes(file.size)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600 text-xs">
                        {formatDate(file.lastModified)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handlePresign(file.key)}
                            title="Copy presigned URL"
                            className="text-gray-600 hover:text-gray-300 transition-colors"
                          >
                            <Download size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(file.key)}
                            disabled={deleting === file.key}
                            title="Delete"
                            className="text-gray-600 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {result?.isTruncated && (
        <p className="text-xs text-gray-600">Results truncated — bucket has more objects.</p>
      )}
    </div>
  );
}
