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

The brief fixes three requirements: multi-user, real-time, persistent — and
leaves "good" open to interpretation which is expanded on in [README.md](README.md) section. I started from the course's Fastify + `node:sqlite` template: its hard constraints (one `shared-cpu-1x` machine, 256MB memory, one volume at `/data`, HTTP on `0.0.0.0:$PORT`) were already satisfied, so the workflow only had to add features, not also solve deployment and persistence. The app, named Quad, a campus social/events platform has multiple features to satisfy the three requirements. 

**Multi-user**: Quad is deployed on fly.io and will uniquely identify users on the site via a token.

**Real-time**: Real time persistence is done via polling and is used to render changes in real-time from messages, events, etc. 

**Persistence**: Persistence is done with SQLite db that will continue to render new events by storing in a db.

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
Implemented across [`404b547`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/404b547) (polling added for messages, event chat and community chat), [`cc22d1f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/cc22d1f) (polling extended to Discover and the event page), and [`d586429`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/d586429) (polling interval dropped to 1s to meet the brief's real-time bar).

## Multi-user, real-time persistence

Before any code, a schema was created to lay out the groundowrk which was later later on created as [schema.html](docs\schema.html) to ensure consistent, non-redundant DB handling, especially when several people can interact and see updates (new events or messages) fom other users. The app tells people apart by assigning a token. 

The website is build on client.js and uses small fetch() methods to retrieve updated data. Persistence was done with polling, as I had wrongfully assumed there was already infrastructure for real-time updates by the time I was testing. Instead, persistence was interpreted differently from the AI evident from the process. For this site, polling was weighed to be the best option because the site isn't latency dependent enough for websockets. Additionally, the $0 costing model chosen for this assignment (256MB memory budget) would mean a server-sent events (SSE) connection might incur keep-alive socket costs which is out of scope for this project. 

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
## Directing, grounding and correcting the agent

CLAUDE.md is the source of grounding, pointing at HANDBOOK.md for
agent-facing rules; `docs/conversation_*.md` keeps a timestamped record per
session of what was asked and delivered. Work went one feature or fix per
prompt, verified locally then on the deployed app before moving on.

Tests were done with the help of auditing agents and logged in [tests](docs\tests).

- **CLAUDE.md drift.** Sessions sometimes skipped HANDBOOK.md's rules when
  not re-grounded, and one session partially overwrote earlier ground rules which resulted in a manual correction.

- [`64a4655`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/64a4655) Asks to restore the app to its crit-8 state. Previous commits were based off the idea that event data would be fine to scrape from the web, however, a few legal and cost issues arose when trying to implement this. Attempting to include this feature in the app generated a lot of junk code which I found it would be easier to rollback and start fresh considering at this time Quad was still relatively bare. 

- **Theme layout and persistence.** The light/dark toggle started out
  vertically stacked (two prompts to fix); the theme choice also reset on
  reload as pure client state this was fixed via a cookie/DB column.
  
- [`c6a188e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/c6a188e) Redesigned the Coming up section as a one-at-a-time animated slider. However the result wasn't as I had indended, so multiple other smaller prompts were used to get it right. A larger more sophisticated prompt was skipped due to wanting to reduce token consumption. ([`90950f3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/90950f3), [`fdd9c26`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/fdd9c26), [`f53809a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/f53809a), [`7b2d55d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/7b2d55d)) 
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
- **Real-time persisted but wasn't live.** Chat, DMs, then Discover and the event page all "persisted", however not as intended because persistance didn't appear live as oer the breifs requirements. Fixed over two rounds logged in [conversation](docs\conversation_2026-10-31-polling-and-signup.md): [`404b547`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/404b547) added polling for messages, event chat and community chat, then [`cc22d1f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/cc22d1f) extended it to Discover and the event page, and [`d586429`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/d586429) dropped the interval to 1s to meet the brief's real-time bar. Live updates were then tested by the agent and user in the browser.

Every change on `main` goes through `pnpm check` (typecheck plus the full
`spec/` suite) and a real request against live Fly before being called done. Auditing was done towards the end of the project to double check the website worked as intended and showed what "good" is.

## What I'd still change

`/client.js` and `/pages.js` are cached for an hour with no cache-busting, so a deploy can leave an open tab running stale JS until a hard reload which was redundant to deal with throughout the project. I'd add a content hash or version string. I'd also replace the cookie-only identity
model (no email verification) with something stronger, since host have more permissions like pinning and announcements which are worth protecting properly.
