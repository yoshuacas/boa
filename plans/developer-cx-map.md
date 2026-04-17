# BOA Developer CX Map — Complete Task Tracker

## Context

This document maps every task a developer needs when building web applications with BOA, from discovery through production operations. For each task, developers should be able to do it manually OR ask their agent. The skill + supporting docs are the agent's knowledge base.

## Legend
- **Status**: DONE = fully covered, PARTIAL = mentioned but incomplete, MISSING = not addressed
- **Where**: Which file(s) cover this today (or should cover it)
- **Priority**: P0 = blocks "create a backend", P1 = needed within first week, P2 = needed for production, P3 = nice to have

---

## Phase 0: Discovery & Installation

| # | Task | Status | Where Today | Priority |
|---|------|--------|-------------|----------|
| 0.1 | Discover BOA exists | DONE | website/index.html | — |
| 0.2 | Understand what BOA gives me vs Supabase | DONE | website, FAQ | — |
| 0.3 | Install the plugin in my agent | DONE | website/docs/getting-started.md, install.html | — |
| 0.4 | "Create a backend for my app" (trigger phrase) | DONE | SKILL.md Quick Start | P0 |

## Phase 1: First Backend (Day 1)

| # | Task | Status | Where Today | Priority |
|---|------|--------|-------------|----------|
| 1.1 | Check/install prerequisites (AWS CLI, SAM, Node, psql, jq) | DONE | SKILL.md Step 1 | P0 |
| 1.2 | Set up AWS credentials (`aws login`) | DONE | SKILL.md Step 1c | P0 |
| 1.3 | Deploy the full stack (one command) | DONE | boa init, SKILL.md Step 2 | P0 |
| 1.4 | Understand what was created and where | DONE | .boa/config.json, dashboard | P0 |
| 1.5 | Open the dashboard to see my backend | DONE | SKILL.md Dashboard | P1 |

## Phase 2: Data Model (Day 1-2)

| # | Task | Status | Where Today | Priority |
|---|------|--------|-------------|----------|
| 2.1 | Design a schema for my app | PARTIAL | ARCHITECTURE.md (5 app types) | P0 |
| 2.2 | Write migration files | DONE | SKILL.md Step 3, MIGRATIONS.md | P0 |
| 2.3 | Run migrations | DONE | boa migrate | P0 |
| 2.4 | Add a new table to existing schema | DONE | MIGRATIONS.md | P0 |
| 2.5 | Add/remove/rename columns | DONE | MIGRATIONS.md common patterns | P0 |
| 2.6 | Add indexes for performance | PARTIAL | DSQL-PATTERNS.md | P1 |
| 2.7 | Understand DSQL limitations | DONE | DSQL-PATTERNS.md, PITFALLS.md | P1 |
| 2.8 | Seed the database with test data | MISSING | — | P1 |
| 2.9 | Reset database to clean state | MISSING | — | P1 |
| 2.10 | View current schema / list tables | MISSING | — | P1 |

## Phase 3: Authorization (Day 2)

| # | Task | Status | Where Today | Priority |
|---|------|--------|-------------|----------|
| 3.1 | Understand the default authorization model | DONE | POLICIES.md, SKILL.md Step 4 | P0 |
| 3.2 | Write Cedar policies for my tables | DONE | POLICIES.md (4 examples) | P0 |
| 3.3 | Deploy updated policies | DONE | boa deploy | P0 |
| 3.4 | "Explain what policies apply to this table" | PARTIAL | POLICIES.md explaining section | P1 |
| 3.5 | "Can user X do action Y on table Z?" (trace a request) | MISSING | — | P1 |
| 3.6 | Debug a 403 — why was my request denied? | MISSING | — | P1 |
| 3.7 | Add public access to specific tables | DONE | POLICIES.md (public read example) | P0 |
| 3.8 | Add role-based access control | DONE | POLICIES.md (role-based example) | P1 |

## Phase 4: Frontend Integration (Day 2-3)

