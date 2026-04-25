# Task 05: Claude Code Deny Rule

**Agent:** implementer
**Design:** docs/design/safe-teardown.md

## Objective

Update `boa init` to write a `deny` rule for
`boa teardown` in `.claude/settings.json`, so Claude Code
prompts for human approval instead of auto-executing
teardown.

## Target Tests

From Task 01 (`cli/__tests__/teardown.test.mjs`):

- "init writes deny rule for boa teardown"
- "deny array precedes allow array in settings output"

## Implementation

**File:** `cli/commands/init.mjs`

### Update settings.json output

At lines 467-476, the `writeFileSync` call writes a
permissions object with only an `allow` array. Add a
`deny` array containing `'Bash(boa teardown*)'`:

```javascript
writeFileSync(claudeSettingsPath, JSON.stringify({
  permissions: {
    allow: [
      'Bash(boa *)',
      'Bash(npm install*)',
      'Bash(npx vite*)',
      'Bash(npx serve*)',
    ],
    deny: [
      'Bash(boa teardown*)',
    ],
  },
}, null, 2) + '\n');
```

### Update ok message

Change the `ok()` message on the line after
`writeFileSync` from:

```javascript
ok('.claude/settings.json written (boa commands auto-approved)');
```

to:

```javascript
ok('.claude/settings.json written (boa commands auto-approved, teardown requires human approval)');
```

## Acceptance Criteria

- Target tests pass
- Existing tests still pass
- `boa init` output includes the updated ok message
- The generated `.claude/settings.json` has the exact
  structure shown above (deny array with one entry)

## Conflict Criteria

If `init.mjs` already contains a `deny` array in the
settings output, investigate whether this task has
already been implemented. Escalate if the deny rule
differs from the design specification.
