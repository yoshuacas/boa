# BOA — Backend on AWS

BOA is four things:

1. **A serverless backend** — PostgreSQL database, auth, APIs, storage. Fully serverless on AWS. Scales to zero, scales to millions. No servers to manage.
2. **A CLI** — `boa init`, `boa deploy`, `boa migrate`. One tool for the full lifecycle. Developers and agents use the same commands.
3. **An agent skill** — Works with any coding agent (Claude Code, Kiro, Copilot, Codex). Describe your app, the agent builds and deploys the entire backend.
4. **A safe development process** — Opinionated guardrails that prevent the mistakes that kill projects. Your data is protected by default, your schema changes are tracked, and your infrastructure can't be accidentally destroyed.

## The Stack

| Layer | Service |
|-------|---------|
| Database | Aurora DSQL (serverless PostgreSQL) |
| Auth | Amazon Cognito |
| Authorization | Cedar (policy-as-code) |
| Compute | AWS Lambda (Node.js 20.x) |
| API | API Gateway (REST) |
| Storage | Amazon S3 |
| Hosting | AWS Amplify |
| IaC | SAM / CloudFormation |

## The CLI

The BOA CLI is the single interface for all backend operations. Developers can use it directly from the terminal. Agents call the same commands under the hood.

```
boa init <name>     Create and deploy a new backend
boa deploy          Redeploy after changes (policies, code)
boa migrate         Apply pending SQL migrations
boa verify          Check deployment health
boa status          Show stack info, tables, pending migrations
boa check           Verify prerequisites and AWS credentials
boa teardown        Destroy everything (with confirmation)
boa feedback        Report a bug to improve BOA
```

The agent is the best way to use BOA, but not the only way. After `boa init`, the project is self-sufficient — developers can add tables, write policies, and deploy without going back to the agent.

## Safe by Default

Every opinion in BOA comes from a real failure. These are examples of how we think about helping developers build safely:

**Your data can't be accidentally destroyed.**
DSQL, Cognito, and S3 all have deletion protection enabled. Deleting the CloudFormation stack leaves your data intact. `boa teardown` requires typing the stack name to confirm. The skill refuses to teardown as a troubleshooting step.

**Your schema changes are tracked.**
Migrations are checksummed and recorded. Modified migrations are rejected. Bad SQL stops immediately — no partial state. `boa migrate --dry-run` shows what would run without touching the database.

**Your users' data is private by default.**
Cedar authorization enforces deny-by-default. Tables without policies return 403 on every request. S3 buckets block all public access. The API returns 401 for any request without valid credentials.

**Your secrets never leak.**
JWT secrets live in SSM Parameter Store, not in code. `.boa/config.json` is gitignored from the start. IAM auth tokens connect to the database — never passwords.

**Your infrastructure is validated.**
`boa check` verifies prerequisites before you start. `boa verify` tests the live stack after deployment. CORS is pre-configured for `@supabase/supabase-js` including error responses.

**Your agent reports bugs back.**
When the agent encounters a BOA bug and works around it, it offers to file a GitHub issue with the root cause, workaround, and suggested fix. Real-world feedback drives every improvement.

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/yoshuacas/boa.git ~/boa
cd ~/boa/cli && npm link && cd ~
```

### 2. Add the skill to your agent

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

Or use the CLI directly:

```bash
mkdir my-app && cd my-app
boa init --region us-east-1
```

BOA guides your agent through the right architecture and deploys everything to your AWS account.

## Project Structure

```
boa/
├── cli/                 # BOA CLI (the developer and agent interface)
├── plugin/              # The agent skill (intelligence layer)
│   ├── skills/boa/      # SKILL.md — main skill instructions
│   ├── docs/            # Pitfalls, architecture, patterns
│   └── templates/       # SAM/CloudFormation templates
├── website/             # Public website
├── dashboard/           # Local management dashboard (HTML + AWS CLI)
└── evals/               # Skill evaluation and testing
```

## Links

- **Documentation:** [website/docs/](website/docs/)
- **Install guide:** [website/install.md](website/install.md)

## Contributing

Contributions are welcome. See the [plugin/docs/](plugin/docs/) directory for architecture and patterns documentation. Open an issue or submit a pull request on GitHub.

## License

[Apache License 2.0](LICENSE)