| # | Task | Status | Where Today | Priority |
|---|------|--------|-------------|----------|
| 4.1 | Connect frontend with @supabase/supabase-js | DONE | SKILL.md Step 5, REST-API.md | P0 |
| 4.2 | Sign up / sign in users | DONE | SKILL.md Auth section | P0 |
| 4.3 | CRUD operations from the frontend | DONE | REST-API.md | P0 |
| 4.4 | Upload files from the frontend | PARTIAL | STORAGE-PATTERNS.md | P1 |
| 4.5 | Handle auth state (session, refresh tokens) | PARTIAL | AUTH-PATTERNS.md | P1 |
| 4.6 | Protect frontend routes (auth guards) | MISSING | — | P1 |
| 4.7 | Show loading/error states for API calls | MISSING | — | P2 |
| 4.8 | Pagination UI patterns | MISSING | — | P2 |
| 4.9 | Real-time subscriptions (WebSocket) | PARTIAL | ARCHITECTURE.md chat app schema | P2 |
| 4.10 | Configure Vite/Next.js/Vue for BOA | PARTIAL | SKILL.md Vite polyfill only | P1 |

## Phase 5: Add Features (Week 1-2)

| # | Task | Status | Where Today | Priority |
|---|------|--------|-------------|----------|
| 5.1 | "Add file uploads to my app" | PARTIAL | STORAGE-PATTERNS.md | P1 |
| 5.2 | "Add a new endpoint/table" | DONE | MIGRATIONS.md + REST-API.md | P0 |
| 5.3 | "Add social login (Google, Apple)" | PARTIAL | AUTH-PATTERNS.md | P2 |
| 5.4 | "Add MFA/2FA" | PARTIAL | AUTH-PATTERNS.md | P2 |
| 5.5 | "Add search to my app" | PARTIAL | DSQL-PATTERNS.md full-text search | P1 |
| 5.6 | "Add email notifications" | MISSING | — (SES integration) | P2 |
| 5.7 | "Add scheduled jobs (cron)" | MISSING | — (EventBridge) | P2 |
| 5.8 | "Add webhooks" | MISSING | — | P2 |
| 5.9 | "Add rate limiting" | PARTIAL | API-PATTERNS.md usage plans | P2 |
| 5.10 | "Add a custom Lambda for business logic" | PARTIAL | API-PATTERNS.md | P1 |
| 5.11 | "Add a custom domain for my API" | MISSING | — | P2 |

## Phase 6: Testing & Local Dev (Week 1-2)

| # | Task | Status | Where Today | Priority |
|---|------|--------|-------------|----------|
| 6.1 | Test API endpoints locally before deploying | MISSING | — | P1 |
| 6.2 | Run migrations against a local database | MISSING | — | P1 |
| 6.3 | Test Cedar policies locally | MISSING | — | P1 |
| 6.4 | Seed test data for development | MISSING | — | P1 |
| 6.5 | Debug Lambda function errors | MISSING | — | P1 |
| 6.6 | View Lambda logs | PARTIAL | dashboard/functions.html (CLI cmd) | P1 |
| 6.7 | Test auth flows (signup, signin, token refresh) | PARTIAL | getting-started.md (curl examples) | P1 |

## Phase 7: Deploy & Iterate (Ongoing)

| # | Task | Status | Where Today | Priority |
|---|------|--------|-------------|----------|
| 7.1 | Redeploy after code/policy changes | DONE | boa deploy | P0 |
| 7.2 | Deploy schema changes (new migrations) | DONE | boa migrate | P0 |
| 7.3 | View deployment status | PARTIAL | CloudFormation outputs | P1 |
| 7.4 | Rollback a bad deployment | MISSING | — | P1 |
| 7.5 | Set up CI/CD (auto-deploy on push) | MISSING | — | P2 |
| 7.6 | Manage multiple environments (dev/staging/prod) | MISSING | — | P2 |
| 7.7 | Deploy frontend to Amplify | PARTIAL | SKILL.md mentions Amplify | P1 |
| 7.8 | Configure custom domain + SSL | MISSING | — | P2 |

