# spec/events.test.ts

Our own checks, on top of the starter's `invariants.test.ts`. Protects the
core loop: a seeded user can log in, see events, check in, and have that
check-in persist. Uses the seeded account `alex@quad.test` / `password123`
(from `src/db.js`), shared across all tests in this file.

| Test | What it checks |
|---|---|
| `home page lists the seeded placeholder events` | `GET /` includes "Welcome mixer". |
| `a seeded user can log in with a password, check in to an event, and see it persist on return` | Login → `302`. Check-in → `302`. A **second, independent** request to the event page still shows the user as checked in — not just the redirect response from the action itself. |
| `checking in twice doesn't duplicate the attendee` | Checking in twice leaves exactly one `<li>{email}</li>` entry (via `INSERT OR IGNORE`), not two. |
| `anyone can host an event once logged in` | Any logged-in user can `POST /events` to create one; the response redirects to `/events/<slug>`, and the new page contains the title. |
| `a wrong password doesn't log you in` | Wrong password → `401`, no `set-cookie` header. |
| `an anonymous visitor can't check in without logging in first` | Anonymous check-in → `302` redirect to `/login` (not silently accepted, not an error). |
| `seeded dummy events and users carry a DEMO tag, real users don't` | The seeded "Welcome mixer" event and seeded attendee `priya.demo@quad.invalid` render with a `DEMO` tag span; a real user (`alex@quad.test`) checking in does not get tagged. |
