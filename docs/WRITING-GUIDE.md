# BOA Writing Guide

Rules for writing documentation, website copy, and any developer-facing text. These are derived from reviewing actual pages and finding violations. Every rule here exists because we got it wrong at least once.

This file supplements [PRODUCT.md](PRODUCT.md) (value proposition, positioning) and [GLOSSARY.md](GLOSSARY.md) (canonical terms). Read both before writing anything.

---

## Rule 1: Follow the glossary. No exceptions.

The glossary defines canonical terms. If the glossary says "backend" not "stack", every page uses "backend". If the glossary says "sign up" (two words), no page writes "signup" or "sign-up" in prose.

**This is not optional.** Every piece of text — docs, website, CLI output, error messages — must use glossary terms. Before publishing any page, search for glossary anti-patterns and fix them.

Common violations found in our own docs:
- "stack" instead of "backend"
- "infrastructure" instead of "backend"  
- "plugin" instead of "the BOA skill"
- "users" when meaning the developer's customers (use "customers" to avoid ambiguity)
- "login" instead of "sign in"
- "Cedar" in developer-facing text instead of "access policies"
- AWS service names where developer-facing terms should be used (e.g., "Cognito authorization" instead of "built-in auth")

---

## Rule 2: Three levels of technical detail for service names.

Not every page needs the same level of detail. Service names have three levels:

| Level | When to use | Example |
|-------|-------------|---------|
| **Developer-facing** | Getting started, tutorials, homepage, most docs | "your database", "the REST API", "file storage" |
| **Technical** | Architecture docs, pages explaining how something works under the hood | "PostgreSQL database", "PostgREST-compatible API" |
| **Implementation** | Architecture document only (the one page that explains what's inside) | "Aurora DSQL", "Amazon Cognito", "pgrest-lambda" |

**The database specifically:**
- Most docs: "your database" or "the database"
- Technical context: "PostgreSQL" (e.g., "your database is PostgreSQL, so you write standard SQL")
- Architecture page only: "Aurora DSQL"

**Apply this to every service.** Don't say "Amazon S3" when "file storage" is enough. Don't say "Lambda Function URL" when "your API endpoint" is enough. The architecture page is the one place where we name every AWS service — everywhere else, use developer-facing terms.

---

## Rule 3: No AWS marketing language.

We are not selling AWS services. We are telling developers what their backend does. Avoid words like "managed", "fully managed", "enterprise-grade", "scalable", "robust" — these are AWS product page filler.

**Bad:** "managed auth", "managed sign-up/sign-in", "serverless PostgreSQL engine"
**Good:** "authentication", "sign up and sign in", "your database"

If it sounds like it belongs on an AWS product page, rewrite it in plain language.

---

*More rules will be added as we review each page.*
