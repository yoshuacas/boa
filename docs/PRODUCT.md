# BOA Product Definition

This is the canonical product definition for BOA. All materials — website, docs, skill, CLI output, README, marketing — derive from this document.

---

## Name

**BOA** — always uppercase. Stands for **Backend on AWS**.

## Positioning

**Backend on AWS, without the complexity.**

## Tagline

A complete backend on AWS in under a minute. Built for agents. Free until your users show up. No ceiling when they do.

## Value Proposition

BOA is for developers who want AWS but find it too complex. It removes the need to be an AWS expert by providing:

- **Easy to use** — one command to deploy a full backend. No AWS console, no YAML wrestling, no service selection.
- **A companion agent** — the BOA skill teaches any coding agent (Claude Code, Kiro, Copilot, Codex) to build and evolve backends. The agent knows every best practice and pitfall.
- **Serverless** — costs nothing when idle, scales automatically with your customers. No capacity planning, no servers.
- **Free to start** — AWS Free Tier covers the entire stack for prototypes and early-stage apps. A productivity app with 1,000 users costs $0/month.
- **Grows without limits** — the same stack that runs your prototype handles millions of users. No re-architecture, no plan upgrades, no migration.
- **Safe by default** — opinionated guardrails prevent the mistakes that kill projects. Data protected, schema changes tracked, infrastructure can't be accidentally destroyed.

## Core Problem

Building backends on AWS is too complex — especially for AI coding agents, which default to Supabase or Firebase because AWS has too many choices and too many ways to get it wrong.

BOA fixes that with battle-tested patterns from hundreds of real agent builds, a CLI that developers and agents share, and guardrails that make the safe path the easy path.

## What BOA Is (Four Pillars)

1. **A serverless backend** — database, auth, APIs, storage on AWS. Scales to zero, scales to millions.
2. **The BOA CLI** — `boa init`, `boa deploy`, `boa migrate`. One tool for the full lifecycle. Developers and agents use the same commands.
3. **The BOA skill** — works with any coding agent to build and evolve backends. The agent knows the architecture, the patterns, and the 17+ documented pitfalls.
4. **Guardrails** — opinionated defaults that prevent the mistakes that kill projects. Data protected by default, migrations tracked, your backend can't be accidentally destroyed.

## The Stack

| Layer | Service | Developer-Facing Term |
|-------|---------|----------------------|
| Database | Aurora DSQL | "your database" (PostgreSQL) |
| Auth | Amazon Cognito | "the auth API" |
| Authorization | Cedar policies | "access policies" |
| Engine | pgrest-lambda (npm) | "the REST API" |
| Compute | AWS Lambda (Node.js 20.x) | "functions" |
| API | API Gateway (REST) | "your API" |
| Storage | Amazon S3 | "file storage" |
| Hosting | AWS Amplify | "frontend hosting" |
| IaC | SAM / CloudFormation | "deploy" / "your backend" |

## Target Audience

### Primary: Fullstack developer using AI coding agents

- Building side projects, prototypes, or early-stage products
- Already knows React/Vue/Next.js
- May have used Supabase or Firebase before
- Wants AWS but finds it intimidating
- Uses Claude Code, Copilot, Cursor, or similar to write code
- Wants to get to a working app fast, not read infrastructure docs

### Secondary: Developer who already knows AWS

- Knows Lambda, API Gateway, etc.
- Wants to understand what BOA adds on top
- Evaluating whether BOA's opinions are good ones
- Cares about architecture decisions and escape hatches

## Competitive Positioning

| | BOA | Supabase | Firebase | Amplify Gen 2 |
|---|---|---|---|---|
| You own the infrastructure | Yes | No | No | Partial |
| Scales to zero ($0 idle) | Yes | No ($25/mo min) | Partial | Yes |
| PostgreSQL | Yes (DSQL) | Yes | No (Firestore) | No (DynamoDB) |
| Agent-ready skill | Yes | No | No | No |
| Supabase-JS compatible | Drop-in | Native | No | No |
| No vendor lock-in | Yes | No | No | AWS only |

**We do not position against Supabase on the homepage.** Supabase is a valid choice. The comparison exists in the docs (FAQ) for developers evaluating their options. The homepage focuses on what BOA gives you, not what others don't.

## Nomenclature

See [GLOSSARY.md](GLOSSARY.md) for the full canonical glossary. Key rules:

- **developer** — the human building the app. Never "user" (ambiguous with end users).
- **agent** — the AI coding assistant. "Your agent deploys the backend."
- **backend** — what lives in the developer's AWS account. Not "stack" or "infrastructure" in developer-facing language.
- **access policies** — what controls who reads and writes what. Not "Cedar" or "RLS" in developer-facing language.
- **sign up** / **sign in** — never "login" or "registration."
- **the BOA skill** — what the agent learns. Not "plugin."
- **the BOA CLI** — the tool. The command is `boa`.

## Writing Standards

- No AI-sounding language, no buzzwords ("leverage", "empower", "seamlessly")
- Active voice, concise, plain English
- Every data point needs a source
- Lead with what the developer can do, not what the technology is
- Show `@supabase/supabase-js` first, raw HTTP second
- Assume the developer is smart but busy
- Every page has one clear next action, not a list of six links

## Launch

April 28, 2026 — website live, BOA skill available in Claude.

## Repository

[github.com/yoshuacas/boa](https://github.com/yoshuacas/boa) — Apache 2.0 license.
