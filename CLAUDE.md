# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is BOA?

**BOA — Backend on AWS, without the complexity.**

A complete backend on AWS in under a minute. Built for agents. Free until your users show up. No ceiling when they do.

**BOA is four things:**
1. **A serverless backend** — database, auth, APIs, storage on AWS. Scales to zero, scales to millions.
2. **The BOA CLI** — `boa init`, `boa deploy`, `boa migrate`. One tool for the full lifecycle. Developers and agents use the same commands.
3. **The BOA skill** — works with any coding agent (Claude Code, Kiro, Copilot, Codex) to build and evolve backends.
4. **Guardrails** — opinionated defaults that prevent the mistakes that kill projects. Data protected by default, migrations tracked, your backend can't be accidentally destroyed.

**Core problem:** Building backends on AWS is too complex — especially for AI coding agents, which default to Supabase or Firebase because AWS has too many choices and too many ways to get it wrong. BOA fixes that with battle-tested patterns, a CLI that developers and agents share, and guardrails that make the safe path the easy path.

**Product definition:** See [docs/PRODUCT.md](docs/PRODUCT.md) for the full product definition — value proposition, audience, positioning, writing standards, and nomenclature. All materials derive from that document.

**Nomenclature:** See [docs/GLOSSARY.md](docs/GLOSSARY.md) for canonical terms. Use these consistently across all BOA materials.

**Launch:** April 28, 2026 — website live, skill available in Claude.

## Repository Structure (Three Concerns)

```
boa/
├── plugin/          # THE INSTALLABLE SKILL (goes to marketplace, works offline)
│   ├── .claude-plugin/plugin.json
│   ├── skills/boa/SKILL.md         # Main skill (<500 lines)
│   ├── docs/                        # Agent-readable docs (bundled)
│   ├── templates/backend.yaml       # SAM template (full stack)
│   ├── lambda-templates/            # Thin wrappers around pgrest-lambda
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
| Authorization | Cedar | Policy-as-code, deny-by-default, ~5μs per eval |
| Engine | pgrest-lambda (npm) | PostgREST + GoTrue on Lambda, @supabase/supabase-js compatible |
| Compute | Lambda (Node.js 20.x) | Never Python (binary dep failures) |
| API | CloudFront + WAF (default) | DDoS protection, rate limiting, edge caching |
| Compute Access | Lambda Function URLs (internal) | Origin secret header, only CloudFront can invoke |
| Storage | Amazon S3 | Presigned URLs only, never public |
| Hosting | AWS Amplify | Frontend CI/CD from Git |
| IaC | SAM / CloudFormation | One-command deploy |

CloudFront + WAF is the default traffic layer. API Gateway and ALB are available as extensions (`boa extend api-gateway`, `boa extend alb`).

## Critical Rules

1. `AllowAdminCreateUserOnly: false` for Cognito self-signup
2. Deploy pre-signup Lambda that auto-confirms users
3. Node.js for Lambda, never Python
4. `REGION_NAME` env var, never `AWS_REGION` (reserved)
5. S3: never public, always presigned URLs
6. Vite: `define: { global: 'globalThis' }` for Cognito SDK
7. Amplify: no `/<*>` redirect, use regex excluding static assets
8. DSQL: IAM auth tokens, never hardcoded credentials
9. Extensions are optional. The default backend works without any extensions.

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
