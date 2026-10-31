# Quad

Host or publish an event with a time, place and optional affiliation
(university, club). Unlike typical event apps, both students and
non-students can check in, and everyone sees the same guest list for
an event. Sorting, category filters and a map let people find events
that aren't just from ANU but from other universities, clubs, or
outside any institution.

This is a first version. What exists today is in "What's live
today"; everything else is in "Where this is going" and is not built.

## What's live today

- Log in with email and password, with your session persisting when
  you come back. Passwords are hashed with `node:crypto`'s scrypt
  (`src/auth.js`), not stored in plain text.
- A sidebar app: Home, Discover, My Events, Saved, Event Map,
  Communities, Messages, Notifications, Tickets, Announcements,
  Activity and Settings.
- Profile and settings pages (theme, accent colour), and a dev-only
  admin dashboard at `/admin/login` (off when `NODE_ENV=production` or
  on Fly).
- Any logged-in user can host an event (time, place, optional
  affiliation, category, price, venue, address, description, URL).
- Check in to a free event in one step; a priced event goes through a
  mocked checkout first (no real card is charged).
- Sort and filter the event list by name, date, category or
  affiliation; an event map (OpenFreeMap/MapLibre) with clustering.
- An event page with chat, attendee mini-profiles, going/maybe state,
  and a pasted social post embedded via oEmbed.
- A social feed pulling from public APIs (YouTube, Reddit, Bluesky,
  Mastodon) and a paste-a-link fallback for platforms without open
  search (Instagram, Facebook, X).
- Light/dark/system theme and a choice of accent colours, persisted
  per logged-in user and via cookie for guests.

## What good means here

Good for this project is a website that **looks nice**, **can handle
lots of traffic from multiple users**, and is **convenient to use**.
Concretely:

### Looks nice

- A consistent design system in `src/style.css` — one set of CSS
  custom-property tokens for colour, spacing and type, not per-page
  one-offs — with light, dark and five accent palettes that all
  resolve through the same tokens.
- Curated cover photos per seeded event (`src/event-images.js`'s
  `EVENT_COVERS` map), picked by hand to match each event's actual
  theme rather than a generic per-category stock photo.
- Small interface polish aimed at feeling considered rather than
  thrown together: a brief progressive-enhancement page-load overlay,
  a hero illustration animation, a collapsible desktop sidebar — all
  gated behind `prefers-reduced-motion` and behind `.js` so a no-JS
  visitor sees a working, static page instead of a broken one.
- Responsive at phone width and up; checked in headless Chrome at
  390px and 1280px, in both themes, for each UI change.

### Handles lots of traffic from multiple users

The app runs as one Fastify process against one SQLite file
(`docs/decisions/0001-app-stack.md` — ADR 0001), so "handles traffic"
here means **staying correct under concurrent users**, not a load-test
throughput number that was never measured:

- Checking in twice, including two near-simultaneous requests from the
  same person, can't create two attendee rows: `checkins` has a
  `UNIQUE (event_slug, user_token)` constraint and the insert is
  `INSERT OR IGNORE`, so the second write is a no-op at the database
  level rather than relying on the UI to stop it. Covered by a spec
  test.
- The guest list is one shared table read by every request, not a
  per-session copy, so two people looking at the same event page see
  the same attendees — there's no caching layer or per-user state to
  go stale or diverge.
- Each request carries its own identity (a signed cookie) and talks to
  the database independently — there's no shared in-memory state
  between requests that two concurrent users could corrupt.
- The honest limit: one SQLite file on one volume means one instance.
  That's a real ceiling on throughput, not something this week's work
  papers over — see "Where this is going" and ADR 0001's
  consequences section.

### Convenient to use

- Checking in to a free event is one click once logged in: no
  approval step, no waiting on a host.
- Hosting has no gatekeeper — anyone logged in can publish an event
  immediately, with no review queue before it's visible.
- A price is shown before it's paid: a free event says so plainly, a
  priced event shows the amount and a checkout step rather than
  collecting money with no visible moment of agreement.
