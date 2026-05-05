'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Database, Users, HardDrive, Zap, LayoutDashboard, ShieldCheck, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isCloud } from '@/lib/studio-mode';

const navItems = [
  { id: 'overview',  label: 'Overview',    icon: LayoutDashboard, href: '/',          alwaysShow: true },
  { id: 'database',  label: 'Database',    icon: Database,        href: '/database',  alwaysShow: true },
  { id: 'auth',      label: 'Auth',        icon: Users,           href: '/auth',      alwaysShow: true },
  { id: 'storage',   label: 'Storage',     icon: HardDrive,       href: '/storage',   alwaysShow: true },
  { id: 'functions', label: 'Functions',   icon: Zap,             href: '/functions', alwaysShow: true },
  { id: 'policies',  label: 'Policies',    icon: ShieldCheck,     href: '/policies',  alwaysShow: true },
  { id: 'admin',     label: 'Admin',       icon: Settings,        href: '/admin',     alwaysShow: false },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const cloud = isCloud();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }
  const cognitoMode = process.env.NEXT_PUBLIC_STUDIO_AUTH === 'cognito';

  return (
    <aside className="group/sidebar flex flex-col min-h-screen bg-[#0f1117] border-r border-[#1c1c21] shrink-0 w-12 hover:w-56 transition-[width] duration-200 overflow-hidden">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 py-4 border-b border-[#1c1c21] min-w-56">
        <div className="shrink-0 w-6 h-6 flex items-center justify-center">
          <span className="text-white font-bold text-sm">B</span>
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 whitespace-nowrap">
          <span className="text-white font-bold text-base tracking-tight">BOA Studio</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
            cloud
              ? 'bg-blue-900/40 text-blue-400 border border-blue-700/40'
              : 'bg-[#1c1c21] text-gray-400'
          }`}>
            {cloud ? 'Cloud' : 'Local'}
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-1.5 py-3 space-y-0.5 min-w-56">
        <p className="px-2 py-1 text-[10px] font-semibold text-gray-600 uppercase tracking-widest opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 whitespace-nowrap overflow-hidden">
          Services
        </p>
        {navItems.filter(i => i.alwaysShow).map(item => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              title={item.label}
              className={cn(
                'flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors whitespace-nowrap',
                active
                  ? 'bg-[#1c1c21] text-white'
                  : 'text-gray-400 hover:text-white hover:bg-[#1c1c21]'
              )}
            >
              <item.icon size={15} className="shrink-0" />
              <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Admin section — only in cloud + cognito */}
      {cloud && cognitoMode && (
        <div className="px-1.5 pb-3 min-w-56">
          <div className="border-t border-[#1c1c21] mb-2" />
          {navItems.filter(i => !i.alwaysShow).map(item => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                title={item.label}
                className={cn(
                  'flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors whitespace-nowrap',
                  active
                    ? 'bg-[#1c1c21] text-white'
                    : 'text-gray-400 hover:text-white hover:bg-[#1c1c21]'
                )}
              >
                <item.icon size={15} className="shrink-0" />
                <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="px-1.5 py-3 border-t border-[#1c1c21] min-w-56">
        {cloud && (
          <button
            onClick={handleLogout}
            title="Sign out"
            className="flex items-center gap-2.5 px-2 py-1.5 w-full rounded text-sm text-gray-400 hover:text-white hover:bg-[#1c1c21] transition-colors whitespace-nowrap"
          >
            <LogOut size={15} className="shrink-0" />
            <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150">
              Sign out
            </span>
          </button>
        )}
        {!cloud && (
          <p className="px-2 text-[11px] text-gray-600 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 whitespace-nowrap">
            BOA Studio v0.1.0
          </p>
        )}
      </div>
    </aside>
  );
}
