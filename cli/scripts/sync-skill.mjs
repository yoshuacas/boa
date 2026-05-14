#!/usr/bin/env node
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const pluginSkill = join(repoRoot, 'plugin', 'skills', 'boa', 'SKILL.md');
const pluginDocs = join(repoRoot, 'plugin', 'docs');
const cliSkillDir = join(repoRoot, 'cli', 'skill');

function rewriteForCli(path, contents) {
  if (path.endsWith('SKILL.md')) {
    return contents.replaceAll('../../docs/', 'docs/');
  }
  return contents.replaceAll(
    '../skills/boa/SKILL.md',
    '../SKILL.md'
  );
}

function writeTransformed(src, dest) {
  const contents = readFileSync(src, 'utf8');
  writeFileSync(dest, rewriteForCli(src, contents));
}

function syncSkill() {
  rmSync(cliSkillDir, { recursive: true, force: true });
  mkdirSync(join(cliSkillDir, 'docs'), { recursive: true });

  writeTransformed(pluginSkill, join(cliSkillDir, 'SKILL.md'));

  for (const entry of readdirSync(pluginDocs, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const src = join(pluginDocs, entry.name);
    const dest = join(cliSkillDir, 'docs', entry.name);
    writeTransformed(src, dest);
  }
}

function syncStudioInfra() {
  const infraDir = join(repoRoot, 'studio', 'infra');
  const templatesDir = join(__dirname, '..', 'templates');

  const files = [
    ['template.yaml',     'studio-infra.yaml'],
    ['template-app.yaml', 'studio-infra-app.yaml'],
  ];

  for (const [src, dest] of files) {
    const srcPath  = join(infraDir, src);
    const destPath = join(templatesDir, dest);
    copyFileSync(srcPath, destPath);
    console.log(`Synced ${relative(repoRoot, srcPath)} to ${relative(repoRoot, destPath)}`);
  }
}

syncSkill();
syncStudioInfra();

console.log(
  `Synced ${relative(repoRoot, pluginSkill)} and ${relative(repoRoot, pluginDocs)} to ${relative(repoRoot, cliSkillDir)}`
);
