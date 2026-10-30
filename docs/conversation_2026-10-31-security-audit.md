# Conversation log

Written: 2026-10-31

A summary of this Claude Code session, not a verbatim transcript.

## User prompt
- Asked whether there's anything needing attention from a privacy/security,
  stale-code/testing, or general UI/UX perspective.
- Asked to fix the two highest-priority security items found and to log the
  conversation.

## Answer

### Audit (via subagent)
- Covered security/privacy, stale code, test coverage and UI/UX, referencing
  prior fixes (demo/admin credential UI fix, FOREIGN KEY token-rotation fix,
  new auth/cross-user-leak spec tests).
- Findings:
  - Seeded demo accounts (including `admin@quad.test`) all use the public
    password `password123`, surviving in production beyond the earlier UI
    fix.
  - The admin-role seed guard in `src/db.js` only protected newly-created
    rows, not pre-existing ones with `role = 'admin'`.
  - `SESSION_SECRET` falls back to a hardcoded dev value.
  - Missing `secure` cookie flag; no login rate limiting.
  - Testing gaps: no regression test for the DM-history rotation fix, IDOR
    tests not asserting response status first, no CSRF/open-redirect tests.
  - Stale-code items: incomplete `PROCESS.md`, leftover worktree
    directories, placeholder/ dir.
- User decided to keep demo-account passwords as-is (intentional for
  course crit/demo) but document the risk, rather than rotate/randomize
  them.

### Fixes applied this session
1. `src/db.js` — added a boot-time step that forces `admin@quad.test`'s role
   back to `"user"` whenever `DEV_ADMIN_ENABLED` is false, regardless of
   whether the row was already seeded. Closes the gap where a pre-existing
   row could keep `role = 'admin'` with the public seed password.
2. `README.md` — added a bullet under "What's live today" documenting that
   seeded demo accounts (alex/sam/maya/tom/admin) intentionally share the
   password `password123` for crit/demo purposes, and that this pattern must
   never be reused for real accounts.

### Verification
- `pnpm vitest run` — 18/19 tests pass. The 1 failing test
  (`spec/invariants.test.ts`, README heading sync check) is pre-existing and
  unrelated; reproduced the same failure with the README change stashed out.

### Not fixed this session (follow-up)
- Hardcoded `SESSION_SECRET` fallback, missing `secure` cookie flag, no rate
  limiting, the testing gaps, and the stale-code items (`PROCESS.md`,
  leftover worktrees, `placeholder/` dir).
