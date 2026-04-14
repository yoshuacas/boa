import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as aws from '../lib/aws.mjs';
import * as config from '../lib/config.mjs';
import { header } from '../lib/output.mjs';

export default async function status(_args) {
  // 1. Load config
  const cfg = config.requireConfig();
  const {
    stackName, region, apiUrl, dsqlEndpoint, deployedAt,
  } = cfg;

  // 2. Print header and stack info
  console.log('');
  header('BOA Status');
  console.log('');
  console.log(`  Stack:       ${stackName}`);
  console.log(`  Region:      ${region}`);
  console.log(`  API URL:     ${apiUrl}`);
  if (cfg.functionUrl) {
    console.log(
      `  Function URL: ${cfg.functionUrl} (internal)`
    );
  }
  console.log(`  Deployed at: ${deployedAt}`);
  const extensions = cfg.extensions || [];
  console.log(
    `  Extensions:  ${extensions.length > 0 ? extensions.join(', ') : '(none)'}`
  );

  // 3-7. Database queries (graceful degradation)
  try {
    const token = aws.dsqlGenerateAuthToken(dsqlEndpoint, region);
    const connstr = `host=${dsqlEndpoint} port=5432`
      + ` dbname=postgres user=admin sslmode=require`;
    const psqlEnv = { ...process.env, PGPASSWORD: token };

    // 4. Query database tables
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

    const tables = tablesRaw
      ? tablesRaw.split('\n').filter(Boolean)
      : [];

    console.log('');
    console.log('Tables:');
    if (tables.length === 0) {
      console.log('  (none)');
    } else {
      for (const t of tables) {
        console.log(`  ${t}`);
      }
    }

    // 5. Query applied migrations
    let appliedRows = [];
    try {
      const appliedRaw = aws.exec(
        `psql "${connstr}" -t -A -c `
          + `"SELECT name || '|' || applied_at`
          + ` FROM _boa_migrations ORDER BY name"`,
        { env: psqlEnv }
      );
      if (appliedRaw) {
        appliedRows = appliedRaw.split('\n').filter(Boolean);
      }
    } catch {
      // _boa_migrations doesn't exist — treat as empty
    }

    const appliedNames = new Set();
    const appliedDisplay = [];
    for (const row of appliedRows) {
      const sep = row.indexOf('|');
      if (sep > 0) {
        const name = row.slice(0, sep);
        const appliedAt = row.slice(sep + 1);
        appliedNames.add(name);
        appliedDisplay.push({ name, appliedAt });
      }
    }

    console.log('');
    console.log('Applied migrations:');
    if (appliedDisplay.length === 0) {
      console.log('  (none)');
    } else {
      for (const m of appliedDisplay) {
        console.log(`  ${m.name}    ${m.appliedAt}`);
      }
    }

    // 6. Scan migrations/ for pending files
    const migrationsDir = join(process.cwd(), 'migrations');
    let pending = [];
    if (existsSync(migrationsDir)) {
      const sqlFiles = readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      pending = sqlFiles.filter((f) => !appliedNames.has(f));
    }

    console.log('');
    console.log('Pending migrations:');
    if (pending.length === 0) {
      console.log('  (none)');
    } else {
      for (const p of pending) {
        console.log(`  ${p}`);
      }
    }
  } catch {
    // Graceful degradation — database unreachable
    console.log('');
    console.log('Database info unavailable (connection failed).');
  }
}
