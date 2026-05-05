import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { getAuthMode, makeSessionCookieValue } from '@/lib/studio-auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Server-side auth validation for token mode. Middleware only checks
  // cookie presence (it runs as a CloudFront Function without server secrets).
  // Full secret validation happens here in the Node.js Lambda runtime.
  if (getAuthMode() === 'token') {
    const cookieStore = await cookies();
    const session = cookieStore.get('boa-studio-session');
    const expected = await makeSessionCookieValue();
    if (!session || session.value !== expected) {
      redirect('/login');
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  );
}
