import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_DIR = '.boa';
const CONFIG_FILE = 'config.json';

export function read(projectDir = process.cwd()) {
  const path = join(projectDir, CONFIG_DIR, CONFIG_FILE);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function write(config, projectDir = process.cwd()) {
  const dir = join(projectDir, CONFIG_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, CONFIG_FILE),
    JSON.stringify(config, null, 2) + '\n'
  );
}

export function requireConfig(projectDir = process.cwd()) {
  const config = read(projectDir);
  if (!config) {
    console.error(
      `Error: .boa/config.json not found. Run 'boa init' first.`
    );
    process.exit(1);
  }
  return config;
}
