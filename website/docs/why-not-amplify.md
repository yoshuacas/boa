# Why BOA Over AWS Amplify?

## Research: AWS's Native Recommendation vs BOA's Gap

### What AWS Already Offers: Amplify Gen 2 + AppSync

If the goal is "easy backend for web apps without inventing new API patterns," AWS's first-party answer is **Amplify Gen 2**. Developers define their backend in TypeScript, and Amplify auto-generates:

- A fully managed **AppSync GraphQL API** (CRUD + real-time subscriptions)
- **Cognito auth** with configurable flows
- **S3 storage** with access rules
- **Lambda functions** for custom logic
- CI/CD hosting from Git, CDK under the hood

### Where Amplify Shines

- Zero API code to write — define a model, get an API
- Auth, storage, functions all unified in one framework
- AWS-managed, well-supported, large community

### Where Amplify Has Friction

1. **GraphQL-first, not REST.** Developers coming from Supabase, Firebase, or traditional backends expect REST or a simpler query language. GraphQL adds complexity many apps don't need.

2. **DynamoDB by default.** Relational / PostgreSQL requires custom AppSync resolvers or manual Aurora wiring. Most web developers think in SQL, not single-table design.

3. **Opinionated framework lock-in.** You're locked into Amplify's conventions. Ejecting is painful — the framework *is* the runtime.

4. **Agent-unfriendly.** AI coding agents struggle with Amplify's code-gen patterns and multi-step interactive CLI workflows. Amplify Gen 2 is better than Gen 1 here, but still has friction.

### The Gap BOA Fills

| Concern | Amplify Gen 2 | BOA |
|---------|--------------|-----|
| API style | GraphQL (AppSync) | REST (PostgREST-compatible) |
| Database | DynamoDB by default | PostgreSQL (Aurora DSQL) |
| Client library | Custom Amplify SDK | `@supabase/supabase-js` drop-in |
| AI agent ergonomics | Interactive CLI, code-gen | Declarative templates + shell scripts |
| Framework lock-in | High — Amplify is the runtime | None — produces standard SAM/CloudFormation |
| Learning curve | GraphQL + Amplify conventions | REST + SQL (what most developers already know) |

### Key Messaging Points for the Website

1. **"Most web developers already know REST and SQL."** BOA doesn't ask them to learn GraphQL or DynamoDB. It meets them where they are.

2. **"Your AI agent already knows how to build REST APIs."** Every coding agent has been trained on millions of REST examples. GraphQL and Amplify-specific patterns are niche by comparison.

3. **"No framework lock-in."** BOA produces standard AWS infrastructure (SAM, CloudFormation, Lambda, API Gateway). Stop using BOA tomorrow and nothing breaks — your backend is just AWS.

4. **"Supabase-compatible from day one."** Developers can use `@supabase/supabase-js` as their client library. Existing Supabase tutorials and patterns transfer directly.

5. **"Amplify is great — for the right use case."** BOA isn't anti-Amplify. If you want GraphQL + DynamoDB with a managed framework, Amplify Gen 2 is excellent. BOA is for the rest of us who want PostgreSQL + REST without the framework tax.
