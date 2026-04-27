import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const pluginSkill = join(repoRoot, 'plugin', 'skills', 'boa', 'SKILL.md');
const pluginDocs = join(repoRoot, 'plugin', 'docs');
const cliSkill = join(repoRoot, 'cli', 'skill');

function rewriteForCli(path, contents) {
  if (path.endsWith('SKILL.md')) {
    return contents.replaceAll('../../docs/', 'docs/');
  }
  return contents.replaceAll(
    '../skills/boa/SKILL.md',
    '../SKILL.md'
  );
}

function fileNames(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

describe('bundled CLI skill', () => {
  it('is generated from the plugin skill with CLI-relative links', () => {
    const expected = rewriteForCli(
      pluginSkill,
      readFileSync(pluginSkill, 'utf8')
    );
    const actual = readFileSync(join(cliSkill, 'SKILL.md'), 'utf8');

    assert.equal(
      actual,
      expected,
      'cli/skill/SKILL.md is stale; run npm run sync:skill from cli/'
    );
  });

  it('bundles every plugin docs file with CLI-relative links', () => {
    const pluginDocFiles = fileNames(pluginDocs);
    const cliDocFiles = fileNames(join(cliSkill, 'docs'));

    assert.deepEqual(
      cliDocFiles,
      pluginDocFiles,
      'cli/skill/docs is stale; run npm run sync:skill from cli/'
    );

    for (const file of pluginDocFiles) {
      const src = join(pluginDocs, file);
      const expected = rewriteForCli(src, readFileSync(src, 'utf8'));
      const actual = readFileSync(join(cliSkill, 'docs', file), 'utf8');
      assert.equal(
        actual,
        expected,
        `cli/skill/docs/${file} is stale; run npm run sync:skill from cli/`
      );
    }
  });
});
