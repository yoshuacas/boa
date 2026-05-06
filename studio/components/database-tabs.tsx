import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function DatabaseTabs() {
  const { pathname } = useLocation();
  const isSql = pathname === '/database/sql';

  return (
    <div className="flex items-center gap-1 border-b border-[#1c1c21] mb-6">
      <Link
        to="/database"
        className={cn(
          'px-3 py-2 text-sm transition-colors border-b-2 -mb-px',
          !isSql
            ? 'border-white text-white'
            : 'border-transparent text-gray-500 hover:text-gray-300'
        )}
      >
        Tables
      </Link>
      <Link
        to="/database/sql"
        className={cn(
          'px-3 py-2 text-sm transition-colors border-b-2 -mb-px',
          isSql
            ? 'border-white text-white'
            : 'border-transparent text-gray-500 hover:text-gray-300'
        )}
      >
        SQL Editor
      </Link>
    </div>
  );
}
