# BOA CLI

Command-line tool for managing BOA serverless backends on AWS.

## Installation

```bash
npm install -g boa-cli
```

## Commands

| Command | Description |
|---------|-------------|
| `boa init <name>` | Create project and deploy backend |
| `boa deploy` | Rebuild and redeploy (Lambda, policies, functions) |
| `boa migrate` | Apply pending SQL migrations |
| `boa verify` | Check all backend components are correct |
| `boa status` | Show backend info, tables, pending migrations |
| `boa check` | Check required tools and AWS credentials |
| `boa extend <name>` | Add an optional extension |
| `boa remove <name>` | Remove an extension |
| `boa extensions` | List available and enabled extensions |
| `boa functions <action>` | Manage custom functions |
| `boa teardown` | Destroy everything (with confirmation) |
| `boa feedback` | Submit feedback |

## Functions Subcommands

### `boa functions list`

List all discovered functions with visibility and deployed
status.

```
$ boa functions list
Functions:

  hello           public    deployed
  stripe-webhook  private   deployed
  new-func        public    local only

Run 'boa deploy' to sync local changes.
```

Exit code is 1 if local and deployed state diverge.

### `boa functions invoke <name> [options]`

Invoke a deployed function.

Options:
- `--service` — Use service role key instead of anon key
- `--data <json>` — JSON payload to send

```bash
boa functions invoke hello
boa functions invoke hello --service --data '{"id": 42}'
```

### `boa functions logs <name> [options]`

View CloudWatch logs for a specific function.

Options:
- `--tail` — Stream logs in real time

```bash
boa functions logs hello
boa functions logs hello --tail
```

### `boa functions remove <name>`

Delete a function directory. Prints a reminder to redeploy.

```
$ boa functions remove hello
Removing function 'hello'...
  Deleted functions/hello/
  Run 'boa deploy' to update the deployed stack.
```

## Configuration

BOA stores project configuration in `.boa/config.json` after
`boa init`. This file contains the API URL, keys, region, stack
name, and deployed function registry.
