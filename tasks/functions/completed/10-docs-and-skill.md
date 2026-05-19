# Task 10: Documentation and Skill Updates

**Agent:** implementer
**Design:** docs/design/functions.md

## Objective

Update all documentation and skill files to reflect the
Functions feature: plugin docs, skill reference, glossary,
product page, and website.

## Target Tests

No automated tests target this task directly. Acceptance
is based on content correctness and completeness.

## Implementation

### plugin/skills/boa/SKILL.md

Add a "Custom Functions" section describing:
- File structure (`functions/<name>/index.mjs`)
- `boa.json` configuration options
- The `ctx` object (role, userId, db, boa, logger, env)
- Visibility (public vs private)
- CLI commands (list, invoke, logs, remove)
- Key guidance: use `ctx.db` for caller-scoped access,
  `ctx.boa.db()` only when elevation is needed

### plugin/docs/FUNCTIONS.md

Replace the existing placeholder with the full reference:
- Handler signature and req/ctx shape
- boa.json fields with types and defaults
- Naming rules and reserved names
- Routing and visibility rules
- Token model table
- Context helpers with examples
- Secrets via SSM workflow
- Error response shape
- Troubleshooting common issues

### plugin/docs/ARCHITECTURE.md

Add a "Functions" row to the stack table:
- Layer: Compute (Custom)
- Service: Lambda (FunctionsLambda)
- Notes: Shared Lambda for user functions, single log group

### plugin/docs/PITFALLS.md

Add function-specific failure entries:
- Missing SSM secret blocks deploy
- Private function returns 404 via API Gateway (not an error)
- Large zip (50+ functions) may hit Lambda size limit
- ctx.db is lazy -- pool errors surface on first query, not
  on function invocation

### plugin/CLAUDE.md

Add to Architecture section:
- FunctionsLambda entry in Key Files
- `cli/lib/functions/` directory description

### plugin/AGENTS.md

Same updates as CLAUDE.md for cross-agent compatibility.

### docs/GLOSSARY.md

Add terms:
- **Function** -- Custom server-side code at
  `functions/<name>/index.mjs`
- **FunctionsLambda** -- Shared Lambda running all user
  functions
- **ctx** -- Context object passed to function handlers
- **Private function** -- Function only callable via direct
  Lambda invoke or ctx.boa.functions.invoke()

### docs/PRODUCT.md

Add Functions to the capabilities list. One sentence
describing the value: custom server-side logic without
CloudFormation expertise.

### website/docs/functions.html

Create a human-readable reference page covering the same
content as `plugin/docs/FUNCTIONS.md` but formatted for the
website's HTML structure.

### cli/README.md

Document `boa functions` subcommands with usage examples.

## Acceptance Criteria

- All listed files are updated or created
- Content matches what was actually built (references real
  types, paths, and behaviors)
- No broken links or references to non-existent files
- Existing tests still pass (documentation changes should
  not break anything)

## Conflict Criteria

- If any referenced file does not exist yet (e.g., a
  previous task did not create it), note the gap and
  document what exists rather than what was planned.
- Docs describe what was built, not what was designed. If
  the implementation diverged from the design, document the
  implementation.
