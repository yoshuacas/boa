# Task 10: Documentation & Skill Updates

**Agent:** implementer
**Design:** docs/design/scheduled-functions.md

## Objective

Update all documentation and skill files to cover
scheduled functions: SKILL.md, FUNCTIONS.md, PITFALLS.md,
ARCHITECTURE.md, CLAUDE.md, AGENTS.md, website docs,
glossary, and CLI README.

## Target Tests

No automated tests target documentation. Validation is
manual: all referenced files exist and contain accurate
scheduled-functions content.

## Implementation

Update the following files per the design document's
"Documentation (last)" section:

### `plugin/skills/boa/SKILL.md`

Add a "Scheduled Functions" subsection within the
"Custom Functions" section. Cover:
- Adding `schedule`, `scheduleTimezone`, `scheduleInput`
  to `boa.json`
- Requirement that scheduled functions be private
- Example cron/rate/at expressions
- Handler receives `req.body._scheduledAt`

### `plugin/docs/FUNCTIONS.md`

Add a "Scheduled Functions" section with:
- Full schema (schedule, scheduleTimezone, scheduleInput)
- Expression syntax table (cron, rate, at)
- Handler experience (req/ctx shape)
- Example: weekday digest function

### `plugin/docs/PITFALLS.md`

Add schedule-specific failure modes:
- Schedule on public function (rejected at discovery)
- Invalid timezone abbreviation (use IANA names)
- EventBridge expression validation errors at deploy time
- Missing `_scheduledAt` if user tries to set it manually

### `plugin/docs/ARCHITECTURE.md`

Add EventBridge Scheduler row to the stack table:
- Service: EventBridge Scheduler
- Purpose: Scheduled function invocation
- Note: One schedule per function, IAM-scoped to
  FunctionsLambda

### `plugin/CLAUDE.md` and `plugin/AGENTS.md`

Update architecture diagram/description to include
EventBridge Scheduler as a trigger path alongside
API Gateway and direct invoke.

### `docs/GLOSSARY.md`

Add terms:
- **scheduled function** -- A BOA function with a
  `schedule` field that runs on a time-based trigger
- **EventBridge Scheduler** -- AWS service that triggers
  scheduled function invocations
- **schedule expression** -- A cron(...), rate(...), or
  at(...) string defining invocation cadence

### `website/docs/functions.html`

Add a "Scheduled Functions" section covering:
- How to add a schedule to a function
- Expression examples
- Deploy behavior

### `cli/README.md`

Add a brief scheduling paragraph in the functions section
describing the schedule field and deploy behavior.

### `plugin/skills/boa/evals/evals.json`

Add one eval scenario:
- Prompt: "Add a function that runs every weekday at
  9am Pacific and sends a digest email"
- Pass criteria: creates function with
  `visibility: "private"`,
  `schedule: "cron(0 9 ? * MON-FRI *)"`,
  `scheduleTimezone: "America/Los_Angeles"`, does not
  set public visibility, does not wire HTTP route

**Depends on:** Tasks 02-09 (all implementation complete;
never document what you haven't deployed)

## Acceptance Criteria

- All listed files updated with accurate content
- No references to unimplemented features
- Terminology matches `docs/GLOSSARY.md`
- No em-dashes used (per project feedback)
- Content is concise, active voice, plain English

## Conflict Criteria

- If any referenced file does not exist, create it only
  if it is listed in the design's "New Files" section.
  Otherwise escalate.
- If `SKILL.md` exceeds 500 lines after the addition,
  trim other sections or move detailed reference to
  `FUNCTIONS.md`.
