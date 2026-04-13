# Plan: BOA CLI

## Problem

BOA's backend operations (init, deploy, migrate, verify, teardown) live inside the plugin as shell scripts. This creates two problems:

1. **Developer dependency on the agent.** After bootstrap, the developer has `.boa/config.json`, `migrations/`, and `policies/` — but no way to deploy, migrate, or verify without asking the agent. The project isn't self-sufficient.

2. **The agent leaks plugin internals.** The agent references `deploy.sh`, `migrate.sh`, and script paths that don't exist in the developer's project. The developer can't act on these instructions.

## Solution

An npm package (`boa-cli`) that becomes the single interface for all BOA operations. Both the developer and the agent use the same commands.

```
Developer:  boa init my-app        Agent:  boa init my-app
Developer:  boa deploy             Agent:  boa deploy
Developer:  boa migrate            Agent:  boa migrate
```

## Two Entry Points

### Skill-first (developer installs the Claude Code / Kiro plugin)

```
install skill → agent runs /boa → skill checks for CLI → 
  missing? → agent runs: npm install -g boa-cli →
  agent uses CLI for all operations
```

The skill treats `boa` as a required tool, same as `aws` or `sam`. Step 1 (Setup) checks for it and installs it if missing.

### npm-first (developer finds BOA on npm)

```
npm install -g boa-cli → boa init my-app →
  CLI scaffolds project → CLI installs skill into local agent →
  agent can now help with schema design, policies, debugging
```

`boa init` detects which agents are available (Claude Code, Kiro, Codex) and installs the skill so the developer gets AI assistance immediately.

Either path converges to: **project + CLI + skill installed**.

## CLI Commands

| Command | What it does | Maps to current |
|---------|-------------|-----------------|
| `boa init <name>` | Create project, deploy stack, write config | `bootstrap.sh` |
| `boa deploy` | Rebuild + redeploy (SAM build/deploy, bundle policies) | `deploy.sh` |
| `boa migrate` | Apply pending SQL migrations to DSQL | `migrate.sh` |
| `boa verify` | Check all stack components are correct | `verify.sh` |
| `boa teardown` | Destroy everything (with confirmation) | `teardown.sh` |
| `boa status` | Show stack info, tables, recent deploys | **new** |
| `boa check` | Check required tools + AWS credentials | `check-tools.sh` |

### `boa init <name>` (replaces bootstrap.sh)

```
boa init my-app
boa init my-app --region us-east-2
boa init   # uses current folder name
```

Steps:
1. Check prerequisites (aws, sam, node, psql, jq) — fail with install instructions if missing
2. Check AWS credentials — guide to `aws login` if missing
3. Validate region supports DSQL (us-east-1, us-east-2)
4. Create project directory (if name given) or use current directory
5. Scaffold project structure:
   ```
   my-app/
   ├── migrations/          # SQL migration files go here
   ├── policies/            # Cedar policy files go here
   ├── .boa/
   │   └── config.json      # Generated after deploy
   └── .gitignore           # Excludes .boa/, node_modules/
   ```
6. Generate JWT secret, store in SSM
7. SAM build + deploy
8. Extract outputs, generate keys, write `.boa/config.json`
9. Detect local agents and install the BOA skill:
   - Claude Code: check for `~/.claude/` → copy plugin to `~/.claude/plugins/boa/`
   - Kiro: check for `~/.kiro/` → install via Kiro's plugin mechanism
   - VS Code Copilot: check for `.github/copilot-instructions.md` → append BOA context
10. Print summary: API URL, what works now, next steps

### `boa deploy` (replaces deploy.sh)

```
boa deploy
```

Reads `.boa/config.json` for stack name and region. Runs SAM build, bundles Cedar policies from `policies/`, deploys, refreshes config. Automatically runs pending migrations if `migrations/` exists.

### `boa migrate` (replaces migrate.sh)

```
boa migrate
boa migrate --dry-run   # show what would run without executing
```

Same logic as current `migrate.sh`: checksums, `_boa_migrations` tracking table, IAM auth to DSQL. Adds `--dry-run` for safety.

### `boa status` (new)

```
boa status
```

Shows:
- Stack name, region, API URL
- Tables in the database (via psql introspection)
- Applied migrations (from `_boa_migrations`)
- Last deploy timestamp
- Pending migrations (files in `migrations/` not yet applied)

### `boa check` (replaces check-tools.sh)

```
boa check
```

Checks all prerequisites and prints a clean checklist. Same output as `check-tools.sh` but built into the CLI.

## Package Structure

```
boa/cli/
├── bin/
│   └── boa.mjs                  # Entry point (#!/usr/bin/env node)
├── commands/
│   ├── init.mjs                 # Project creation + deploy
│   ├── deploy.mjs               # SAM build + deploy + bundle policies
│   ├── migrate.mjs              # Database migration runner
│   ├── verify.mjs               # Post-deploy verification
│   ├── teardown.mjs             # Stack destruction
│   ├── status.mjs               # Stack info + table listing
│   └── check.mjs                # Prerequisite checker
├── lib/
│   ├── config.mjs               # Read/write .boa/config.json
│   ├── aws.mjs                  # AWS CLI wrappers (sts, cfn, ssm, dsql)
│   ├── sam.mjs                  # SAM build + deploy wrappers
│   └── output.mjs               # Clean terminal output (tables, checklists)
├── templates/
│   ├── backend.yaml             # SAM template (moved from plugin/templates/)
│   ├── index.mjs                # Lambda handler (moved from plugin/lambda-templates/)
│   ├── authorizer.mjs           # JWT authorizer (moved from plugin/lambda-templates/)
│   ├── presigned-upload.mjs     # S3 handler (moved from plugin/lambda-templates/)
│   └── generate-keys.mjs        # JWT key generator (moved from plugin/scripts/)
├── skill/                       # Bundled skill for auto-install
│   ├── skills/boa/SKILL.md
│   └── docs/                    # Agent-readable docs
├── package.json
└── README.md
```

