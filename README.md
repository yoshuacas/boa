# BOA — Backend on AWS

BOA is four things:

1. **A serverless backend** — PostgreSQL database, auth, APIs, storage. Fully serverless on AWS. Scales to zero, scales to millions. No servers to manage.
2. **A CLI** — `boa init`, `boa deploy`, `boa migrate`. One tool for the full lifecycle. Developers and agents use the same commands.
3. **An agent skill** — Works with any coding agent (Claude Code, Kiro, Copilot, Codex). Describe your app, the agent builds and deploys the entire backend.
4. **Guardrails** — Opinionated defaults that prevent the mistakes that kill projects. Your data is protected, your migrations are tracked, and your backend can't be accidentally destroyed.

## The Stack

| Layer | Service |
|-------|---------|
| Database | Aurora DSQL (serverless PostgreSQL) |
| Auth | better-auth via pgrest-lambda |
| Authorization | Access policies (deny by default) |
| Compute | AWS Lambda (Node.js 20.x) |
| API | ALB + WAF (default) |
| Storage | Amazon S3 |
| Hosting | AWS Amplify |
| IaC | SAM / CloudFormation |

API Gateway is available as an extension (`boa extend api-gateway`) for usage plans, API keys, or custom domains.

## The BOA CLI

The BOA CLI is the single interface for all backend operations. Developers use it from the terminal. Agents call the same commands under the hood.

```
boa init <name>     Create and deploy a new backend
boa deploy          Redeploy after changes
boa migrate         Apply pending migrations
boa verify          Check deployment health
boa status          Show backend info, tables, pending migrations
boa check           Verify prerequisites and AWS credentials
boa teardown        Destroy everything (with confirmation)
boa extend <name>   Add an optional extension (e.g., api-gateway)
boa remove <name>   Remove an extension
boa extensions      List available and enabled extensions
boa feedback        Report a bug to improve BOA
```

The agent is the best way to use BOA, but not the only way. After `boa init`, the project is self-sufficient — developers can write migrations, write access policies, and deploy without going back to the agent.

## Safe by Default

Every guardrail in BOA comes from a real failure. These are examples of how we think about helping developers build safely:

**Your data can't be accidentally destroyed.**
Your database, auth, and storage all have deletion protection enabled. `boa teardown` requires typing the backend name to confirm. The BOA skill refuses to tear down as a troubleshooting step.

**Your migrations are tracked.**
Every migration is checksummed and recorded in your migration history. Modified migrations are rejected. Bad SQL stops immediately — no partial state. `boa migrate --dry-run` shows what would run without touching the database.

**Your data is private by default.**
Access policies enforce deny by default. Tables without access policies return 403 on every request. Storage blocks all public access. The REST API returns 401 for any request without valid credentials.

**Your backend works without extensions.**
The default backend is complete — database, auth, APIs, storage. Extensions like API Gateway are optional and additive. You add them when you need rate limiting, WAF, or custom domains. You remove them when you don't.

**Your secrets never leak.**
JWT secrets live in SSM Parameter Store, not in code. `.boa/config.json` is gitignored from the start. IAM auth tokens connect to the database — never passwords.

**Your backend is validated.**
`boa check` verifies prerequisites before you start. `boa verify` tests the live backend after deployment. CORS is pre-configured for `@supabase/supabase-js` including error responses.

**Your agent reports bugs back.**
When the agent encounters a BOA bug and works around it, it offers to file a GitHub issue with the root cause, workaround, and suggested fix. Real-world feedback drives every improvement.

## Quick Start

### 1. Clone and install the BOA CLI

```bash
git clone https://github.com/yoshuacas/boa.git ~/boa
cd ~/boa/cli && npm link && cd ~
```

### 2. Add the BOA skill to your agent

**Claude Code:**

```bash
claude --plugin-dir ~/boa/plugin
```

**Kiro:** symlink the skill into your project:

```bash
ln -s ~/boa/plugin/skills/boa .kiro/skills/boa
ln -s ~/boa/plugin/docs .kiro/skills/boa-docs
```

See the [install guide](website/install.md) for all agents (Copilot, Codex).

### 3. Build something

Tell your agent:

```
"Build a todo app with user accounts and file uploads"
```

Or use the BOA CLI directly:

```bash
mkdir my-app && cd my-app
boa init --region us-east-1
```

BOA guides your agent through the right architecture and deploys everything to your AWS account.

## Project Structure

```
boa/
├── cli/                 # The BOA CLI (developer and agent interface)
├── plugin/              # The BOA skill (agent intelligence layer)
│   ├── skills/boa/      # SKILL.md — main skill instructions
│   ├── docs/            # Guardrails, architecture, patterns
│   └── templates/       # SAM/CloudFormation templates
├── website/             # Public website
├── dashboard/           # Local management dashboard
└── evals/               # Skill evaluation and testing
```

## Links

- **Documentation:** [website/docs/](website/docs/)
- **Install guide:** [website/install.md](website/install.md)
- **Glossary:** [docs/GLOSSARY.md](docs/GLOSSARY.md)

## Contributing

Contributions are welcome. See the [plugin/docs/](plugin/docs/) directory for architecture and patterns documentation. Open an issue or submit a pull request on GitHub.

## License

[Apache License 2.0](LICENSE)
