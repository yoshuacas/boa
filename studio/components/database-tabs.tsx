import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function DatabaseTabs() {
  const { pathname } = useLocation();
  const isSql = pathname === '/database/sql';

  return (
    <div className="flex items-center gap-1 border-b border-[var(--bd-subtle)] mb-6">
      <Link
        to="/database"
        className={cn(
          'px-3 py-2 text-sm transition-colors border-b-2 -mb-px',
          !isSql
            ? 'border-white text-[var(--tx-1)]'
            : 'border-transparent text-[var(--tx-3)] hover:text-[var(--tx-2)]'
        )}
      >
        Tables
      </Link>
      <Link
        to="/database/sql"
        className={cn(
          'px-3 py-2 text-sm transition-colors border-b-2 -mb-px',
          isSql
            ? 'border-white text-[var(--tx-1)]'
            : 'border-transparent text-[var(--tx-3)] hover:text-[var(--tx-2)]'
        )}
      >
        SQL Editor
      </Link>
    </div>
  );
}
