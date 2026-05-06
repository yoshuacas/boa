import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { NoConfig } from '@/components/no-config';
import { PolicyEditor } from '@/components/policy-editor';

const DEFAULT_POLICY = `// Describe what this policy permits or forbids.
// Example: Allow authenticated users to read their own rows.

permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource has user_id && resource.user_id == principal
};
`;

interface PolicyData {
  filename: string;
  content: string;
}

export default function PolicyEditorPage() {
  const { filename } = useParams<{ filename: string }>();
  const decoded = decodeURIComponent(filename ?? '');
  const isNew = decoded === 'new';

  const [policy, setPolicy] = useState<PolicyData | null>(null);
  const [noConfig, setNoConfig] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew) return;

    fetch(`/api/policies?filename=${encodeURIComponent(decoded)}`)
      .then(r => {
        if (r.status === 404) {
          // Could be no config OR policy not found
          return r.json().then((d: { error?: string }) => {
            if (d.error?.includes('BOA config')) setNoConfig(true);
            else setNotFound(true);
            return null;
          });
        }
        return r.json() as Promise<PolicyData>;
      })
      .then(d => { if (d) setPolicy(d); })
      .finally(() => setLoading(false));
  }, [decoded, isNew]);

  if (loading) return <div className="text-gray-600 text-sm">Loading...</div>;
  if (noConfig) return <NoConfig />;

  if (notFound) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link to="/policies" className="hover:text-gray-300 transition-colors">Policies</Link>
          <span>/</span>
          <span className="text-white font-mono">{decoded}</span>
        </div>
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 text-sm text-red-300">
          Policy file not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/policies" className="hover:text-gray-300 transition-colors">Policies</Link>
        <span>/</span>
        <span className="text-white font-mono">{isNew ? 'new' : decoded}</span>
      </div>

      <PolicyEditor
        initialFilename={isNew ? '' : decoded}
        initialContent={policy?.content ?? DEFAULT_POLICY}
        isNew={isNew}
      />
    </div>
  );
}
