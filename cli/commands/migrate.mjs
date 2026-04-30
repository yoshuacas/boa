import { createHash } from 'node:crypto';
import {
  readFileSync, existsSync, readdirSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import * as aws from '../lib/aws.mjs';
import * as config from '../lib/config.mjs';
import { runTasks, color } from '../lib/ui.mjs';

export function sha256(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export default async function migrate(args) {
  const dryRun = args.includes('--dry-run');

  const cfg = config.requireConfig();
  const { dsqlEndpoint, region } = cfg;

  if (!dsqlEndpoint || dsqlEndpoint === 'null') {
    console.error(
      'Error: dsqlEndpoint not found in .boa/config.json'
    );
    process.exit(1);
  }

  const migrationsDir = join(process.cwd(), 'migrations');
  if (!existsSync(migrationsDir)) {
    console.log(color.dim('No migrations/ directory found. Nothing to migrate.'));
    return;
  }

  const sqlFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (sqlFiles.length === 0) {
    console.log(color.dim('No .sql files in migrations/. Nothing to migrate.'));
    return;
  }

  const token = aws.dsqlGenerateAuthToken(dsqlEndpoint, region);
  const connstr = `host=${dsqlEndpoint} port=5432 dbname=postgres user=admin sslmode=require`;
  const psqlEnv = { ...process.env, PGPASSWORD: token };

  // Build the plan up front so each migration becomes its own task,
  // decide-once-and-render instead of narrating row-by-row.
  const tracking = {
    applied: new Map(),
    applyCount: 0,
    skipCount: 0,
    dryRunCount: 0,
  };

  await runTasks([
    {
      title: 'Load migration history',
      run: () => {
        aws.exec(
          `psql "${connstr}" -q -c "CREATE TABLE IF NOT EXISTS _boa_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ DEFAULT NOW())"`,
          { env: psqlEnv }
        );
        const appliedRaw = aws.exec(
          `psql "${connstr}" -t -A -c "SELECT name || '|' || checksum FROM _boa_migrations ORDER BY name"`,
          { env: psqlEnv }
        );
        if (appliedRaw) {
          for (const line of appliedRaw.split('\n')) {
            const sep = line.indexOf('|');
            if (sep > 0) {
              tracking.applied.set(line.slice(0, sep), line.slice(sep + 1));
            }
          }
        }
      },
    },
    {
      title: `Apply ${sqlFiles.length} migration(s)`,
      run: () => sqlFiles.map((file) => ({
        title: file,
        skip: () => {
          const checksum = sha256(join(migrationsDir, file));
          const stored = tracking.applied.get(file);
          if (stored === undefined) return false;
          if (stored !== checksum) {
            throw new Error(
              `${file} was modified after being applied — never edit an applied migration; write a new one to fix the issue.`
            );
          }
          tracking.skipCount++;
          return 'already applied';
        },
        run: () => {
          const filePath = join(migrationsDir, file);
          const checksum = sha256(filePath);

          if (dryRun) {
            tracking.dryRunCount++;
            return;
          }

          aws.exec(`psql "${connstr}" -q -v ON_ERROR_STOP=1 -f "${filePath}"`, {
            env: psqlEnv,
          });
          const safeName = file.replace(/'/g, "''");
          const safeChecksum = checksum.replace(/'/g, "''");
          aws.exec(
            `psql "${connstr}" -q -c "INSERT INTO _boa_migrations (name, checksum) VALUES ('${safeName}', '${safeChecksum}')"`,
            { env: psqlEnv }
          );
          tracking.applyCount++;
        },
      })),
    },
    {
      title: 'Refresh PostgREST schema cache',
      skip: () => tracking.applyCount === 0
        ? 'no new migrations applied' : false,
      run: () => {
        const { apiUrl, serviceRoleKey } = cfg;
        if (!apiUrl || !serviceRoleKey) return;
        try {
          aws.exec(
            `curl -s -X GET "${apiUrl}/rest/v1/_refresh" -H "apikey: ${serviceRoleKey}" -o /dev/null -w ""`
          );
        } catch { /* best-effort */ }
      },
    },
  ]);

  const parts = [
    `${tracking.applyCount} applied`,
    `${tracking.skipCount} skipped`,
  ];
  if (tracking.dryRunCount > 0) parts.push(`${tracking.dryRunCount} would apply`);
  console.log(color.dim(`Migration complete: ${parts.join(', ')}.`));
}
