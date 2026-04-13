# Task 03: Config Module

**Agent:** implementer
**Design:** docs/design/boa-cli.md

## Objective

Implement `cli/lib/config.mjs` for reading, writing, and
requiring `.boa/config.json`. This module is used by every
command that operates on an existing stack.

## Target Tests

From `cli/__tests__/config.test.mjs`:
- read() returns null for missing file
- read() returns parsed JSON for valid file
- write(config) creates `.boa/` directory and writes JSON
- write then read round-trip returns same config
- Written file ends with newline
- Written file uses 2-space indentation
- requireConfig() calls process.exit(1) when config missing
- requireConfig() prints error message to stderr when missing

## Implementation

Replace the stub in `cli/lib/config.mjs` with the full
implementation per the design's Config Module section:

```javascript
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_DIR = '.boa';
const CONFIG_FILE = 'config.json';

export function read(projectDir = process.cwd()) { ... }
export function write(config, projectDir = process.cwd()) { ... }
export function requireConfig(projectDir = process.cwd()) { ... }
```

Key behaviors:
- `read()` returns `null` on any error (file not found,
  parse error), never throws.
- `write()` creates `.boa/` with `{ recursive: true }` and
  writes pretty-printed JSON with trailing newline.
- `requireConfig()` prints the exact error message from the
  design and calls `process.exit(1)` if config is missing.

The config format must remain backwards-compatible with
configs written by `bootstrap.sh` (same field names, same
JSON structure).

## Acceptance Criteria

- All config.test.mjs tests pass.
- Existing tests still pass.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