## Phase 8: Monitor & Operate (Production)

| # | Task | Status | Where Today | Priority |
|---|------|--------|-------------|----------|
| 8.1 | View API request logs | PARTIAL | dashboard CLI commands | P1 |
| 8.2 | Set up CloudWatch alarms (errors, latency) | MISSING | — | P2 |
| 8.3 | Monitor costs / set budget alerts | MISSING | — | P2 |
| 8.4 | Track API usage / rate limits | MISSING | — | P2 |
| 8.5 | Database connection monitoring | MISSING | — | P2 |
| 8.6 | Set up structured logging | MISSING | — | P2 |

## Phase 9: Scale & Harden (Growth)

| # | Task | Status | Where Today | Priority |
|---|------|--------|-------------|----------|
| 9.1 | Optimize slow queries | PARTIAL | DSQL-PATTERNS.md indexes | P2 |
| 9.2 | Add caching (API response caching) | MISSING | — | P2 |
| 9.3 | Configure WAF / DDoS protection | MISSING | — | P3 |
| 9.4 | Security audit / hardening checklist | MISSING | — | P2 |
| 9.5 | CORS fine-tuning (restrict origins) | PARTIAL | backend.yaml has wildcard | P2 |
| 9.6 | Data backup and restore | MISSING | — | P2 |
| 9.7 | Rotate secrets (JWT secret, API keys) | MISSING | — | P2 |

## Phase 10: Troubleshooting (Anytime)

| # | Task | Status | Where Today | Priority |
|---|------|--------|-------------|----------|
| 10.1 | "My API returns 500" | PARTIAL | PITFALLS.md | P0 |
| 10.2 | "My API returns 403" | PARTIAL | PITFALLS.md, but no Cedar debug | P1 |
| 10.3 | "CORS error in the browser" | DONE | PITFALLS.md | P0 |
| 10.4 | "Users can't sign up" | DONE | PITFALLS.md (3 auth pitfalls) | P0 |
| 10.5 | "Database connection timeout" | DONE | PITFALLS.md | P1 |
| 10.6 | "Deploy failed" | PARTIAL | PITFALLS.md (3 deploy pitfalls) | P1 |
| 10.7 | "Amplify shows blank page" | DONE | PITFALLS.md | P1 |
| 10.8 | "My migration failed" | PARTIAL | MIGRATIONS.md | P1 |
| 10.9 | "How much is this costing me?" | MISSING | — | P1 |
| 10.10 | "Data looks wrong / query returns unexpected results" | MISSING | — | P1 |

---

## Coverage Summary

| Phase | Total Tasks | DONE | PARTIAL | MISSING |
|-------|------------|------|---------|---------|
| 0. Discovery & Install | 4 | 4 | 0 | 0 |
| 1. First Backend | 5 | 5 | 0 | 0 |
| 2. Data Model | 10 | 5 | 2 | 3 |
| 3. Authorization | 8 | 4 | 1 | 3 |
| 4. Frontend Integration | 10 | 3 | 4 | 3 |
| 5. Add Features | 11 | 2 | 5 | 4 |
| 6. Testing & Local Dev | 7 | 0 | 2 | 5 |
| 7. Deploy & Iterate | 8 | 3 | 1 | 4 |
| 8. Monitor & Operate | 6 | 0 | 1 | 5 |
| 9. Scale & Harden | 7 | 0 | 2 | 5 |
| 10. Troubleshooting | 10 | 4 | 3 | 3 |
| **TOTAL** | **86** | **30 (35%)** | **21 (24%)** | **35 (41%)** |

## Priority Distribution

