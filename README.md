# BOA — Backend on AWS

BOA is an open-source skill plugin that teaches AI coding agents to build production-ready, serverless backends on AWS. Install it in your agent, describe your app, and get a fully wired backend — PostgreSQL database, auth, APIs, storage — deployed to your AWS account. No servers to manage, scales to zero, runs on the AWS free tier for most prototypes.

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

Install the BOA plugin in your coding agent:

```
claude plugin install boa
```

Then tell your agent what to build:

```
"Build a todo app with user accounts and file uploads"
```

BOA guides your agent through the right architecture and deploys everything to your AWS account.

## Supported App Types

- **Productivity** — todo lists, notes, project management
- **Social** — feeds, posts, likes, media sharing
- **Real-time** — chat, collaboration, live updates
- **E-commerce** — catalogs, carts, orders, payments
- **SaaS** — multi-tenant apps, CRM, analytics dashboards
- **IoT** — device tracking, telemetry, health monitoring

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
