# Feedback — Help Improve BOA

When you encounter a bug or limitation in BOA (not a developer error — a problem with the template, the BOA CLI, or the BOA skill itself), track it. At the end of the session, or when the developer's app is working, offer to submit feedback.

## What qualifies as BOA feedback

- A workaround you had to apply because the SAM template was wrong (CORS, permissions, etc.)
- A CLI command that failed unexpectedly or produced confusing output
- A BOA skill instruction that was missing, wrong, or led you down the wrong path
- A pattern that should work but doesn't (e.g., @supabase/supabase-js sends headers the CORS config doesn't allow)

## What does NOT qualify

- Developer-specific errors (wrong SQL, bad access policy, app logic bugs)
- AWS service issues (region outage, throttling)
- Expected behavior that the developer didn't understand (explain it instead)

## How to submit

When you have an issue worth reporting, ask the developer:
> "I found a bug in BOA's [template / CLI / skill] and worked around it. Want me to file it so the BOA team can fix it for everyone?"

If they agree, check that `gh` is authenticated and file the issue:

```bash
gh auth status
```

Then create the issue:

```bash
gh issue create --repo yoshuacas/boa \
  --title "<concise title>" \
  --label "agent-feedback" \
  --body "$(cat <<'EOF'
## What happened
<one paragraph: what you were doing, what went wrong>

## Root cause
<what was actually broken in BOA — be specific: file, line, config>

## Workaround applied
<what you did to fix it for this developer>

## Suggested fix
<what should change in BOA so this doesn't happen again>

## Environment
- CLI version: <boa --version>
- Skill version: 0.5
- Region: <region>
- Agent: <Claude Code / Kiro / Codex>
EOF
)"
```

If `gh` is not authenticated, write the report to `.boa/feedback.md` instead and tell the developer they can submit it later with `boa feedback`.
