# Process overview

## The build

The brief fixes three requirements — multi-user, real-time, persistent — and
leaves "good" open. I started from the course's Fastify + `node:sqlite`
template: its hard constraints (one `shared-cpu-1x` machine, 256MB memory,
one volume at `/data`, HTTP on `0.0.0.0:$PORT`) were already satisfied, so
the workflow only had to add features, not also solve deployment and
persistence. The app became Quad, a campus social/events platform: discover
events, check in, chat, DM other users, post and pin announcements, and see
all of it update live for everyone on the same page.

"Good" was defined iteratively: each crit added a feature, then a pass
asking whether it was actually finished — does it persist, is it visible to
other users, does it fail safely — which usually surfaced a gap. Gaps became
a spec test or a harness correction, not a quiet patch.

## Picking the stack

The app is deployed on Fly.io and uses SQLite (`node:sqlite`, one file at
`/data/app.db` on the Fly volume — the only storage that survives a restart
or redeploy, since the volume is independent of the container image).
Identity is a signed, httpOnly cookie named `session` storing the user's
token (`src/server.js:44-54`); httpOnly means it can't be read or set via
`document.cookie`/JS, to prevent XSS token theft.

Real-time updates are polling, not WebSockets or SSE — a deliberate
trade-off against cost and memory. Fly's config (`auto_stop_machines =
"stop"`, `min_machines_running = 0`) scales the single machine to zero when
idle, most of why the app costs cents, not dollars. A long-lived SSE or
WebSocket connection fights that directly: the machine can never fully idle
while a tab is open. 4-second polling is stateless — each tick is an
ordinary GET, indistinguishable from a page load — so it costs nothing when
nobody's looking, and reuses the `fetch()`-and-JSON pattern already used for
check-ins and chat. The cost is up to ~4 seconds of staleness, acceptable
for chat, DMs and attendance; nothing here is more latency-sensitive.

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

## Building it

Events, RSVPs/maybes, chat, DMs and announcements (with pin state) are all
durable: created by one person, visible to anyone, surviving restarts and
redeploys, because each is a SQLite row on the Fly volume, not browser
state. Saved events, follows, read notifications, reactions and poll votes
are the exception, kept in `localStorage` as cosmetic per-device
preferences, not facts other sessions need to see.

`client.js`/`pages.js` poll JSON endpoints to pick up what other users did:
`GET /messages/:username/poll`, `GET /events/:slug/chat/poll`, `GET
/communities/:slug/chat/poll`, `GET /discover/poll`, and `GET
/events/:slug/live`. Each takes an "already seen" marker — a message id,
known slugs, or an announcement id — and returns only what's new, rendered
server-side with the same functions the full page uses, so a live update is
pixel-identical to a reload. Polling pauses while a tab is hidden, resuming
on `visibilitychange`.

## Directing, grounding and correcting the agent

CLAUDE.md is the source of grounding, pointing at HANDBOOK.md for
agent-facing rules; `docs/conversation_*.md` keeps a timestamped record per
session of what was asked and delivered. Work went one feature or fix per
prompt, verified locally then on the deployed app before moving on.
Ambiguous asks (for instance, "set up a sign-in page" when a login page
already existed) were resolved by asking which interpretation was meant
first.

Several corrections were real bugs caught by treating "it compiles" as
necessary, not sufficient:

- **CLAUDE.md drift.** Sessions sometimes skipped HANDBOOK.md's rules when
  not re-grounded, and one session partially overwrote earlier ground rules.
  CLAUDE.md edits are now diffed first.
- **Theme layout and persistence.** The light/dark toggle started out
  vertically stacked (two prompts to fix); the theme choice also reset on
  reload as pure client state — fixed via a cookie/DB column.
- **A token-rotation crash, found by writing a test.** Writing the
  password-change spec test surfaced a real bug: changing password for a
  user with DM history hit a SQLite foreign-key violation, because
  `rotateToken()` predated `dm_messages` and never learned its two token
  columns. Reproduced live, fixed, confirmed.
- **Cross-user data leaks.** A dedicated auth/leak pass found host details
  surfaced via the raw session token in `events.created_by` — leaking a real
  credential would let a stranger impersonate the host. Fixed by the
  `publicUser()` chokepoint above; the same pass also found a tampered
  session cookie needed to fail closed, and DM threads needed to stay
  unreadable by a third party even guessing the thread id. These became
  `spec/auth.test.ts`: 10 tests covering tamper-resistance, logout, password
  rotation invalidating every other device, private routes rejecting
  anonymous requests, DM isolation, and login not revealing whether an email
  has an account.
- **A false-positive CI failure and an accent-colour bug.** Three Docker
  CI-equivalent runs gave two failures on different tests — not a real bug,
  but another session committing fixes into the same shared checkout
  mid-build; these checks now run from an isolated worktree instead.
  Separately, the accent colour chosen on one page silently reset to purple
  elsewhere: `client.js` saves it via `JSON.stringify` (with quotes), but the
  pre-paint `<head>` script read it back with a plain `getItem`, so other
  pages got a literal `data-accent` matching no CSS rule — fixed by parsing
  it consistently.
- **Real-time persisted but wasn't live.** Chat, DMs, then Discover and the
  event page all persisted correctly from the start, but another user's
  change only appeared after a manual reload — failing the brief's "no
  reload" requirement. Fixed over two rounds (messages/chat, then
  events/announcements), each verified against live Fly with a real
  signed-up account.

Every change on `main` goes through `pnpm check` (typecheck plus the full
`spec/` suite) and a real request against live Fly before being called done.

## What I'd still change

`/client.js` and `/pages.js` are cached for an hour with no cache-busting, so
a deploy can leave an open tab running stale JS until a hard reload — I'd add
a content hash or version string. I'd also replace the cookie-only identity
model (no email verification) with something stronger, now that host-only
powers like pinning and announcements exist and are worth protecting
properly.
