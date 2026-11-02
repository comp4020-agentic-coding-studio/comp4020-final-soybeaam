# Conversation log

Written: 2026-10-31

A summary of this Claude Code session, not a verbatim transcript.

## User prompt
- Asked why messages did not appear without a page reload.
- Asked for real-time polling for DMs, event chat and community chat, then
  for the same pattern on the events list (Discover) and event pages.
- Asked whether websockets would be better. The answer is in the Answer below.
- Asked to push and merge each round into `main`, delete the merged branch,
  and check the deployed Fly.io site.
- Asked how Fly.io deploys are tracked, and to check that PROCESS.md matches
  the repo.
- Reported that a message still did not appear on the live site within 4
  seconds, and that a new event only appeared after a reload.
- Asked for the event pages to be real-time, not just "updates on reload".
- Asked how long a CI workflow run had been going.
- Asked for an end-to-end check on the live site as a real user. There was no
  sign-up route, so the request became "add a sign-up page".
- Asked for this session to be logged.

## Answer

### Why polling and not websockets
- The app had no real-time infrastructure at all. Chat, DMs and the events
  list were plain server-rendered pages.
- Fly.io runs with `auto_stop_machines = "stop"` and `min_machines_running = 0`,
  and the memory budget is 256MB. A long-lived SSE or websocket connection per
  client would fight scale-to-zero. Polling is stateless GETs on a timer, which
  matches the existing `fetch()` code in `client.js`.

### Round 1: messages and chat (PR #9)
- Added `dmSince()` and `chatSince()` in `social-db.js`.
- Added three JSON poll endpoints in `routes/social.js` (DM, event chat,
  community chat), each taking `?after=<id>`.
- `client.js` and `pages.js` poll every 4 seconds. Polling pauses while the tab
  is hidden and resumes on `visibilitychange`.
- Endpoints were checked locally and on the live site.
- The likely reason the user still saw stale data was the browser cache.
  `client.js` and `pages.js` are served with a one-hour `max-age` and no
  cache-busting. A hard reload is needed to pick up new JS. This is noted as a
  gap to fix later.

### Round 2: Discover and event pages (PR #10)
- `GET /discover/poll?known=<slugs>` returns only new event cards, rendered
  with the existing `socialEventCard()`. `pages.js` inserts them and re-runs
  the client-side filter and sort.
- `event-views.js` now exports `capacityBlock()`, `attendeesBody()` and
  `announcementsBody()` so the same markup can be re-rendered.
- `GET /events/:slug/live?known_ann=<id>` returns the capacity, attendee and
  announcement fragments. The announcements field is `null` unless something
  newer exists, so unchanged data is not re-sent.
- Checked locally: a new event appears, a check-in updates the capacity count,
  an announcement appears, and a repeat poll returns no-op results.

### Round 3: sign-up page (PR #11)
- `/login` only accepted five seeded demo accounts, so there was no way to
  make a genuinely new account for testing.
- Added `createUser()` in `db.js`. New accounts always get the `user` role.
- Added `signupPage()` in `views.js`, reusing the login page styles. It
  validates name, email (well-formed and unique) and password (8+ characters),
  and it cross-links to login.
- Added `GET` and `POST /signup` in `server.js`. The password is hashed with the
  existing scrypt helper, and the new user is logged in straight away.
- Checked locally: duplicate email, short password and missing name all return
  400 with field errors. The `next` redirect works.
- Checked on the live site with a freshly created account. The account logged
  in, created an event, and saw it appear via `/discover/poll`. A check-in
  updated the capacity live, and an announcement appeared live.

### Files changed (cumulative)
- `src/social-db.js`, `src/routes/social.js`, `src/client.js`, `src/pages.js`,
  `src/social-views.js`, `src/event-views.js`, `src/server.js`, `src/db.js`,
  `src/views.js`.

### Verification
- `pnpm test` gave 18/19 passing after each round. The one failure is a README
  heading-order check in `spec/invariants.test.ts`. It was already failing
  before this session and was not touched.
- All three PRs (#9, #10, #11) were merged, and each deploy to Fly.io succeeded.
- The final end-to-end test used a new account on the production site, not a
  seeded demo login.
- Scratch files from testing (cookie jars, HTML and JSON dumps) were removed
  after each round.
