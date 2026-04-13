# BOA — Backend on AWS

BOA is an opinionated, lightweight backend on AWS that takes apps from prototype to millions of users. PostgreSQL database, auth, APIs, storage — fully serverless, scales to zero, scales to millions. No servers to manage.

BOA is agent-ready. The BOA skill works with any coding agent — install it, describe your app, and your agent builds and deploys the entire backend to your AWS account.

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
