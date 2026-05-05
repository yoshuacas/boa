# BOA Studio — Backlog

## SQL Editor

- [x] **Cmd+Enter to run query** — fixed via `editor.addCommand` in `onMount`, with a `useRef` to read current SQL without stale closure.
- [x] **Cell expansion** — Cells longer than 60 chars are clickable. Opens a modal with the full value, JSON pretty-printing, copy button, and Escape/backdrop to close.
- [x] **Query tabs** — Multiple tabs with independent SQL and results. Tabs persist across reloads via localStorage (SQL only, results cleared on reload). Close button appears on hover; last tab cannot be closed.

## General

- [ ] **Topbar config path is decorative** — Changing the path in the topbar doesn't affect server-side config loading. Needs to pass configPath through a cookie or URL param so server components re-fetch with the new path.
