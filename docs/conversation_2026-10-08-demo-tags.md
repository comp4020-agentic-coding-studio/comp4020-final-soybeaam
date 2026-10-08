# Conversation log

Written: 2026-10-08

A summary of this Claude Code session, not a verbatim transcript.

## DEMO tags for dummy users and events

### Prompt
- Asked for a DEMO tag on each dummy user and event, shown in the UI.

### Work done
- Found no dummy users were seeded before. Only three placeholder events existed (welcome-mixer, club-trivia-night, study-sprint).
- Assumed three demo users (alex.demo, priya.demo, sam.demo @quad.invalid). They host the seeded events and have a few demo check-ins. The spec-* @example.com test users are not tagged.
- Added an `is_demo` column to `users` and `events` using a PRAGMA-guarded migration.
- Added an idempotent demo seed that runs on every boot, so existing local and Fly volume databases pick it up. Real hosts are never overwritten.
- `getEvent` now joins the host, so the event page shows "Hosted by".
- UI: amber "DEMO" pill (new --demo-bg and --demo-ink tokens, about 7:1 contrast, separate from the action accent). It appears on card titles, host lines, event page heading, attendee entries and the nav when logged in as a demo user. Demo event pages also show a note banner. Non-demo markup is unchanged.
- Added a spec test.

### Verification
- tsc clean.
- 8/8 tests pass on a fresh DB and on a copy of the existing DB.
- Reboot is idempotent.
- Screenshots checked.

### Status
- Work is on branch worktree-demo-tags. Not merged to main.
