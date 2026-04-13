import { createHash } from 'node:crypto';
import {
  readFileSync, existsSync, readdirSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import * as aws from '../lib/aws.mjs';
import * as config from '../lib/config.mjs';

export function sha256(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export default async function migrate(args) {
  const dryRun = args.includes('--dry-run');

  // 1. Load config
  const cfg = config.requireConfig();
  const { dsqlEndpoint, region } = cfg;

  if (!dsqlEndpoint || dsqlEndpoint === 'null') {
    console.error(
      'Error: dsqlEndpoint not found in .boa/config.json'
    );
    process.exit(1);
  }

  // 2. Check for migrations/ directory
  const migrationsDir = join(process.cwd(), 'migrations');
  if (!existsSync(migrationsDir)) {
    console.log(
      'No migrations/ directory found. Nothing to migrate.'
    );
    return;
  }

  const sqlFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (sqlFiles.length === 0) {
    console.log(
      'No .sql files in migrations/. Nothing to migrate.'
    );
    return;
  }

  console.log(`Found ${sqlFiles.length} migration file(s).`);
  console.log('');

  // 4. Generate DSQL IAM auth token
  const token = aws.dsqlGenerateAuthToken(dsqlEndpoint, region);
  const connstr = `host=${dsqlEndpoint} port=5432 dbname=postgres user=admin sslmode=require`;
  const psqlEnv = { ...process.env, PGPASSWORD: token };

  // 5. Create tracking table
  aws.exec(
    `psql "${connstr}" -q -c "CREATE TABLE IF NOT EXISTS _boa_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ DEFAULT NOW())"`,
    { env: psqlEnv }
  );

  // 6. Load applied migrations
  const appliedRaw = aws.exec(
    `psql "${connstr}" -t -A -c "SELECT name || '|' || checksum FROM _boa_migrations ORDER BY name"`,
    { env: psqlEnv }
  );

  const applied = new Map();
  if (appliedRaw) {
    for (const line of appliedRaw.split('\n')) {
      const sep = line.indexOf('|');
      if (sep > 0) {
        applied.set(line.slice(0, sep), line.slice(sep + 1));
      }
    }
  }

  // 7. Apply pending migrations
  let applyCount = 0;
  let skipCount = 0;
  let dryRunCount = 0;

  for (const file of sqlFiles) {
    const filePath = join(migrationsDir, file);
    const checksum = sha256(filePath);
    const storedChecksum = applied.get(file);

    // Already applied — verify checksum
    if (storedChecksum !== undefined) {
      if (checksum !== storedChecksum) {
        console.error(
          `  [ERROR] ${file} -- file modified after being applied`
        );
        console.error(
          'Never edit an applied migration. Write a new migration to fix the issue.'
        );
        process.exit(1);
      }
      console.log(`  [skip] ${file}`);
      skipCount++;
      continue;
    }

    // Dry run — show what would run
    if (dryRun) {
      console.log(`  [dry-run] ${file}`);
      dryRunCount++;
      continue;
    }

    // Apply migration
    console.log(`  [run]  ${file} ...`);
    try {
      aws.exec(`psql "${connstr}" -q -v ON_ERROR_STOP=1 -f "${filePath}"`, {
        env: psqlEnv,
      });
    } catch {
      console.error(`  [FAIL] ${file}`);
      console.error('');
      console.error(
        "Migration failed. Fix the issue and run 'boa migrate' again."
      );
      console.error(
        'Migrations that were already applied before this run are safe.'
      );
      process.exit(1);
    }

    // Record migration (use dollar-quoting to prevent SQL injection from filenames)
    const safeName = file.replace(/'/g, "''");
    const safeChecksum = checksum.replace(/'/g, "''");
    aws.exec(
      `psql "${connstr}" -q -c "INSERT INTO _boa_migrations (name, checksum) VALUES ('${safeName}', '${safeChecksum}')"`,
      { env: psqlEnv }
    );
    console.log(`  [done] ${file}`);
    applyCount++;
  }

  // 8. Refresh PostgREST schema cache
  if (applyCount > 0) {
    const { apiUrl, serviceRoleKey } = cfg;
    if (apiUrl && serviceRoleKey) {
      console.log('');
      console.log('Refreshing PostgREST schema cache...');
      try {
        aws.exec(
          `curl -s -X GET "${apiUrl}/rest/v1/_refresh" -H "apikey: ${serviceRoleKey}" -o /dev/null -w ""`
        );
        console.log('  [OK] Schema cache refreshed');
      } catch {
        // Non-fatal — cache refresh is best-effort
      }
    }
  }

  // 9. Summary
  console.log('');
  const parts = [`${applyCount} applied`, `${skipCount} skipped`];
  if (dryRunCount > 0) parts.push(`${dryRunCount} would apply`);
  console.log(`Migration complete: ${parts.join(', ')}.`);
}
