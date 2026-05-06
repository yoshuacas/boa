import { useAuth } from '@/src/context/AuthContext';
import { AdminUsers } from '@/components/admin-users';

export default function AdminPage() {
  const { authMode } = useAuth();

  if (authMode !== 'cognito') {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-white">Admin</h1>
        <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg p-6 text-sm text-gray-500">
          User management requires <code className="font-mono text-gray-400">STUDIO_AUTH=cognito</code>.
          In token mode there are no individual user accounts to manage.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Admin</h1>
      <AdminUsers />
    </div>
  );
}
