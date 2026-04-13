# Task 01: Unit Tests for BOA CLI Pure-Logic Modules

**Agent:** implementer
**Design:** docs/design/boa-cli.md

## Objective

Create unit test suites for all pure-logic modules in the BOA
CLI. The CLI shells out to AWS/SAM/psql for most operations,
but several modules contain testable logic with no external
dependencies. These tests establish the contract for subsequent
tasks.

## Test File Paths

Create the following test files under `cli/__tests__/`:

- `cli.test.mjs` -- CLI entry point behavior
- `keys.test.mjs` -- JWT key generation
- `config.test.mjs` -- Config read/write/require
- `validate.test.mjs` -- Stack name and region validation
- `checksum.test.mjs` -- SHA-256 file checksum

Use Node.js built-in `node:test` and `node:assert`. Zero
dependencies. The project uses `"type": "module"`.

## Test Cases

### cli.test.mjs

Run `bin/boa.mjs` as a subprocess using `child_process.execFile`
to test the CLI entry point.

- Given `boa --version`, when run, then prints the version
  string from package.json (e.g., `0.1.0`) and exits 0
- Given `boa -v`, when run, then prints the version string
  and exits 0
- Given `boa --help`, when run, then prints usage text
  containing "Commands:" and exits 0
- Given `boa -h`, when run, then prints usage text and exits 0
- Given `boa` with no arguments, when run, then prints usage
  text and exits 0
- Given `boa frobnicate` (unknown command), when run, then
  prints "Unknown command: frobnicate" to stderr and exits 1
- Given `boa frobnicate`, when run, then stderr contains
  "Run 'boa --help' for usage."
- Given `boa --help`, when run, then output lists all seven
  commands: init, deploy, migrate, verify, teardown, status,
  check
- Given `boa --help`, when run, then output contains
  "--version" and "--help" in the Options section

### keys.test.mjs

Import `generateKeys` from `../lib/keys.mjs`.

- Given a known secret, when generateKeys(secret), then
  returns an object with `anonKey` and `serviceRoleKey`
  properties
- Given the returned anonKey, when base64url-decoded, then
  the payload contains `role: "anon"`
- Given the returned anonKey, when decoded, then the payload
  contains `iss: "pgrest-lambda"`
- Given the returned anonKey, when decoded, then the payload
  contains an `exp` approximately 10 years from now
  (within 60 seconds tolerance)
- Given the returned anonKey, when decoded, then the payload
  contains an `iat` field
- Given the returned serviceRoleKey, when decoded, then the
  payload contains `role: "service_role"`
- Given the returned serviceRoleKey, when decoded, then the
  payload contains `iss: "pgrest-lambda"`
- Given the returned serviceRoleKey, when decoded, then the
  payload contains an `exp` approximately 10 years from now
- Given either key and the input secret, when HMAC-SHA256
  signature is recomputed over `header.payload`, then it
  matches the third JWT segment (signature verification)
- Given two calls to generateKeys with the same secret, when
  compared, then `iat` values may differ (time-dependent) but
  both keys are structurally valid

### config.test.mjs

Import `read`, `write`, `requireConfig` from `../lib/config.mjs`.
Use a temporary directory (via `fs.mkdtempSync`) for isolation.

- Given a directory with no `.boa/config.json`, when read(),
  then returns null
- Given a valid `.boa/config.json`, when read(), then returns
  the parsed JSON object
- Given config data, when write(config), then creates the
  `.boa/` directory and writes `config.json` with correct
  JSON content
- Given config data, when write(config) then read(), then
  returns the same config (round-trip)
- Given write(config), when the file is read as text, then
  it ends with a newline character
- Given write(config), when the file is read as text, then
  JSON is pretty-printed with 2-space indentation
- Given a directory with no config, when requireConfig() is
  called, then it calls `process.exit(1)` (mock process.exit
  or test via subprocess)
- Given a directory with no config, when requireConfig() is
  called, then it prints "Error: .boa/config.json not found.
  Run 'boa init' first." to stderr

