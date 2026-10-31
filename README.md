# Quad

Quad is a prototype website that is filled with dummy data to show users how and what it would look like in production. Quad is an events website and allows hosting and publishing events with a time, place and optional affiliation
(university, club). Unlike typical event apps, both students and
non-students can check in, and everyone sees the same guest list for
an event. Sorting, category filters and a map let people find events
that aren't just from ANU but from other universities, clubs, or
outside any institution.

## What's available today

On Quad, you can:
- Log in with email and password, with your session persisting when
  you come back. Passwords are hashed with `node:crypto`'s scrypt
  (`src/auth.js`), not stored in plain text.
- Navigate via a sidebar: Home, Discover, My Events, Saved, Event Map,
  Communities, Messages, Notifications, Tickets, Announcements,
  Activity and Settings.
- Create a profile and make edits in settings (theme, accent colour)
- Jost an event as a logged-in user: (time, place, optional
  affiliation, category, price, venue, address, description, URL).
- Check in to a free event in one step; a priced event goes through a
  mocked checkout first (no real card is charged).
- Sort and filter the event list by name, date, category or
  affiliation; an event map (OpenFreeMap/MapLibre) with clustering.
- Chat with other users, see attendee mini-profiles, going/maybe state,
  and a pasted social post embedded via oEmbed.
- Light/dark/system theme and a choice of accent colours, persisted
  per logged-in user and via cookie for guests.

## What good means here

Good for this project is a website that has a smooth, accessible UI, fast, and is convenient and easily understandable for users.

I was inspired by Rubric (renamed to Campus), where students are able to select a school and see and participate in events from all societies in one place. However, I noticed Rubric only allows students to see their own schools events and has an abundance of features that are difficult to access, not properly configured or managed in their UI/UX. 

[Characteristics of a good app](https://www.microsoft.com/en-au/power-platform/products/power-apps/topics/app-development/what-makes-a-good-app) highlight a well-designed UI, fast loading time and strong data protection as some key characteristics for what makes a good app. Quad demonstrates this by:

### Smooth, accessible UI

- A consistent design system:
  custom-property tokens for colour, spacing and type, not per-page
  one-offs — with light, dark and five accent palettes that all
  resolve through the same tokens.
- Curated demo photos per seeded event (`src/event-images.js`'s
  `EVENT_COVERS` map) to give users a better idea of.
- Responsive, scalable design, simulated in chrome. 

### Fast loading

The app runs as one Fastify process against one SQLite file so it stays correct under concurrent users. However no load-test was conducted to measure speed by volume:

- Checking in twice, including two near-simultaneous requests from the
  same person, can't create two attendee rows: `checkins` has a
  `UNIQUE (event_slug, user_token)` constraint and the insert is
  `INSERT OR IGNORE`, so the second write is a no-op at the database
  level rather than relying on the UI to stop it. 
- The guest list is one shared table read by every request, not a
  per-session copy, so two people looking at the same event page see
  the same attendees — there's no caching layer or per-user state to
  go stale or diverge.
- Each request carries its own identity (a signed cookie) and talks to
  the database independently — there's no shared in-memory state
  between requests that two concurrent users could corrupt.
- limitation: one SQLite file means there is only one instance.

### Data protection

- Passwords are encrypted before touching the database.
- src/server.js:142 sets the session cookie httpOnly (JS on the page can't read it), signed (tamper-evident via @fastify/cookie + a server-side SESSION_SECRET), and sameSite: "lax" (limits cross-site request forgery exposure).


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
design is aligned with UI standards and inclusivity.

## Where this could go

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
- **Security and governance** considerations for wider use
- **Event scraping** from the web

## Implementation

As this is an agentic workflow for ANU's agentic course, the decisions and conversation's are held in [documents directory](docs).
