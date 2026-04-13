# BOA — Backend on AWS

BOA is three things:

1. **A serverless backend** — PostgreSQL database, auth, APIs, storage. Fully serverless, scales to zero, scales to millions. No servers to manage.
2. **An agent skill** — Works with any coding agent (Claude Code, Kiro, Copilot, Codex). Describe your app, the agent builds and deploys the entire backend.
3. **A safe development process** — Opinionated guardrails that prevent the mistakes that kill projects. Your data is protected by default, your schema changes are tracked, and your infrastructure can't be accidentally destroyed.

## The Stack

| Layer | Service |
|-------|---------|
| Database | Aurora DSQL (serverless PostgreSQL) |
| Auth | Amazon Cognito |
| Compute | AWS Lambda (Node.js 20.x) |
| API | API Gateway (REST) |
| Storage | Amazon S3 |
| Hosting | AWS Amplify |
| IaC | SAM / CloudFormation |

## Safe by Default

Every opinion in BOA comes from a real failure. These guardrails are enforced automatically — not documented and hoped for.

**Your data can't be accidentally destroyed.**
DSQL, Cognito, and S3 all have `DeletionPolicy: Retain` and service-level deletion protection. Deleting the CloudFormation stack leaves your data intact. `boa teardown` requires typing the stack name to confirm. The skill refuses to teardown as a troubleshooting step.

**Your schema changes are tracked.**
Migrations are checksummed (SHA-256) and recorded in a `_boa_migrations` table. Modified migrations are rejected. Bad SQL stops immediately (`ON_ERROR_STOP=1`) — no partial state. `boa migrate --dry-run` shows what would run without touching the database.

**Your users' data is private by default.**
Cedar authorization enforces deny-by-default. Tables without policies return 403 on every request. S3 buckets block all public access — only presigned URLs work. The API returns 401 for any request without valid credentials.

**Your secrets never leak.**
JWT secrets live in SSM Parameter Store, not in code. `.boa/config.json` is gitignored from the start. IAM auth tokens (not passwords) connect to the database. API keys are generated locally and never transmitted.

**Your infrastructure is validated.**
`boa check` verifies prerequisites before you start. `boa verify` tests the live stack after deployment (Cognito self-signup enabled, API returns 401 not 500, S3 is private). CORS is pre-configured for `@supabase/supabase-js` including error responses.

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

BOA guides your agent through the right architecture and deploys everything to your AWS account.

## Project Structure

```
boa/
├── cli/                 # BOA CLI (boa init, deploy, migrate, verify, teardown)
├── plugin/              # The agent skill plugin
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