### validate.test.mjs

Import validation functions from the init command module.
The init command must export `validateStackName` and
`validateRegion` for testability.

**Stack name validation:**
- Given "my-app", when validateStackName, then returns true
  (or does not throw)
- Given "test123", when validateStackName, then returns true
- Given "a", when validateStackName, then returns true
- Given "my-app-v2", when validateStackName, then returns true
- Given "My_App", when validateStackName, then returns false
  (or throws with message containing "lowercase letters,
  numbers, and hyphens")
- Given "test app", when validateStackName, then returns false
- Given "test@app", when validateStackName, then returns false
- Given "" (empty string), when validateStackName, then
  returns false
- Given "MY-APP", when validateStackName, then returns false
  (uppercase rejected)

**Region validation:**
- Given "us-east-1", when validateRegion, then returns true
- Given "us-east-2", when validateRegion, then returns true
- Given "eu-west-1", when validateRegion, then returns false
  (or throws with message containing "us-east-1 or us-east-2")
- Given "ap-southeast-1", when validateRegion, then returns
  false
- Given "" (empty string), when validateRegion, then returns
  false

### checksum.test.mjs

Import the SHA-256 function from the migrate command module.
The migrate command must export `sha256` for testability.

- Given a file with known content "hello world\n", when
  sha256(filePath), then returns the correct hex digest
  (sha256 of "hello world\n" =
  `a948904f2f0f479b8f8564e9d7a7e0e24e6e32e1bc3dcda1b2e6e29f37b3a259`... 
  verify the exact value)
- Given two files with identical content, when sha256 is
  called on each, then the digests match
- Given two files with different content, when sha256 is
  called on each, then the digests differ
- Given an empty file, when sha256(filePath), then returns
  the SHA-256 digest of empty content
  (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`)

Use `fs.mkdtempSync` and `fs.writeFileSync` to create
temporary test files.

## Setup Notes

- Use `node:test` and `node:assert` (built-in Node.js 20).
  Zero test dependencies.
- Each test file should be independently runnable with
  `node --test <file>`.
- For cli.test.mjs, use `child_process.execFile` to run
  `node bin/boa.mjs` as a subprocess and capture stdout,
  stderr, and exit code.
- For config.test.mjs, create a temp directory per test and
  clean up after.
- For validate.test.mjs: the init command should export
  `validateStackName(name)` and `validateRegion(region)` as
  named exports. These are pure functions that return a
  boolean or throw with a descriptive message. The test
  imports them directly.
- For checksum.test.mjs: the migrate command should export
  `sha256(filePath)` as a named export. This is a pure
  function using Node.js crypto.
- Create stub modules with the expected exports where needed
  to avoid import failures. Stubs should throw "not
  implemented" when called. Specifically:
  - `cli/lib/keys.mjs` -- export `generateKeys`
  - `cli/lib/config.mjs` -- export `read`, `write`,
    `requireConfig`
  - `cli/commands/init.mjs` -- export `validateStackName`,
    `validateRegion`, and default export
  - `cli/commands/migrate.mjs` -- export `sha256` and
    default export
  - `cli/bin/boa.mjs` -- minimal entry point that reads
    package.json for --version. Must use dynamic import
    (not static) for command modules so that --version,
    --help, and unknown-command tests work without all
    command stubs present.
  - `cli/package.json` -- with version `"0.1.0"`

## Acceptance Criteria

- All test files are syntactically valid and can be loaded
  by Node.js without import errors.
- All tests fail with clear assertion messages indicating
  what is missing or not yet implemented.
- No test panics or produces cryptic stack traces.
- Running `node --test cli/__tests__/*.test.mjs` executes
  all test suites.

## Conflict Criteria

- If any test that should fail instead passes, first
  diagnose why by following the "Unexpected test results"
  steps in the implementer prompt: investigate the code
  path, verify the assertion targets the right behavior,
  and attempt to rewrite the test to isolate the intended
  path. Only escalate if you cannot construct a well-formed
  test that targets the desired behavior.
