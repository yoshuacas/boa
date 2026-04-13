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

Add the BOA plugin to Claude Code from GitHub:

```bash
# In Claude Code, run:
/plugin marketplace add https://github.com/aws/boa.git
/plugin install boa@aws-boa
```

Then tell your agent what to build:

```
"Build a todo app with user accounts and file uploads"
```

BOA guides your agent through the right architecture and deploys everything to your AWS account.

> **Coming soon:** `claude plugin install boa` will be available once the plugin is published to the marketplace.

## Project Structure

```
boa/
├── plugin/              # The agent skill plugin
│   ├── skills/boa/      # SKILL.md — main skill instructions
│   ├── docs/            # Pitfalls, architecture, patterns
│   ├── templates/       # SAM/CloudFormation templates
│   ├── lambda-templates/# Ready-to-use Lambda handlers
│   └── scripts/         # Bootstrap and deploy scripts
├── website/             # Public website (hosted on AWS)
├── dashboard/           # Local management dashboard (HTML + AWS CLI)
└── evals/               # Skill evaluation and testing
```

## Links

- **Website:** [boa.aws](https://boa.aws) (coming soon)
- **Documentation:** [website/docs/](website/docs/)
- **Install guide:** [website/install.html](website/install.html)
- **Pricing:** [website/pricing.html](website/pricing.html)

## Contributing

Contributions are welcome. See the [plugin/docs/](plugin/docs/) directory for architecture and patterns documentation. Open an issue or submit a pull request on GitHub.

## License

[Apache License 2.0](LICENSE)

---

BOA is a community-driven open-source project from AWS.
