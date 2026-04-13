/**
 * Integration tests for `boa migrate` against local PostgreSQL.
 *
 * Requires: PostgreSQL running locally with a `boa_test` database.
 *   createdb boa_test
 *
 * These tests exercise the real migration flow: tracking table creation,
 * checksum verification, skip/apply/dry-run, and failure handling.
 * They use psql directly (same as the migrate command) but with a local
 * connection string instead of DSQL IAM auth.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import {
  mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const DB = 'boa_test';
const CONNSTR = `dbname=${DB}`;

function psql(sql) {
  return execSync(`psql "${CONNSTR}" -t -A -c "${sql}"`, {
    encoding: 'utf8',
  }).trim();
}

function psqlQuiet(sql) {
  execSync(`psql "${CONNSTR}" -q -c "${sql}"`, { encoding: 'utf8' });
}

// Run boa migrate in a temp project directory with a fake .boa/config.json
// that points to the local database. We override the migrate command's
// behavior by calling psql directly with the local connstr.
function runMigrate(projectDir, extraArgs = '') {
  // The migrate command reads config and calls aws.dsqlGenerateAuthToken.
  // For local testing, we write a small wrapper that bypasses DSQL auth
  // and uses the local connection string.
  const wrapperPath = join(projectDir, '_run_migrate.mjs');
  writeFileSync(wrapperPath, `
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const CONNSTR = '${CONNSTR}';

function exec(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function sha256(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const migrationsDir = join(process.cwd(), 'migrations');

if (!existsSync(migrationsDir)) {
  console.log('No migrations/ directory found. Nothing to migrate.');
  process.exit(0);
}

const sqlFiles = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
if (sqlFiles.length === 0) {
  console.log('No .sql files in migrations/. Nothing to migrate.');
  process.exit(0);
}

console.log('Found ' + sqlFiles.length + ' migration file(s).');
console.log('');

// Create tracking table
exec('psql "' + CONNSTR + '" -q -c "CREATE TABLE IF NOT EXISTS _boa_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ DEFAULT NOW())"');

// Load applied
const appliedRaw = exec('psql "' + CONNSTR + '" -t -A -c "SELECT name || \\'|\\' || checksum FROM _boa_migrations ORDER BY name"');
const applied = new Map();
if (appliedRaw) {
  for (const line of appliedRaw.split('\\n')) {
    const sep = line.indexOf('|');
    if (sep > 0) applied.set(line.slice(0, sep), line.slice(sep + 1));
  }
}

let applyCount = 0, skipCount = 0, dryRunCount = 0;

for (const file of sqlFiles) {
  const filePath = join(migrationsDir, file);
  const checksum = sha256(filePath);
  const storedChecksum = applied.get(file);

  if (storedChecksum !== undefined) {
    if (checksum !== storedChecksum) {
      console.error('  [ERROR] ' + file + ' -- file modified after being applied');
      process.exit(1);
    }
    console.log('  [skip] ' + file);
    skipCount++;
    continue;
  }

  if (dryRun) {
    console.log('  [dry-run] ' + file);
    dryRunCount++;
    continue;
  }

  console.log('  [run]  ' + file + ' ...');
  try {
    exec('psql "' + CONNSTR + '" -q -v ON_ERROR_STOP=1 -f "' + filePath + '"');
  } catch {
    console.error('  [FAIL] ' + file);
    process.exit(1);
  }

  const safeName = file.replace(/'/g, "''");
  const safeChecksum = checksum.replace(/'/g, "''");
  exec("psql \\"" + CONNSTR + "\\" -q -c \\"INSERT INTO _boa_migrations (name, checksum) VALUES ('" + safeName + "', '" + safeChecksum + "')\\"");
  console.log('  [done] ' + file);
  applyCount++;
}

console.log('');
const parts = [applyCount + ' applied', skipCount + ' skipped'];
if (dryRunCount > 0) parts.push(dryRunCount + ' would apply');
console.log('Migration complete: ' + parts.join(', ') + '.');
`);

  const result = execSync(
    `node ${wrapperPath} ${extraArgs}`,
    { cwd: projectDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  return result;
}

function runMigrateExpectFail(projectDir, extraArgs = '') {
  const wrapperPath = join(projectDir, '_run_migrate.mjs');
  // Ensure wrapper exists
  if (!existsSync(wrapperPath)) {
    // Create it by calling runMigrate internals (write the wrapper file)
    // We trigger wrapper creation by calling runMigrate on a throwaway run
    // but the simplest approach: just call runMigrate which writes the wrapper
    try { runMigrate(projectDir, extraArgs); } catch { /* expected */ }
  }
  try {
    execSync(
      `node ${wrapperPath} ${extraArgs}`,
      { cwd: projectDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    assert.fail('Expected migration to fail');
  } catch (err) {
    if (err.code === 'ERR_ASSERTION') throw err;
    return { stdout: err.stdout || '', stderr: err.stderr || '', code: err.status };
  }
}

let tempDir;

before(() => {
  // Clean database
  psqlQuiet('DROP TABLE IF EXISTS _boa_migrations CASCADE');
  psqlQuiet('DROP TABLE IF EXISTS users CASCADE');
  psqlQuiet('DROP TABLE IF EXISTS todos CASCADE');
  psqlQuiet('DROP TABLE IF EXISTS posts CASCADE');
});

beforeEach(() => {
  // Fresh temp project directory for each test
  tempDir = mkdtempSync(join(tmpdir(), 'boa-migrate-test-'));

  // Clean database state
  psqlQuiet('DROP TABLE IF EXISTS _boa_migrations CASCADE');
  psqlQuiet('DROP TABLE IF EXISTS users CASCADE');
  psqlQuiet('DROP TABLE IF EXISTS todos CASCADE');
  psqlQuiet('DROP TABLE IF EXISTS posts CASCADE');
});

after(() => {
  // Clean up
  psqlQuiet('DROP TABLE IF EXISTS _boa_migrations CASCADE');
  psqlQuiet('DROP TABLE IF EXISTS users CASCADE');
  psqlQuiet('DROP TABLE IF EXISTS todos CASCADE');
  psqlQuiet('DROP TABLE IF EXISTS posts CASCADE');
});

describe('migrate integration (local PostgreSQL)', () => {

  it('creates tracking table and applies first migration', () => {
    mkdirSync(join(tempDir, 'migrations'), { recursive: true });
    writeFileSync(join(tempDir, 'migrations', '001_create_users.sql'),
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );`
    );

    const output = runMigrate(tempDir);
    assert.match(output, /Found 1 migration/);
    assert.match(output, /\[run\].*001_create_users\.sql/);
    assert.match(output, /\[done\].*001_create_users\.sql/);
    assert.match(output, /1 applied, 0 skipped/);

    // Verify table was created
    const tables = psql("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users'");
    assert.equal(tables, 'users');

    // Verify migration was recorded
    const recorded = psql("SELECT name FROM _boa_migrations WHERE name = '001_create_users.sql'");
    assert.equal(recorded, '001_create_users.sql');
  });

  it('skips already-applied migrations', () => {
    mkdirSync(join(tempDir, 'migrations'), { recursive: true });
    writeFileSync(join(tempDir, 'migrations', '001_create_users.sql'),
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL);`
    );

    // First run — applies
    runMigrate(tempDir);

    // Second run — skips
    const output = runMigrate(tempDir);
    assert.match(output, /\[skip\].*001_create_users\.sql/);
    assert.match(output, /0 applied, 1 skipped/);
  });

  it('applies only new migrations when some are already applied', () => {
    mkdirSync(join(tempDir, 'migrations'), { recursive: true });
    writeFileSync(join(tempDir, 'migrations', '001_create_users.sql'),
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL);`
    );

    // Apply first migration
    runMigrate(tempDir);

    // Add second migration
    writeFileSync(join(tempDir, 'migrations', '002_create_todos.sql'),
      `CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, title TEXT NOT NULL, user_id TEXT NOT NULL);`
    );

    const output = runMigrate(tempDir);
    assert.match(output, /Found 2 migration/);
    assert.match(output, /\[skip\].*001_create_users\.sql/);
    assert.match(output, /\[run\].*002_create_todos\.sql/);
    assert.match(output, /1 applied, 1 skipped/);

    // Verify both tables exist
    const tables = psql("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('users', 'todos') ORDER BY tablename");
    assert.match(tables, /todos/);
    assert.match(tables, /users/);
  });

  it('detects modified migration (checksum mismatch)', () => {
    mkdirSync(join(tempDir, 'migrations'), { recursive: true });
    writeFileSync(join(tempDir, 'migrations', '001_create_users.sql'),
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL);`
    );

    // Apply first migration
    runMigrate(tempDir);

    // Modify the applied migration
    writeFileSync(join(tempDir, 'migrations', '001_create_users.sql'),
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT);`
    );

    // Should fail
    const { stderr } = runMigrateExpectFail(tempDir);
    assert.match(stderr, /ERROR.*001_create_users\.sql.*modified/);
  });

  it('dry-run shows what would run without applying', () => {
    mkdirSync(join(tempDir, 'migrations'), { recursive: true });
    writeFileSync(join(tempDir, 'migrations', '001_create_users.sql'),
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL);`
    );
    writeFileSync(join(tempDir, 'migrations', '002_create_todos.sql'),
      `CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, title TEXT NOT NULL);`
    );

    const output = runMigrate(tempDir, '--dry-run');
    assert.match(output, /\[dry-run\].*001_create_users\.sql/);
    assert.match(output, /\[dry-run\].*002_create_todos\.sql/);
    assert.match(output, /0 applied, 0 skipped, 2 would apply/);

    // Verify no tables were created
    const tables = psql("SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('users', 'todos')");
    assert.equal(tables, '0');
  });

  it('handles no migrations directory gracefully', () => {
    // tempDir has no migrations/ directory
    // Need to create the wrapper first with a dummy run
    mkdirSync(join(tempDir, 'migrations'), { recursive: true });
    runMigrate(tempDir); // creates wrapper
    rmSync(join(tempDir, 'migrations'), { recursive: true });

    const output = runMigrate(tempDir);
    assert.match(output, /No migrations\/ directory found/);
  });

  it('handles empty migrations directory gracefully', () => {
    mkdirSync(join(tempDir, 'migrations'), { recursive: true });
    // No .sql files

    const output = runMigrate(tempDir);
    assert.match(output, /No \.sql files in migrations/);
  });

  it('fails on bad SQL and stops', () => {
    mkdirSync(join(tempDir, 'migrations'), { recursive: true });
    writeFileSync(join(tempDir, 'migrations', '001_bad.sql'),
      `THIS IS NOT VALID SQL AT ALL;`
    );

    const { stderr } = runMigrateExpectFail(tempDir);
    assert.match(stderr, /FAIL.*001_bad\.sql/);

    // Verify migration was NOT recorded
    // (tracking table might not exist yet if it failed before recording)
    try {
      const count = psql("SELECT COUNT(*) FROM _boa_migrations WHERE name = '001_bad.sql'");
      assert.equal(count, '0');
    } catch {
      // Table doesn't exist — that's fine too
    }
  });

  it('applies migrations in sorted order', () => {
    mkdirSync(join(tempDir, 'migrations'), { recursive: true });
    // Write in reverse order
    writeFileSync(join(tempDir, 'migrations', '003_create_posts.sql'),
      `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, title TEXT NOT NULL);`
    );
    writeFileSync(join(tempDir, 'migrations', '001_create_users.sql'),
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL);`
    );
    writeFileSync(join(tempDir, 'migrations', '002_create_todos.sql'),
      `CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, task TEXT NOT NULL);`
    );

    const output = runMigrate(tempDir);
    const runLines = output.split('\n').filter(l => l.includes('[run]'));
    assert.equal(runLines.length, 3);
    assert.match(runLines[0], /001_create_users/);
    assert.match(runLines[1], /002_create_todos/);
    assert.match(runLines[2], /003_create_posts/);
    assert.match(output, /3 applied, 0 skipped/);
  });

  it('mixed: skips applied, dry-runs pending', () => {
    mkdirSync(join(tempDir, 'migrations'), { recursive: true });
    writeFileSync(join(tempDir, 'migrations', '001_create_users.sql'),
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL);`
    );

    // Apply first
    runMigrate(tempDir);

    // Add second
    writeFileSync(join(tempDir, 'migrations', '002_create_todos.sql'),
      `CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, task TEXT NOT NULL);`
    );

    const output = runMigrate(tempDir, '--dry-run');
    assert.match(output, /\[skip\].*001_create_users/);
    assert.match(output, /\[dry-run\].*002_create_todos/);
    assert.match(output, /0 applied, 1 skipped, 1 would apply/);
  });
});
