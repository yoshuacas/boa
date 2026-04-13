---
outline: false
---

# Install BOA

Clone the repository, install the CLI, and add the skill to your coding agent.

## 1. Clone and install the CLI

```bash
git clone https://github.com/yoshuacas/boa.git
cd boa/cli && npm link && cd ../..
```

This builds the `boa` command and makes it available globally. Verify with:

```bash
boa --version
```

## 2. Add the skill to your agent

### Claude Code

From your project directory, start Claude Code with the BOA plugin:

```bash
claude --plugin-dir /path/to/boa/plugin
```

Replace `/path/to/boa` with wherever you cloned the repo. For example, if you cloned into `~/boa`:

```bash
claude --plugin-dir ~/boa/plugin
```

To load it automatically every time, add it to your project's `.claude/settings.json`:

```json
{
  "plugins": ["/path/to/boa/plugin"]
}
```

### Kiro

Copy the skill file into your Kiro workspace:

```bash
cp boa/plugin/skills/boa/SKILL.md /path/to/your/kiro/skills/boa/
```

Kiro reads SKILL.md files from the skills directory automatically.

### VS Code Copilot

Open the BOA repo in VS Code. Copilot automatically reads `AGENTS.md` and `.github/copilot-instructions.md`.

```bash
code boa
```

No manual configuration needed. Ask Copilot to build your backend and it will follow the BOA patterns.

### Codex

Copy the BOA skill file into your project's agents directory:

```bash
mkdir -p .agents/skills/boa
cp boa/plugin/skills/boa/SKILL.md .agents/skills/boa/
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

## CLI Commands

| Command | What it does |
|---------|-------------|
| `boa init <name>` | Create and deploy a new backend |
| `boa deploy` | Redeploy after changes |
| `boa migrate` | Apply database migrations |
| `boa verify` | Check deployment health |
| `boa status` | Show stack info and tables |
| `boa check` | Check prerequisites |
| `boa teardown` | Destroy everything |
| `boa feedback` | Submit feedback to improve BOA |
