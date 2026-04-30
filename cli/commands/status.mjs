import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as aws from '../lib/aws.mjs';
import * as config from '../lib/config.mjs';
import { heading, summary, table, blank, color, warn } from '../lib/ui.mjs';

export default async function status(_args) {
  const cfg = config.requireConfig();
  const {
    stackName, region, apiUrl, dsqlEndpoint, deployedAt,
  } = cfg;

  heading('BOA status');

  const trafficLayer = cfg.apiGateway
    ? `API Gateway (${cfg.apiGateway.restApiId}, stage ${cfg.apiGateway.stage})`
    : cfg.alb
      ? `ALB (${cfg.alb.dnsName})`
      : '(none)';

  const extensions = cfg.extensions || [];
  summary(null, [
    ['Stack', stackName],
    ['Region', region],
    ['API URL', apiUrl],
    ['Traffic', trafficLayer],
    ['Deployed', deployedAt],
    ['Extensions', extensions.length > 0 ? extensions.join(', ') : color.dim('(none)')],
  ]);

  try {
    const token = aws.dsqlGenerateAuthToken(dsqlEndpoint, region);
    const connstr = `host=${dsqlEndpoint} port=5432 dbname=postgres user=admin sslmode=require`;
    const psqlEnv = { ...process.env, PGPASSWORD: token };

    const tablesRaw = aws.exec(
      `psql "${connstr}" -t -A -c `
        + `"SELECT c.relname AS tablename`
        + ` FROM pg_catalog.pg_class c`
        + ` JOIN pg_catalog.pg_namespace n`
        + ` ON n.oid = c.relnamespace`
        + ` WHERE n.nspname = 'public'`
        + ` AND c.relkind IN ('r', 'p')`
        + ` ORDER BY c.relname"`,
      { env: psqlEnv }
    );
    const tables = tablesRaw ? tablesRaw.split('\n').filter(Boolean) : [];

    blank();
    heading('Tables');
    table(['Name'], tables.map((t) => [t]));

    let appliedRows = [];
    try {
      const appliedRaw = aws.exec(
        `psql "${connstr}" -t -A -c `
          + `"SELECT name || '|' || applied_at`
          + ` FROM _boa_migrations ORDER BY name"`,
        { env: psqlEnv }
      );
      if (appliedRaw) appliedRows = appliedRaw.split('\n').filter(Boolean);
    } catch { /* tracking table missing */ }

    const appliedNames = new Set();
    const applied = [];
    for (const row of appliedRows) {
      const sep = row.indexOf('|');
      if (sep > 0) {
        const name = row.slice(0, sep);
        const appliedAt = row.slice(sep + 1);
        appliedNames.add(name);
        applied.push([name, appliedAt]);
      }
    }

    blank();
    heading('Applied migrations');
    table(['Name', 'Applied at'], applied);

    const migrationsDir = join(process.cwd(), 'migrations');
    let pending = [];
    if (existsSync(migrationsDir)) {
      pending = readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .filter((f) => !appliedNames.has(f));
    }

    blank();
    heading('Pending migrations');
    table(['Name'], pending.map((p) => [p]),
      { emptyMessage: 'none — run `boa deploy` to apply any new .sql files' });
  } catch {
    blank();
    warn('Database info unavailable (connection failed).');
  }
}
