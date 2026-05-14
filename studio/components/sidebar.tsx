import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Database, Users, HardDrive, Zap, LayoutDashboard, ShieldCheck, Settings, LogOut, Sun, Moon, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/context/ThemeContext';

const navItems = [
  { id: 'overview',  label: 'Overview',    icon: LayoutDashboard, href: '/',          alwaysShow: true },
  { id: 'database',  label: 'Database',    icon: Database,        href: '/database',  alwaysShow: true },
  { id: 'auth',      label: 'Auth',        icon: Users,           href: '/auth',      alwaysShow: true },
  { id: 'storage',   label: 'Storage',     icon: HardDrive,       href: '/storage',   alwaysShow: true },
  { id: 'functions', label: 'Functions',   icon: Zap,             href: '/functions', alwaysShow: true },
  { id: 'logs',      label: 'Logs',        icon: ScrollText,      href: '/logs',      alwaysShow: true },
  { id: 'policies',  label: 'Policies',    icon: ShieldCheck,     href: '/policies',  alwaysShow: true },
  { id: 'admin',     label: 'Admin',       icon: Settings,        href: '/admin',     alwaysShow: false },
];

export function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { studioMode, authMode } = useAuth();
  const { theme, toggle } = useTheme();
  const cloud = studioMode === 'cloud';
  const cognitoMode = authMode === 'cognito';

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    navigate('/login');
  }

  function NavLink({ item }: { item: typeof navItems[number] }) {
    const active =
      item.href === '/'
        ? pathname === '/'
        : pathname.startsWith(item.href);
    return (
      <Link
        to={item.href}
        title={item.label}
        className={cn(
          'relative flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors whitespace-nowrap',
          active
            ? 'text-[var(--orange)]'
            : 'text-[var(--tx-2)] hover:text-[var(--tx-1)]'
        )}
      >
        {active && (
          <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-[var(--orange)] rounded-r" />
        )}
        <item.icon size={15} className="shrink-0" />
        <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150">
          {item.label}
        </span>
      </Link>
    );
  }

  return (
    <aside className="group/sidebar flex flex-col min-h-screen bg-[var(--bg-base)] border-r border-[var(--bd)] shrink-0 w-12 hover:w-52 transition-[width] duration-200 overflow-hidden">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2.5 px-3 py-4 border-b border-[var(--bd)] min-w-52 hover:bg-[var(--bg-surface)] transition-colors">
        <div className="shrink-0 w-6 h-6 flex items-center justify-center">
          <span className="text-[var(--orange)] font-bold text-sm">B</span>
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 whitespace-nowrap">
          <span className="text-[var(--tx-1)] font-semibold text-sm tracking-tight">BOA Studio</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-sm ${
            cloud
              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              : 'bg-[var(--bg-surface)] text-[var(--tx-3)] border border-[var(--bd)]'
          }`}>
            {cloud ? 'Cloud' : 'Local'}
          </span>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 py-3 min-w-52">
        <p className="px-3 py-1 mb-1 text-[10px] font-semibold text-[var(--tx-3)] uppercase tracking-widest opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 whitespace-nowrap overflow-hidden">
          Services
        </p>
        {navItems.filter(i => i.alwaysShow).map(item => (
          <NavLink key={item.id} item={item} />
        ))}
      </nav>

      {/* Admin section — only in cloud + cognito */}
      {cloud && cognitoMode && (
        <div className="pb-2 min-w-52">
          <div className="border-t border-[var(--bd)] mb-2" />
          {navItems.filter(i => !i.alwaysShow).map(item => (
            <NavLink key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="px-2 py-3 border-t border-[var(--bd)] min-w-52 flex items-center gap-1">
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex items-center justify-center w-8 h-8 rounded text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-surface)] transition-colors shrink-0"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        {cloud && (
          <button
            onClick={handleLogout}
            title="Sign out"
            className="flex items-center gap-2 px-2 py-1.5 flex-1 rounded text-sm text-[var(--tx-3)] hover:text-[var(--tx-1)] hover:bg-[var(--bg-surface)] transition-colors whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100"
          >
            <LogOut size={14} className="shrink-0" />
            <span>Sign out</span>
          </button>
        )}
        {!cloud && (
          <p className="px-1 text-[11px] text-[var(--tx-3)] opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 whitespace-nowrap">
            v0.1.0
          </p>
        )}
      </div>
    </aside>
  );
}
