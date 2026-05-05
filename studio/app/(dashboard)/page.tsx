import Link from 'next/link';
import { Database, Users, HardDrive, Zap, ShieldCheck } from 'lucide-react';
import { loadBoaConfigWithRoot, getDsqlEndpoint, getStackName, getLambdaName, getBucketName } from '@/lib/boa-config';
import { listPolicies } from '@/lib/cedar-policies';
import { getAwsClients } from '@/lib/aws-clients';
import { DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { NoConfig } from '@/components/no-config';

const services = [
  { id: 'database',  label: 'Database',  sub: 'Aurora DSQL',      icon: Database,    href: '/database' },
  { id: 'auth',      label: 'Auth',      sub: 'better-auth',       icon: Users,       href: '/auth' },
  { id: 'storage',   label: 'Storage',   sub: 'Amazon S3',         icon: HardDrive,   href: '/storage' },
  { id: 'functions', label: 'Functions', sub: 'AWS Lambda',        icon: Zap,         href: '/functions' },
  { id: 'policies',  label: 'Policies',  sub: 'Cedar authorization',icon: ShieldCheck, href: '/policies' },
];

export default async function OverviewPage() {
  const cfgResult = await loadBoaConfigWithRoot();

  if (!cfgResult) return <NoConfig />;

  const { config: cfg, projectRoot } = cfgResult;
  const stackName = getStackName(cfg);
  const region = cfg.region || 'us-east-1';
  const dsqlEndpoint = getDsqlEndpoint(cfg);
  const lambdaName = getLambdaName(cfg);
  const bucket = getBucketName(cfg);
  const policies = await listPolicies(cfg, projectRoot);

  let stackLastUpdated: Date | null = null;
  let stackStatus: string | null = null;
  try {
    const { cfn } = getAwsClients(cfg);
    const res = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    const stack = res.Stacks?.[0];
    stackLastUpdated = stack?.LastUpdatedTime ?? stack?.CreationTime ?? null;
    stackStatus = stack?.StackStatus ?? null;
  } catch {
    // Stack may not be deployed yet
  }

  const serviceValues: Record<string, string> = {
    database:  dsqlEndpoint || '',
    auth:      cfg.authProvider || 'better-auth',
    storage:   bucket || '',
    functions: lambdaName || '',
    policies:  policies.length ? `${policies.length} ${policies.length === 1 ? 'policy' : 'policies'}` : '',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">{stackName}</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5 align-middle" />
          {region}
        </p>
      </div>

      {/* Service cards */}
      <div>
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3">Services</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          {services.map(svc => {
            const value = serviceValues[svc.id];
            const configured = Boolean(value);
            return (
              <Link
                key={svc.id}
                href={svc.href}
                className="block bg-[#1c1c21] border border-[#2a2a2f] rounded-lg p-4 hover:border-gray-500 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <svc.icon size={16} className="text-gray-400" />
                  <span className={`w-2 h-2 rounded-full ${configured ? 'bg-green-500' : 'bg-gray-600'}`} />
                </div>
                <div className="text-sm font-medium text-white">{svc.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{svc.sub}</div>
                {value && (
                  <div className="text-xs text-gray-600 font-mono mt-2 truncate">{value}</div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Stack deployment info */}
      {(stackLastUpdated || stackStatus) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest">Deployment</p>
            <a
              href={`https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/stackinfo?stackId=${encodeURIComponent(stackName)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-white transition-colors"
            >
              View in AWS Console →
            </a>
          </div>
        <div className="bg-[#1c1c21] border border-[#2a2a2f] rounded-lg px-4 py-3 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${
              stackStatus?.includes('COMPLETE') && !stackStatus?.includes('DELETE')
                ? 'bg-green-500'
                : stackStatus?.includes('IN_PROGRESS')
                ? 'bg-yellow-400'
                : stackStatus?.includes('FAILED') || stackStatus?.includes('ROLLBACK')
                ? 'bg-red-500'
                : 'bg-gray-600'
            }`} />
            <span className="font-mono text-gray-400">{stackStatus?.replace(/_/g, ' ').toLowerCase()}</span>
          </div>
          {stackLastUpdated && (
            <span>
              Last deployed{' '}
              <time className="text-gray-400" dateTime={stackLastUpdated.toISOString()}>
                {stackLastUpdated.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {' at '}
                {stackLastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </time>
            </span>
          )}
        </div>
        </div>
      )}
    </div>
  );
}
