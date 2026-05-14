import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, Users, HardDrive, Zap, ShieldCheck } from 'lucide-react';
import { NoConfig } from '@/components/no-config';

const services = [
  { id: 'database',  label: 'Database',  sub: 'Aurora DSQL',       icon: Database,    href: '/database' },
  { id: 'auth',      label: 'Auth',      sub: 'better-auth',        icon: Users,       href: '/auth' },
  { id: 'storage',   label: 'Storage',   sub: 'Amazon S3',          icon: HardDrive,   href: '/storage' },
  { id: 'functions', label: 'Functions', sub: 'AWS Lambda',         icon: Zap,         href: '/functions' },
  { id: 'policies',  label: 'Policies',  sub: 'Cedar authorization', icon: ShieldCheck, href: '/policies' },
];

interface OverviewData {
  stackName: string;
  region: string;
  dsqlEndpoint: string;
  lambdaName: string;
  bucket: string;
  authProvider: string;
  policyCount: number;
  stackStatus: string | null;
  stackLastUpdated: string | null;
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [noConfig, setNoConfig] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/overview')
      .then(r => {
        if (r.status === 404) { setNoConfig(true); return null; }
        return r.json() as Promise<OverviewData>;
      })
      .then(d => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-[var(--tx-3)] text-sm">Loading...</div>;
  }

  if (noConfig) return <NoConfig />;
  if (!data) return null;

  const serviceValues: Record<string, string> = {
    database:  data.dsqlEndpoint,
    auth:      data.authProvider || 'better-auth',
    storage:   data.bucket,
    functions: data.lambdaName,
    policies:  data.policyCount ? `${data.policyCount} ${data.policyCount === 1 ? 'policy' : 'policies'}` : '',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[var(--tx-1)]">{data.stackName}</h1>
        <p className="text-sm text-[var(--tx-2)] mt-0.5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5 align-middle" />
          {data.region}
        </p>
      </div>

      {/* Service cards */}
      <div>
        <p className="text-xs font-semibold text-[var(--tx-3)] uppercase tracking-widest mb-3">Services</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          {services.map(svc => {
            const value = serviceValues[svc.id];
            const configured = Boolean(value);
            return (
              <Link
                key={svc.id}
                to={svc.href}
                className="block bg-[var(--bg-surface)] border border-[var(--bd)] rounded-lg p-4 hover:border-gray-500 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <svc.icon size={16} className="text-[var(--tx-2)]" />
                  <span className={`w-2 h-2 rounded-full ${configured ? 'bg-green-500' : 'bg-gray-600'}`} />
                </div>
                <div className="text-sm font-medium text-[var(--tx-1)]">{svc.label}</div>
                <div className="text-xs text-[var(--tx-3)] mt-0.5">{svc.sub}</div>
                {value && (
                  <div className="text-xs text-[var(--tx-3)] font-mono mt-2 truncate">{value}</div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Stack deployment info */}
      {(data.stackLastUpdated || data.stackStatus) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[var(--tx-3)] uppercase tracking-widest">Deployment</p>
            <a
              href={`https://${data.region}.console.aws.amazon.com/cloudformation/home?region=${data.region}#/stacks/stackinfo?stackId=${encodeURIComponent(data.stackName)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--tx-3)] hover:text-[var(--tx-1)] transition-colors"
            >
              View in AWS Console →
            </a>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-lg px-4 py-3 flex items-center justify-between text-xs text-[var(--tx-3)]">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${
                data.stackStatus?.includes('COMPLETE') && !data.stackStatus?.includes('DELETE')
                  ? 'bg-green-500'
                  : data.stackStatus?.includes('IN_PROGRESS')
                  ? 'bg-yellow-400'
                  : data.stackStatus?.includes('FAILED') || data.stackStatus?.includes('ROLLBACK')
                  ? 'bg-red-500'
                  : 'bg-gray-600'
              }`} />
              <span className="font-mono text-[var(--tx-2)]">{data.stackStatus?.replace(/_/g, ' ').toLowerCase()}</span>
            </div>
            {data.stackLastUpdated && (
              <span>
                Last deployed{' '}
                <time className="text-[var(--tx-2)]" dateTime={data.stackLastUpdated}>
                  {new Date(data.stackLastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' at '}
                  {new Date(data.stackLastUpdated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </time>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
