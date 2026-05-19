# Task 07: Init Scaffold and Function Templates

**Agent:** implementer
**Design:** docs/design/functions.md

## Objective

Update `boa init` to scaffold the `functions/hello/` example
directory and create the template files that serve as the
source for the scaffold.

## Target Tests

From `init-scaffolds-functions.test.mjs`:
- boa init creates functions/hello/index.mjs with correct
  handler shape (status 200, body with message, userId, role)
- boa init creates functions/hello/boa.json with
  {"visibility": "public"}
- Existing functions/ directory is not overwritten

## Implementation

### cli/templates/functions/hello/index.mjs

Create the template file:

```javascript
export default async function handler(req, ctx) {
  return {
    status: 200,
    body: {
      message: 'Hello from BOA Functions!',
      userId: ctx.userId,
      role: ctx.role,
    },
  };
}
```

### cli/templates/functions/hello/boa.json

```json
{
  "visibility": "public"
}
```

### cli/commands/init.mjs

After the existing scaffold steps (migrations/, policies/),
add:

```javascript
// Scaffold functions/hello/ example
const functionsDir = path.join(projectRoot, 'functions');
const helloDir = path.join(functionsDir, 'hello');

if (!fs.existsSync(functionsDir)) {
  fs.mkdirSync(functionsDir, { recursive: true });
  fs.mkdirSync(helloDir);
  fs.copyFileSync(
    path.join(templatesDir, 'functions/hello/index.mjs'),
    path.join(helloDir, 'index.mjs'),
  );
  fs.copyFileSync(
    path.join(templatesDir, 'functions/hello/boa.json'),
    path.join(helloDir, 'boa.json'),
  );
}
```

The key behavior: if `functions/` already exists, skip
entirely. Do not overwrite user's existing functions.

## Acceptance Criteria

- All `init-scaffolds-functions.test.mjs` tests pass
- Template files exist at
  `cli/templates/functions/hello/index.mjs` and
  `cli/templates/functions/hello/boa.json`
- The scaffold matches the design's exact content
- Existing tests still pass

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If `boa init` already creates a `functions/` directory
  through some other mechanism, investigate and adapt rather
  than duplicating.
