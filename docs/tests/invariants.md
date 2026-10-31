# spec/invariants.test.ts

Ships with the template. These are the two things the course relies on —
**keep them, don't delete them**. They run against the running app over HTTP
(via `spec/global-setup.ts`), not as unit tests.

| Test | What it checks |
|---|---|
| `answers at /` | `GET /` returns `200`. This is what the deploy and the crit capture read. |
| `publishes README.md at /readme/` | `/readme/` renders `README.md`. Since markdown renderers differ, it doesn't compare exact text — it extracts each ATX heading (`#`–`######`) from `README.md` and checks that each one appears, in order, in the page's rendered text (links/inline HTML stripped, case/punctuation normalised). |

A red run here blocks the deploy in CI (built from the `Dockerfile`, throwaway `/data`).
