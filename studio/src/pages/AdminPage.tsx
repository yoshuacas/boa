import { useAuth } from '@/src/context/AuthContext';
import { AdminUsers } from '@/components/admin-users';

export default function AdminPage() {
  const { authMode } = useAuth();

  if (authMode !== 'cognito') {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-[var(--tx-1)]">Admin</h1>
        <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-lg p-6 text-sm text-[var(--tx-3)]">
          User management requires <code className="font-mono text-[var(--tx-2)]">STUDIO_AUTH=cognito</code>.
          In token mode there are no individual user accounts to manage.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--tx-1)]">Admin</h1>
      <AdminUsers />
    </div>
  );
}