- Filtering, sorting, a map and a social feed all live on top of the
  same event list, so finding something relevant doesn't require
  knowing which club or institution runs it in advance.

## What is enforced and what is judged

Checked by the tests in `spec/events.test.ts`, against the running app:

- a seeded demo user can log in with email and password and check in,
  and the check-in is still there when they come back
- checking in twice doesn't create two entries
- checking in requires being logged in
- anyone logged in can host an event
- seeded demo users and events carry a visible DEMO tag; real ones
  don't

Judged, not enforced: whether an event looks genuine, whether a host
is who they claim to be, whether the mocked checkout reads as
obviously fake rather than a real payment form, and whether the
design actually "looks nice" to someone who isn't me. None of these
have a test.

## Data privacy

What leaving a user's password, session token or email out of a response
actually means is checked in `spec/auth.test.ts` (10 tests), against the
running app:

- A tampered or forged session cookie is treated as logged out, never as
  another account (the signature check fails closed).
- Logging out clears the session; the next request with the same cookie is
  anonymous.
- Changing your password rotates your session token and signs out every
  other device using the old one.
- `/settings`, `/messages`, `/my-events`, `/notifications` and `/tickets` all
  redirect an anonymous visitor to `/login` rather than rendering anything.
  (`/saved` is the one exception: it's a client-side, localStorage-only list
  with nothing private held server-side, so it's public like the home page.)
- An anonymous visitor can't send a direct message.
- A DM thread between two users never appears for a third, uninvolved user —
  including when that user guesses the thread id directly via `?thread=`
  (thread ids are a deterministic sort of both users' tokens, never accepted
  from the client as a way to select whose messages come back).
- You can't message yourself as a way to read someone else's thread as a
  stand-in.
- Another user's profile page never includes their email or password hash.
- The event attendee list never includes a check-in's raw session token
  (identity is always joined from `users.email`, never read off
  `checkins.user_token` directly).
- An unknown email and a known email with the wrong password get an
  identical login response, so the form never reveals which accounts exist.

`publicUser()` (`src/social-db.js`) is the one function every user row goes
through before reaching a template or a JSON response; it strips `token`,
`password_hash`, `email` and `role` unconditionally, so none of the pages
above can leak those fields even by accident.

## Where this is going

None of this exists yet, and nothing above depends on it.

- **Real-time updates.** Chat and attendee counts currently need a
  page reload to see someone else's change. Week 10's brief is
  updates within about a second; SSE or WebSockets over the existing
  Fastify process is the planned shape (see ADR 0001).
- **Booking with capacity.** Limited spots, and the rule that the last
  spot goes to exactly one person (first committed request wins). This
  is where a real capacity race appears, and where the current
  single-SQLite-instance setup gets properly tested.
- **Volunteer role.** Hosts delegating announcing and pinning.
- **Moderation.** Rules against promoting competing events, such as
  link filtering and flagging.
- **Payments.** See below.
- **Horizontal scaling.** Only worth doing if a real audience outgrows
  one instance; see ADR 0001's consequences section for what would
  have to change first (the single SQLite file is the blocker).

## What I chose not to build (yet)

- **Real payments.** Sloan's essay ["An App Can Be a Home-Cooked
  Meal"](https://www.robinsloan.com/notes/home-cooked-app/) argues
  home-cooked software's value is in not needing to scale or monetize:
  it stays answerable only to the people using it. I used that to
  decide against real payments for now: the checkout step is
  mocked — a fake card form that goes straight to check-in — so no
  money moves, and I'm not building refunds, seat holds, or real
  payment processing. Taking real money would make Quad answerable to
  revenue, disputes and chargebacks as well as to the students and
  hosts using it, and I want it to stay answerable only to them.
- **Seat holds during payment.** Better experience, more moving parts.
  A wrong "sold out" is cheaper than a double booking, so I'll start
  without holds when booking arrives.
- **Full-text or geo search providers (Elasticsearch, Algolia, etc).**
  The event list is small enough that SQL `LIKE`/filtering and
  client-side filters on top of it are enough; adding a search service
  would be solving a problem the app doesn't have yet.
