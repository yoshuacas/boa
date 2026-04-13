# BOA Glossary — Canonical Nomenclature

Use these terms consistently across all BOA materials: website, CLI output, skill instructions, docs, README, and agent communication.

## Product

| Term | Usage | Notes |
|------|-------|-------|
| **BOA** | The product name | Always uppercase |
| **Backend on AWS** | The tagline | Used once for explanation, then just BOA |
| **backend** | What lives in the developer's AWS account | "your backend is live", "deploy your backend" |
| **project** | The developer's local directory | Where migrations/, policies/, .boa/ live |

## The Four Pillars

| Term | Usage | Notes |
|------|-------|-------|
| **the BOA CLI** | The tool | "install the BOA CLI" |
| **`boa`** | The command | "run `boa init`" |
| **`boa-cli`** | npm package name only | Never in developer-facing prose |
| **the BOA skill** | What the agent learns | "install the BOA skill" |
| **plugin** | Only for Claude Code's directory mechanism | Never in developer-facing language |
| **guardrails** | The safety opinions | "BOA's guardrails prevent X" |
| **Safe by Default** | Section heading / principle name | |

## Keys & Tokens

| Term | Usage | Notes |
|------|-------|-------|
| **anon key** | The public-facing key for frontends | Config field: `anonKey` |
| **service role key** | The backend-only key that bypasses authorization | Config field: `serviceRoleKey` |
| **access token** | What sign-in returns | "the user's access token" |

## Authorization

| Term | Usage | Notes |
|------|-------|-------|
| **access policies** | What developers write for access control | "write access policies for your tables" |
| **deny by default** | No access policy = 403 | "tables deny all requests by default" |
| **roles** | The concept of request identity levels | Three values: anon, authenticated, service role |
| **Cedar** | The implementation engine | Technical docs only, never developer-facing |

## Schema & Data

| Term | Usage | Notes |
|------|-------|-------|
| **migrations** | SQL files in `migrations/` | "write a migration", "run your migrations" |
| **migration history** | The tracking system | "BOA tracks your migration history" |
| **the REST API** | Auto-generated endpoints for tables | "your tables are available through the REST API" |
| **PostgREST-compatible** | Technical detail | Only in docs explaining @supabase/supabase-js compatibility |
| **resource embedding** | Fetching related data in one request | `select('*, posts(*)')` |

## Auth

| Term | Usage | Notes |
|------|-------|-------|
| **the auth API** | The `/auth/v1/*` endpoints | "the auth API handles signup and sign-in" |
| **GoTrue-compatible** | Technical detail | Only in docs explaining @supabase/supabase-js compatibility |
| **sign up** / **signup** | Creating an account | Verb (two words) / noun (one word) |
| **sign in** / **signin** | Getting a session | Verb (two words) / noun (one word) |

## People

| Term | Usage | Notes |
|------|-------|-------|
| **developer** | The human building the app | Never "user" (ambiguous with end users) |
| **agent** | The AI (Claude Code, Kiro, Copilot, etc.) | "your agent deploys the backend" |

## Extensions

| Term | Usage | Notes |
|------|-------|-------|
| **extension** | Optional infrastructure added via `boa extend` | "add API Gateway with `boa extend api-gateway`" |
| **Lambda Function URL** | The default API endpoint (free, included in Lambda pricing) | No API Gateway required |
| **`boa extend <name>`** | Add an extension | "run `boa extend api-gateway`" |
| **`boa remove <name>`** | Remove an extension | "run `boa remove api-gateway`" |
| **`boa extensions`** | List available and enabled extensions | |

## Technical (internal docs only)

| Term | Usage | Notes |
|------|-------|-------|
| **pgrest-lambda** | The npm package that powers Lambda | Developer-facing: just say "your REST API" |
| **stack** | CloudFormation stack | Ok in CLI output and technical docs, not developer-facing |
| **infrastructure** | AWS resources | Ok internally, developer-facing: "your backend" |

## Anti-patterns

- Never say "user" when you mean the developer (ambiguous with end users)
- Never say "plugin" when you mean the BOA skill
- Never say "token" when you mean the anon key or service role key
- Never say "login" — use "sign in"
- Never say "registration" — use "sign up"
- Never say "Cedar" in developer-facing language — use "access policies"
- Never say "stack" in developer-facing language — use "backend"
- Never say "infrastructure" in developer-facing language — use "backend"