## Technology Choices

- **Node.js** — already a prerequisite, no new runtime dependency
- **No framework** — just `process.argv` parsing or a lightweight arg parser (`commander` or `meow`)
- **Shells out to AWS CLI and SAM CLI** — same as current scripts, avoids AWS SDK dependency
- **ESM** — `.mjs` extension, consistent with existing Lambda handlers

## Skill Changes

The skill (SKILL.md) changes significantly:

1. **Remove all `bash $BOA_PLUGIN/scripts/...` references** — replaced with `boa <command>`
2. **Add `boa` to the prerequisites check** — same as aws, sam, node
3. **Step 1 becomes**: run `boa check`, install `boa-cli` if missing
4. **Quick Start becomes**: `boa init <name>` (one command)
5. **Deploy/migrate becomes**: `boa deploy`, `boa migrate`
6. **The skill focuses on intelligence**: schema design, policy writing, error diagnosis, teaching
7. **allowed-tools simplifies**: `Bash(boa *) Read Write Edit Grep Glob` — the agent mostly just calls `boa`

## Plugin Changes

The plugin becomes thinner:

```
plugin/
├── .claude-plugin/plugin.json
├── skills/boa/SKILL.md          # Intelligence layer (schema, policies, debugging)
├── docs/                        # Agent-readable docs (patterns, pitfalls, architecture)
├── CLAUDE.md                    # Plugin quick-ref
└── AGENTS.md                    # Cross-agent compat
```

Templates, lambda-templates, and scripts move into the CLI package. The plugin no longer has executable code — it's pure knowledge.

## What the Agent Does vs What the CLI Does

| Concern | CLI | Agent (Skill) |
|---------|-----|---------------|
| Check prerequisites | `boa check` | Interprets output, guides install |
| Create backend | `boa init` | Picks name, region |
| Design schema | — | Designs tables, writes migration SQL |
| Write Cedar policies | — | Designs access rules, writes policy files |
| Deploy changes | `boa deploy` | Decides when to deploy |
| Run migrations | `boa migrate` | Decides when to migrate |
| Debug errors | — | Reads logs, diagnoses, suggests fixes |
| Show status | `boa status` | Interprets for developer |
| Teardown | `boa teardown` | Warns developer, confirms intent |

The CLI is the hands. The skill is the brain.

## Migration Path

### Phase 1: Build the CLI
1. Create `boa/cli/` directory in the repo
2. Implement `boa init` by porting `bootstrap.sh` to Node.js
3. Port `deploy.sh`, `migrate.sh`, `verify.sh`, `teardown.sh`
4. Add new commands: `status`, `check`
5. Bundle the SAM template and Lambda handlers inside the package
6. Test: `npm link` → `boa init test-app` → `boa deploy` → `boa migrate` → `boa verify`

### Phase 2: Update the Skill
1. Rewrite SKILL.md to use `boa` commands instead of script paths
2. Add `boa` to prerequisites (install via `npm install -g boa-cli`)
3. Simplify `allowed-tools`
4. Remove `scripts/`, `templates/`, `lambda-templates/` from plugin
5. Test: install skill in Claude Code, ask "create a backend" → agent uses `boa init`

### Phase 3: Skill Auto-Install
1. `boa init` detects local agents and installs the skill
2. Test both entry points:
   - Skill-first: install skill → agent installs CLI → works
   - npm-first: `boa init` → installs skill → agent works

## npm Package Details

- **Package name**: `boa-cli` (under the `boa/` directory in this repo)
- **Binary name**: `boa`
- **Minimum Node.js**: 18
- **Dependencies**: minimal — prefer shelling out to AWS CLI over AWS SDK
- **Size target**: < 1MB (templates + handlers + CLI code)

## Version Sync: CLI Leads, Skill Follows

The CLI is the source of truth for versions. The skill must always work with the latest CLI.

- The CLI exposes its version: `boa --version` → `0.5.0`
- The skill has a `min_cli_version` in its frontmatter or a constant at the top
- On every invocation, the skill runs `boa --version` and compares:
  - CLI version >= skill's known version → proceed normally
  - CLI version > skill's known version → the CLI has new features the skill doesn't know about. The skill should attempt to update itself (re-pull from the plugin source / npm registry)
  - CLI missing → install it: `npm install -g boa-cli`
- The CLI can also ship a `boa update-skill` command that pulls the latest skill version from the repo/registry

This means the CLI can ship new commands, and the skill auto-updates to learn about them.

## Open Questions

1. **Skill auto-install mechanism**: How does each agent (Claude Code, Kiro, Codex) accept plugin installs programmatically? Needs research before Phase 3.
2. **Skill self-update mechanism**: What's the best way for a skill to update itself? Pull from GitHub? npm postinstall? The CLI bundling the latest skill and copying it into place on `boa init` or `boa update-skill`?
