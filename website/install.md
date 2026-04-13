---
outline: false
---

# Install BOA

Clone the repository once, install the CLI, and point your coding agent at the skill directory.

> **Important:** Don't copy individual skill files out of the repo. The skill references 10+ documentation files via relative paths — these only resolve when the full `plugin/` directory is intact.

## 1. Clone and install the CLI

```bash
git clone https://github.com/yoshuacas/boa.git ~/boa
cd ~/boa/cli && npm link && cd ~
```

This clones BOA to `~/boa` and installs the `boa` command globally. Verify with:

```bash
boa --version
```

## 2. Add the skill to your agent

The BOA skill lives at `~/boa/plugin`. Every agent needs the full directory — not just SKILL.md — because the skill loads pattern docs, pitfalls, and architecture references on demand.

### Claude Code

Start Claude Code with the BOA skill from any project directory:

```bash
claude --plugin-dir ~/boa/plugin
```

To load it automatically for a specific project, add to your project's `.claude/settings.json`:

```json
{
  "plugins": ["~/boa/plugin"]
}
```

### Kiro

Symlink the BOA skill into your project's `.kiro/skills/` directory:

```bash
ln -s ~/boa/plugin/skills/boa .kiro/skills/boa
ln -s ~/boa/plugin/docs .kiro/skills/boa-docs
```

This preserves the relative path references so Kiro can resolve `../../docs/*.md` from SKILL.md.

### VS Code Copilot

Symlink the BOA skill into your project:

```bash
ln -s ~/boa/plugin/AGENTS.md .github/copilot-instructions.md
```

Copilot reads `.github/copilot-instructions.md` automatically. No other configuration needed.

### Codex

Symlink the BOA skill into your project's `.agents/` directory:

```bash
mkdir -p .agents/skills
ln -s ~/boa/plugin/skills/boa .agents/skills/boa
```

## 3. Build your first backend

Tell your agent:

```
"Build a todo app with user accounts"
```

Or use the CLI directly:

```bash
mkdir my-app && cd my-app
boa init --region us-east-1
```

## Updating BOA

Since BOA is installed from a git clone, updating is:

```bash
cd ~/boa && git pull
```

The CLI and skill both update in place — no reinstall needed.

## CLI Commands

| Command | What it does |
|---------|-------------|
| `boa init <name>` | Create and deploy a new backend |
| `boa deploy` | Redeploy after changes |
| `boa migrate` | Apply database migrations |
| `boa verify` | Check deployment health |
| `boa status` | Show backend info and tables |
| `boa check` | Check prerequisites |
| `boa teardown` | Destroy everything |
| `boa feedback` | Submit feedback to improve BOA |
