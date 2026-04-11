# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is BOA?

**BOA (Backend on AWS)** is a community-driven open-source skill plugin from AWS. Developers install it with their coding agent (Claude Code, Kiro, VS Code Copilot, Codex) to build serverless backends on AWS with Supabase-equivalent capabilities.

**Core problem:** AI coding agents default to Supabase/Firebase because building backends on AWS is too complex. BOA fixes that with battle-tested patterns from hundreds of real agent builds.

**Launch:** April 28, 2026 — website live, plugin available in Claude.

## Repository Structure (Three Concerns)

```
boa/
├── plugin/          # THE INSTALLABLE SKILL (goes to marketplace, works offline)
│   ├── .claude-plugin/plugin.json
│   ├── skills/boa/SKILL.md         # Main skill (<500 lines)
│   ├── docs/                        # Agent-readable docs (bundled)
│   ├── templates/backend.yaml       # SAM template (full stack)
│   ├── lambda-templates/            # PostgreSQL/DSQL Lambda handlers
│   ├── scripts/                     # bootstrap, deploy, teardown, verify
│   ├── CLAUDE.md                    # Plugin quick-ref for skill discovery
│   └── AGENTS.md                    # VS Code Copilot / Codex cross-compat
│
├── website/         # PUBLIC MARKETING SITE (deployed to AWS separately)
│   ├── index.html, pricing.html     # Landing page + pricing calculator
│   ├── docs.html, install.html      # Documentation hub + install guide
│   └── docs/                        # Human-readable docs (for the site)
│
├── dashboard/       # LOCAL MANAGEMENT UI (fetched on demand by the skill)
│   ├── *.html                       # Static pages per service
│   └── js/aws-cli-bridge.js         # Generates AWS CLI commands
│
└── evals/           # SKILL EVALUATIONS
    ├── scenarios/                   # Natural-language prompts per app type
    ├── rubrics/                     # Pass/fail criteria
    └── harness/run-eval.sh          # Test runner
```

**Separation principle:** `plugin/` is self-contained for building backends offline. `website/` is deployed independently and never referenced by the skill. `dashboard/` is fetched from GitHub by the skill on demand.

## AWS Stack (Serverless Only)

| Layer | Service | Notes |
|-------|---------|-------|
| Database | Aurora DSQL | Serverless PostgreSQL, scales to zero, IAM auth |
| Auth | Amazon Cognito | Pre-signup auto-confirm trigger required |
| Compute | Lambda (Node.js 20.x) | Never Python (binary dep failures) |
| API | API Gateway (REST) | Not HTTP API — required for Cognito authorizers |
| Storage | Amazon S3 | Presigned URLs only, never public |
| Hosting | AWS Amplify | Frontend CI/CD from Git |
| IaC | SAM / CloudFormation | One-command deploy |

## Critical Rules

1. `AllowAdminCreateUserOnly: false` for Cognito self-signup
2. Deploy pre-signup Lambda that auto-confirms users
3. REST API Gateway, not HTTP API (Cognito authorizers)
4. Node.js for Lambda, never Python
5. `REGION_NAME` env var, never `AWS_REGION` (reserved)
6. S3: never public, always presigned URLs
7. Vite: `define: { global: 'globalThis' }` for Cognito SDK
8. Amplify: no `/<*>` redirect, use regex excluding static assets
9. DSQL: IAM auth tokens, never hardcoded credentials

## Plan Execution with rring

This project uses [rring](https://github.com/yoshuacas/rring) for design-driven development. rring is installed at `/home/ec2-user/rring/target/debug/rring` and initialized in this repo. The agent runtime is **Claude Code** (configured via `.rring/agent` file). Do not use Kiro.

**Workflow for executing plans (e.g. `plans/*.md`):**
1. `rring start <feature-name> "<description>"` — create a feature prompt
2. `rring design <feature-name>` — generate a design document from the prompt
3. `rring task <feature-name>` — break the design into implementation tasks
4. `rring work` — execute tasks via the implementer agent loop
5. `rring review <feature-name>` — code review the implementation

**Key commands:**
- `rring status` — show current workflow state
- `rring prompts` / `rring designs` — list prompts and designs
- `rring start <name> --edit` — create prompt and open in editor

Plans in `plans/` should be executed through rring rather than implemented directly. This ensures design review, task decomposition, and structured code review.

## Companion Repository

`../harbor-prfaq/` has prior art (DynamoDB-based skill, pricing calculators, competitive research). BOA does not mention Harbor publicly — it is a standalone open-source project.

## Writing Standards

- `/amazon-writer` skill for formal documents
- No AI-sounding language, no buzzwords
- Every data point needs a source
- Active voice, concise, plain English
