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

### 1. Clone the repo and install the CLI

```bash
git clone https://github.com/yoshuacas/boa.git
cd boa/cli && npm link && cd ../..
```

This installs the `boa` command globally.

### 2. Add the skill to your agent

**Claude Code** (from your project directory):

```bash
claude --plugin-dir /path/to/boa/plugin
```

**Kiro:**

Copy `boa/plugin/skills/boa/SKILL.md` into your Kiro skills directory.

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
