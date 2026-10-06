# Recommended subagents

This file lists Claude Code subagents we recommend for continued work on the
On Campus events and check-in app. These are recommendations only, not active
configuration: nothing here is loaded by Claude Code, and none of them exist
under `.claude/agents/` yet. Each one is a read-only user-story simulator. It
drives one user flow end to end against the running app (for example with
`curl` against `http://localhost:8080` and a cookie jar), then reports UX
feedback and suggestions to an orchestrator. The simulators never implement
fixes; the orchestrator routes their findings to an edit-capable agent.

Routes referenced below: `GET /`, `GET /login`, `POST /login`, `POST /logout`,
`GET /events/new`, `POST /events`, `GET /events/:slug`,
`POST /events/:slug/checkin`, `GET /readme/`.

## 1. user-story-create-event

- **Description:** Simulates a host creating and publishing an event, then
  confirming it is visible to others.
- **Suggested tools:** Read, Grep, Glob, Bash
- **When to use:** After changes to the event form, event creation, slugs, or
  the home page card grid.
- **Flow:**
  1. `POST /login` with a host email, saving the session cookie.
  2. `GET /events/new`, then `POST /events` with `title`, `event_date`,
     `location` and `affiliation`; follow the redirect to `/events/:slug`.
  3. Confirm the event page shows the submitted details.
  4. `GET /` and confirm the new event appears in the card grid and links to
     its own page. Also try an empty title and note how the error is shown.

## 2. user-story-check-in

- **Description:** Simulates an attendee who doesn't know the host checking in
  to an event, then confirming the check-in persists without duplicating.
- **Suggested tools:** Read, Grep, Glob, Bash
- **When to use:** After changes to check-in, sessions, or the attendee list.
- **Flow:**
  1. `POST /login` with a fresh email, saving the cookie; open an existing
     `/events/:slug`.
  2. `POST /events/:slug/checkin` and confirm the redirected page shows
     "You're checked in." and the attendee appears in "Who's checked in (N)".
  3. Later, make a fresh `GET /events/:slug` with the same cookie and confirm
     the checked-in state persisted.
  4. Repeat the check-in `POST` and confirm the attendee count does not go up
     and the attendee is not listed twice.

## 3. user-story-browse-events

- **Description:** Simulates someone browsing the home page cards to find an
  event worth attending.
- **Suggested tools:** Read, Grep, Glob, Bash
- **When to use:** After changes to the home page, card layout, or the event
  fields shown on cards.
- **Flow:**
  1. `GET /` both logged out and logged in, and list each card's visible
     date, location, affiliation and host.
  2. Note placeholder or missing values (for example "Date TBA", "Host TBA",
     or blank fields) and how often they appear.
  3. Judge whether a card alone gives enough information to decide whether to
     open it, and whether the ordering helps (for example upcoming first).
  4. Open one or two `/events/:slug` pages and report what was only findable
     there.

## 4. user-story-concurrent-sessions (optional, week 10)

- **Description:** Simulates two people acting on the same event at the same
  time, checking that counts stay consistent and updates appear.
- **Suggested tools:** Read, Grep, Glob, Bash
- **When to use:** Once real-time updates land (planned for week 10); before
  that it can still check consistency on page reload.
- **Flow:**
  1. Log in two users with separate cookie jars (`a.txt`, `b.txt`).
  2. Have both `POST /events/:slug/checkin` at once (for example backgrounded
     `curl` calls), then confirm the count is exactly two higher and each
     attendee appears once.
  3. Have session A watch `/events/:slug` while session B checks in, and
     confirm A sees the new attendee (live, or on its next request).
  4. Report any race, stale count, or missing update.
