# Process overview

## The build

The brief fixes three requirements — multi-user, real-time, persistent — and
leaves "good" open to interpretation, expanded on in the [README.md](README.md).
I started from the course's Fastify + `node:sqlite` template: its hard
constraints (one `shared-cpu-1x` machine, 256MB memory, one volume at
`/data`, HTTP on `0.0.0.0:$PORT`) were already satisfied, so the workflow
only had to add features, not also solve deployment and persistence. The
app, named Quad, is a campus social/events platform: discover events, check
in, chat, DM other users, post and pin announcements, and see all of it
update live for everyone on the same page.

"Good" was defined iteratively: each crit added a feature, then a pass
asking whether it was actually finished — does it persist, is it visible to
other users, does it fail safely — which usually surfaced a gap. Gaps became
a spec test or a harness correction, not a quiet patch.

**Multi-user**: Quad is deployed on fly.io and uniquely identifies users via
a token.

**Real-time**: real-time updates are done via polling, used to render
changes live from messages, events, and chat.

**Persistence**: persistence is handled by a SQLite DB that continues to
render new events by storing them durably.

## Scoping

Before writing the event/social schema, I sketched the entity relationships
on paper, to keep DB handling consistent once several people could interact
and see each other's updates; that sketch later became `docs/schema.html` as
a lasting reference. People are told apart by a `users.token`
(`crypto.randomUUID()`), never exposed to the browser except inside the
signed cookie. `publicUser()` in `src/social-db.js:181` is the only user
shape allowed to leave the data layer — stripping token, password hash,
email, role and preferences down to username, display name, avatar, bio,
location and interests — so every view gets the same safe shape by
construction, not convention.

## Picking the stack

The app is deployed on Fly.io and uses SQLite (`node:sqlite`, one file at
`/data/app.db` on the Fly volume — [`4ed4dd0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/4ed4dd0),
[`e6bff9e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/e6bff9e),
[`a8bf18e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/a8bf18e) —
the only storage that survives a restart or redeploy, since the volume is
independent of the container image). Identity is a signed, httpOnly cookie
named `session` storing the user's token (`src/server.js:44-54`); httpOnly
means it can't be read or set via `document.cookie`/JS, preventing XSS
token theft.

Real-time updates use polling, not WebSockets or SSE — a deliberate
trade-off against cost and memory.

## Multi-user, real-time, persistence

The app tells people apart via a token
([`915603f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/915603f),
[`db75b2e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/db75b2e),
[`1da73ce`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/1da73ce)).
The frontend (`client.js`) uses small `fetch()` calls to retrieve updated
data. Persistence of live updates was done with polling
([`404b547`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/404b547),
[`cc22d1f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/cc22d1f),
[`d586429`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/d586429)),
after I wrongly assumed real-time infrastructure already existed. Polling
was judged the best option because the site isn't latency-sensitive enough
to need WebSockets, and under the $0 costing model (256MB memory budget) a
kept-alive SSE connection would add socket costs out of scope for this
project.

## Directing, grounding and correcting the agent

CLAUDE.md is the source of grounding, pointing at HANDBOOK.md for
agent-facing rules; `docs/conversation_*.md` keeps a timestamped record per
session of what was asked and delivered. Work went one feature or fix per
prompt, verified locally then on the deployed app before moving on. Tests
were done with the help of auditing agents and logged in
[tests](docs\tests).

- **CLAUDE.md drift.** Sessions sometimes skipped HANDBOOK.md's rules when
  not re-grounded, and one session partially overwrote earlier ground rules,
  requiring a manual correction.
- [`64a4655`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/64a4655)
  Rolled the app back to its crit-8 state after legal and cost issues
  surfaced in trying to scrape event data from the web — the attempt
  generated a lot of junk code, and reverting was easier while Quad was
  still bare.
- **Theme layout and persistence.** The light/dark toggle started out
  vertically stacked (two prompts to fix); the theme choice also reset on
  reload as pure client state, fixed via a cookie/DB column.
- [`c6a188e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/c6a188e)
  Redesigned the "Coming up" section as a one-at-a-time animated slider; the
  first result wasn't as intended, so several smaller prompts refined it
  instead of one larger prompt, to save tokens
  ([`90950f3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/90950f3),
  [`fdd9c26`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/fdd9c26),
  [`f53809a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/f53809a),
  [`7b2d55d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/7b2d55d)).
- **A token-rotation crash, found by writing a test.** Writing the
  password-change spec test surfaced a real bug: changing password for a
  user with DM history hit a SQLite foreign-key violation, because
  `rotateToken()` predated `dm_messages` and never learned its two token
  columns. Reproduced live, fixed, confirmed.
- **Cross-user data leaks.** A dedicated auth/leak pass found host details
  exposed via the raw session token in `events.created_by` — a real
  credential leak that could let a stranger impersonate the host. Fixed by
  the `publicUser()` chokepoint above; the same pass also caught a tampered
  session cookie that needed to fail closed, and DM threads that needed to
  stay unreadable even if a third party guessed the thread id. These became
  `spec/auth.test.ts`: 10 tests covering tamper-resistance, logout, password
  rotation invalidating other devices, private routes rejecting anonymous
  requests, DM isolation, and login not revealing whether an email has an
  account.
- **A false-positive CI failure and an accent-colour bug.** Three Docker
  CI-equivalent runs gave two failures on different tests — not a real bug,
  but another session committing into the same shared checkout mid-build;
  checks now run from an isolated worktree instead. Separately, an accent
  colour chosen on one page silently reset to purple elsewhere: `client.js`
  saved it via `JSON.stringify` (with quotes), but the pre-paint `<head>`
  script read it back with a plain `getItem`, producing a literal
  `data-accent` matching no CSS rule — fixed by parsing it consistently.
- **Real-time persisted but wasn't live.** Chat, DMs, Discover and the event
  page all "persisted" but didn't update live as the brief required. Fixed
  over two rounds, logged in
  [conversation](docs\conversation_2026-10-31-polling-and-signup.md):
  [`404b547`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/404b547)
  added polling for messages and chat, then
  [`cc22d1f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/cc22d1f)
  extended it to Discover and the event page, and
  [`d586429`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/d586429)
  dropped the interval to 1s to meet the brief's real-time bar. Live updates
  were then verified in-browser by the agent and user.

Every change on `main` goes through `pnpm check` (typecheck plus the full
`spec/` suite) and a real request against live Fly before being called done.
A final auditing pass near the end double-checked the site worked as
intended and showed what "good" meant.

## What I'd still change

`/client.js` and `/pages.js` are cached for an hour with no cache-busting,
so a deploy can leave an open tab running stale JS until a hard reload — I'd
add a content hash or version string. I'd also replace the cookie-only
identity model (no email verification) with something stronger, since hosts
have elevated permissions like pinning and announcements worth protecting
properly.
