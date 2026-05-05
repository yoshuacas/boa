'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function DatabaseTabs() {
  const pathname = usePathname();
  const isSql = pathname === '/database/sql';

  return (
    <div className="flex items-center gap-1 border-b border-[#1c1c21] mb-6">
      <Link
        href="/database"
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
        href="/database/sql"
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
