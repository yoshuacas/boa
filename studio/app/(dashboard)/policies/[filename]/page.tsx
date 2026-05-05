import Link from 'next/link';
import { loadBoaConfigWithRoot } from '@/lib/boa-config';
import { readPolicy } from '@/lib/cedar-policies';
import { NoConfig } from '@/components/no-config';
import { PolicyEditor } from '@/components/policy-editor';

interface Props {
  params: Promise<{ filename: string }>;
}

export default async function PolicyPage({ params }: Props) {
  const { filename } = await params;
  const decoded = decodeURIComponent(filename);

  const result = await loadBoaConfigWithRoot();
  if (!result) return <NoConfig />;

  const isNew = decoded === 'new';
  const policy = isNew ? null : await readPolicy(result.config, result.projectRoot, decoded);

  if (!isNew && !policy) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/policies" className="hover:text-gray-300 transition-colors">Policies</Link>
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
        <Link href="/policies" className="hover:text-gray-300 transition-colors">Policies</Link>
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
