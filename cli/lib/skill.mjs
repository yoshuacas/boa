import { cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_SRC = join(__dirname, '..', 'skill');

/**
 * Copy the bundled skill and docs into .boa/skill/ in the target directory.
 * Always overwrites — keeps skill current with the installed CLI version.
 */
export function copySkill(projectDir) {
  const dest = join(projectDir, '.boa', 'skill');
  mkdirSync(dest, { recursive: true });
  cpSync(SKILL_SRC, dest, { recursive: true });
}
