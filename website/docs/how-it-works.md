# How BOA Works

## BOA is a skill plugin for coding agents

BOA is not a framework, a CLI tool, or an SDK. It is a **skill file** — a structured document that your AI coding agent reads to learn how to build serverless backends on AWS.

When you install BOA, your agent gains knowledge about:
- Which AWS services to use (and which to avoid)
- How to wire them together correctly
- What common mistakes to watch for
- How to deploy everything with SAM/CloudFormation

## One opinionated stack

BOA teaches one specific way to build a backend on AWS:

| Layer | Service | Why this one |
|-------|---------|-------------|
| Database | Aurora DSQL | Serverless PostgreSQL. SQL you know. Scales to zero. |
| Auth | Amazon Cognito | Managed auth. 10K MAU free. |
| Compute | AWS Lambda | Node.js 20.x. No servers. |
| API | API Gateway (REST) | Cognito authorizer support. |
| Storage | Amazon S3 | Presigned URLs. Never public. |
| Hosting | AWS Amplify | Frontend CI/CD from Git. |
| IaC | SAM / CloudFormation | Repeatable deployments. |

**Why opinionated?** Because choice is what breaks AI agent builds. After observing hundreds of AI-built backends, the most common failures come from agents choosing the wrong service, the wrong configuration, or the wrong integration pattern. BOA eliminates those choices. One stack, one way to wire it up, every known failure already solved.

## Three components

### 1. The Skill (for your agent)

The core of BOA is `plugin/skills/boa/SKILL.md`. This is what your coding agent reads. It contains:

- Architecture patterns for six app types (productivity, social, real-time, e-commerce, SaaS, IoT)
- SAM/CloudFormation templates
- Lambda handler templates
- 9 critical rules that prevent the most common deployment failures
- Step-by-step deployment instructions

Supporting documentation in `plugin/docs/` covers pitfalls, database patterns, auth patterns, API patterns, and storage patterns.

### 2. The Website (for you)

The public website at [boa.aws](https://boa.aws) is where developers discover BOA. It includes:

- Install instructions for all supported agents
- An interactive pricing calculator comparing BOA to Supabase
- Documentation and FAQ

### 3. The Dashboard (for managing)

Each BOA deployment can include a local management dashboard — static HTML pages that connect to your AWS CLI to read data from your account. No separate server needed. Open the HTML file and it shows your tables, users, APIs, and storage.

## What happens when you build

When you tell your agent "Build a todo app with user accounts," here is what BOA guides it to do:

1. **Design the schema** — Create SQL tables with proper types, constraints, and indexes
2. **Configure auth** — Set up Cognito with self-signup, auto-confirm trigger, and proper client settings
3. **Write handlers** — Generate Lambda functions for each API endpoint with DSQL connections
4. **Define the API** — Create REST API Gateway resources with Cognito authorization on protected routes
5. **Set up storage** — Configure a private S3 bucket with presigned URL generation (if the app needs files)
6. **Write the template** — Generate a SAM template that defines all resources
7. **Deploy** — Run `sam build && sam deploy` to create everything in your AWS account

The entire backend lands in your AWS account. You own it, you control it, and it scales to zero when not in use.
