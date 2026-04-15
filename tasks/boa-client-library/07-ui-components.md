# Task 07: Auth UI Web Components

**Agent:** implementer
**Design:** docs/design/boa-client-library.md
**Depends on:** Task 04, Task 05

## Objective

Implement the `<boa-auth>` and `<boa-user-menu>` web
components as a separate entry point at
`@boa-cloud/client/ui`.

## Target Tests

These components require a DOM environment. Web component
tests should use a lightweight DOM shim or be structured
to run in a browser test runner. If node:test alone cannot
test custom elements, document the limitation and provide
manual test instructions.

Expected behaviors:
- `<boa-auth>` renders shadow DOM with email/password form.
- Submit in sign-in mode calls `client.auth.signIn(...)`.
- Submit in sign-up mode calls `client.auth.signUp(...)`.
- Toggle switches between sign-in and sign-up modes.
- Success fires `boa-auth-success` CustomEvent with
  `{ user, session }`.
- Error fires `boa-auth-error` CustomEvent with `{ error }`.
- Error message displayed below the form.
- `<boa-user-menu>` shows email when authenticated.
- `<boa-user-menu>` is empty when no session.
- Sign out button calls `client.auth.signOut()`.
- `boa-signed-out` CustomEvent fires after sign out.
- `<boa-user-menu>` updates reactively via
  `onAuthStateChange`.

## Implementation

### client/src/ui/auth.ts -- `<boa-auth>`

**Class:** `BoaAuthElement extends HTMLElement`

**Observed attributes:** `api-url`, `anon-key`

**Properties:**
- `client` (BoaClient | null): set via JS property, not
  attribute. If set, used instead of creating from
  attributes.

**Lifecycle:**
- `connectedCallback()`:
  1. If no `client` property, create one from `api-url`
     and `anon-key` attributes.
  2. Create shadow root (`mode: 'open'`).
  3. Render the auth form.

**Shadow DOM structure:**
```html
<style>
  :host { display: block; font-family: var(--boa-font-family, system-ui, sans-serif); }
  /* Form styles using CSS custom properties */
</style>
<form>
  <input type="email" placeholder="Email" required />
  <input type="password" placeholder="Password" required />
  <button type="submit">Sign in</button>
  <p class="toggle">
    Don't have an account? <a href="#">Sign up</a>
  </p>
  <p class="error" hidden></p>
</form>
```

**CSS custom properties:**
- `--boa-font-family` (default: `system-ui, sans-serif`)
- `--boa-primary-color` (default: `#2563eb`)
- `--boa-error-color` (default: `#dc2626`)
- `--boa-border-radius` (default: `6px`)
- `--boa-input-border` (default: `#d1d5db`)

**Behavior:**
- Toggle link switches between sign-in/sign-up mode.
  Button text changes to "Sign up" / "Sign in". Toggle
  text changes accordingly.
- On submit:
  - Sign-in: `client.auth.signIn({ email, password })`.
  - Sign-up: `client.auth.signUp({ email, password })`.
- On success: dispatch `boa-auth-success` CustomEvent
  with `detail: { user, session }` (bubbles, composed).
- On error: display error message in `.error` paragraph.
  Dispatch `boa-auth-error` CustomEvent with
  `detail: { error }` (bubbles, composed).

### client/src/ui/user-menu.ts -- `<boa-user-menu>`

**Class:** `BoaUserMenuElement extends HTMLElement`

**Properties:**
- `client` (BoaClient, required): set via JS property.

**Lifecycle:**
- `connectedCallback()`:
  1. Create shadow root (`mode: 'open'`).
  2. Call `client.auth.getUser()` to check initial state.
  3. Subscribe to `client.auth.onAuthStateChange` to
     update reactively.
  4. Render based on auth state.

- `disconnectedCallback()`:
  1. Call `unsubscribe()` to clean up the listener.

**Shadow DOM (signed in):**
```html
<style>
  :host { display: inline-flex; align-items: center; gap: 8px; }
</style>
<span class="email">user@example.com</span>
<button class="signout">Sign out</button>
```

**Shadow DOM (not signed in):**
Empty shadow root (nothing rendered).

**Behavior:**
- Sign out button: calls `client.auth.signOut()`.
- After sign out: dispatches `boa-signed-out` CustomEvent
  (bubbles, composed). Clears the shadow DOM.
- On `SIGNED_IN` / `TOKEN_REFRESHED`: re-render with user
  email.
- On `SIGNED_OUT`: clear shadow DOM.

### client/src/ui/index.ts

```typescript
import './auth.js'
import './user-menu.js'
```

Register the custom elements (registration happens in
each component file via `customElements.define`).

### package.json exports

The `client/package.json` `exports` field should already
include the `./ui` entry point from the design:
```json
"./ui": {
  "import": "./dist/ui/index.mjs",
  "types": "./dist/ui/index.d.ts"
}
```

Verify this is present. If Task 01 created the
package.json without it, add it now.

## Size Target

Both UI components combined should be under 5KB gzipped.
Keep styling minimal. No external CSS dependencies.

## Acceptance Criteria

- `<boa-auth>` renders a functional sign-in/sign-up form
  in shadow DOM.
- `<boa-user-menu>` shows the authenticated user's email
  and a sign out button.
- Both components fire the documented CustomEvents.
- CSS custom properties allow theming.
- Components are registered via `customElements.define`.
- `@boa-cloud/client/ui` import path works via package.json
  exports.
- All existing tests still pass.

## Conflict Criteria

- If node:test cannot test custom elements and no DOM shim
  is feasible, document manual testing steps rather than
  escalating. The components are thin wrappers around the
  already-tested auth module.
- If the BoaClient API from Task 05 differs from what the
  components expect, adapt the components to match.
