# BOA Skill Evaluations

Test the BOA skill against real-world scenarios to verify it produces working backends.

## Structure

```
evals/
├── scenarios/     # Natural-language prompts (what a developer would say)
├── rubrics/       # Success criteria (what a working backend looks like)
└── harness/       # Scripts to run evaluations
```

## How to run

```bash
# Run a single scenario
./harness/run-eval.sh scenarios/todo-app.md

# Run all scenarios
for f in scenarios/*.md; do ./harness/run-eval.sh "$f"; done
```

## What gets tested

Each scenario is a prompt that an agent with BOA installed would receive. The harness:

1. Creates a temporary project directory
2. Runs the agent with the scenario prompt and BOA plugin
3. Checks the output against all rubrics
4. Reports pass/fail per rubric

## Adding new scenarios

Create a `.md` file in `scenarios/` with the exact prompt a developer would give their agent. Keep it realistic — one or two sentences, like a real developer would type.

## Adding new rubrics

Create a `.md` file in `rubrics/` with:
- **Check name**: What we're verifying
- **How to verify**: Shell commands or file checks
- **Pass condition**: What success looks like
- **Fail condition**: What failure looks like