| Priority | Count | Status Breakdown |
|----------|-------|-----------------|
| P0 | 20 | 18 DONE, 2 PARTIAL, 0 MISSING |
| P1 | 34 | 8 DONE, 12 PARTIAL, 14 MISSING |
| P2 | 28 | 2 DONE, 6 PARTIAL, 20 MISSING |
| P3 | 1 | 0 DONE, 1 MISSING |

**P0 is essentially complete.** The main work is P1 (first-week experience) and P2 (production readiness).

---

## What to Build Next (P1 MISSING tasks)

### New docs needed (agent reads on demand):

| Doc | Covers Tasks | Description |
|-----|-------------|-------------|
| `docs/LOCAL-DEV.md` | 6.1, 6.2, 6.3, 6.4, 6.5 | Local testing with sam local, local PostgreSQL, Cedar policy testing, seed data, Lambda debugging |
| `docs/FRONTEND-PATTERNS.md` | 4.6, 4.10 | Auth guards (React/Vue/Next.js), framework-specific setup, protected routes |
| `docs/TROUBLESHOOTING.md` | 3.5, 3.6, 10.2, 10.9, 10.10 | Cedar request tracing, 403 debugging, cost checking, data debugging |

### New scripts needed:

| Script | Covers Tasks | Description |
|--------|-------------|-------------|
| `scripts/seed.sh` | 2.8, 6.4 | Run SQL seed files from a `seeds/` directory, similar to `boa migrate` |
| `scripts/local.sh` | 6.1 | Wrapper around `sam local start-api` with correct env vars from .boa/config.json |
| `scripts/status.sh` | 2.10, 7.3 | List tables/columns via psql introspection, show stack status, recent deploys |

### Existing docs to expand (PARTIAL → DONE):

| Doc | Covers Tasks | What to Add |
|-----|-------------|-------------|
| DSQL-PATTERNS.md | 2.6 | Index design decision guide |
| STORAGE-PATTERNS.md | 4.4, 5.1 | Frontend upload component examples with @supabase/supabase-js |
| AUTH-PATTERNS.md | 4.5 | Session management, token refresh patterns, auth state hooks |
| PITFALLS.md | 3.6, 10.2 | Cedar 403 debugging flowchart |
| MIGRATIONS.md | 10.8 | Common migration failure causes and fixes |

### SKILL.md additions:

| Covers Tasks | What to Add |
|-------------|-------------|
| 5.10 | Reference to custom Lambda handler pattern in API-PATTERNS.md |
| 7.7 | Amplify frontend deploy step (git push to Amplify) |
| 8.1, 6.6 | Lambda log tailing command in a "Debugging" section |
| 7.4 | Rollback command (CloudFormation stack rollback) |

---

## Backlog: Key Management & Security Hardening

Issues identified during live deploy testing (2026-04-12). Not blocking launch but should be addressed before production use.

| # | Issue | Risk | Notes |
|---|-------|------|-------|
| B.1 | JWT secret stored as plain String in SSM (not SecureString) | Medium | CloudFormation can't resolve SecureString into Lambda env vars. Alternative: read from SSM at Lambda cold start instead of env var. |
| B.2 | `.boa/config.json` contains serviceRoleKey in plaintext on disk | Medium | If accidentally committed to git, key is exposed. Add `.boa/` to `.gitignore` template. Consider splitting secrets to a separate file. |
| B.3 | No secret rotation mechanism | Low (pre-launch) | anon/service keys are valid for 10 years. No script to rotate JWT secret + regenerate keys without downtime. |
| B.4 | `boa init` re-bootstrap regenerates keys, invalidating existing ones | Low | `boa deploy` preserves keys, but a full re-bootstrap breaks all existing clients. Document this or add a `--keep-keys` flag. |
| B.5 | No `.gitignore` template provided | Medium | Developers may commit `.boa/config.json` (contains keys) or `node_modules/`. Skill should create a `.gitignore` during setup. |
| B.6 | Linux install missing `unzip` | Low | Ubuntu doesn't have `unzip` by default. AWS CLI install fails. Add `sudo apt-get install -y unzip` before AWS CLI curl command. |
