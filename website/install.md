---
outline: false
---

# Install BOA in Your Agent

BOA works with Claude Code, Kiro, VS Code Copilot, and Codex. Pick your agent below.

## Claude Code (recommended)

Add the BOA plugin from the GitHub repository:

```bash
# In Claude Code, add the GitHub repo as a plugin source
/plugin marketplace add https://github.com/aws/boa.git

# Install the plugin
/plugin install boa@aws-boa
```

After installing, tell Claude what to build. The skill guides the agent through database schema, auth, APIs, and deployment.

**For development/testing**, you can also clone and load locally:

```bash
git clone https://github.com/aws/boa.git
claude --plugin-dir ./boa/plugin
```

> **Coming soon:** `claude plugin install boa` will work once published to the marketplace.

## Kiro

Import the BOA skill from the GitHub repository. Kiro reads the SKILL.md file directly.

```
https://github.com/aws/boa/blob/main/plugin/skills/boa/SKILL.md
```

In Kiro, use the import skill feature and point it to the URL above. Kiro will fetch the skill and make it available in your workspace.

## VS Code Copilot

Clone the BOA repo and open it with VS Code. Copilot automatically reads AGENTS.md and .github/copilot-instructions.md.

```bash
git clone https://github.com/aws/boa.git && code boa
```

No manual configuration needed. VS Code Copilot picks up the instructions files automatically when the repository is open. Ask Copilot to build your backend and it will follow the BOA patterns.

## Codex

Copy the BOA skill file into your project's agents skills directory.

```bash
mkdir -p .agents/skills/boa && cp plugin/skills/boa/SKILL.md .agents/skills/boa/
```

Clone the BOA repo first, then copy the skill file into your project. Codex reads skills from the .agents/skills/ directory.
