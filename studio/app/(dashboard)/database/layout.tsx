import { loadBoaConfig, getDsqlEndpoint } from '@/lib/boa-config';
import { DatabaseTabs } from '@/components/database-tabs';

export default async function DatabaseLayout({ children }: { children: React.ReactNode }) {
  const cfg = await loadBoaConfig();
  const endpoint = cfg ? getDsqlEndpoint(cfg) : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mb-3 shrink-0">
        <h1 className="text-xl font-semibold text-white">Database</h1>
        {endpoint && (
          <p className="text-xs text-gray-600 font-mono mt-0.5">{endpoint}</p>
        )}
      </div>
      <DatabaseTabs />
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
