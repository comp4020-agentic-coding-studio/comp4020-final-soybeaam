# spec/auth.test.ts

Auth and cross-user data-leak checks, split out from `events.test.ts` so a
failure here reads as "something is wrong with who can see/do what" rather
than "the check-in loop broke". Uses three dedicated seeded accounts — SAM,
MAYA, TOM — never `alex@quad.test`, so these tests don't fight
`events.test.ts` (or each other) for state.

## Session cookie integrity

| Test | What it checks |
|---|---|
| `a tampered session cookie is treated as logged out, not as someone else` | Flipping the last character of a signed session cookie fails closed: `302` to `/login`, never another account's session. |
| `logging out clears the session and the next request is anonymous` | After `POST /logout`, the same cookie no longer authenticates (`/settings` → `302` to `/login`). |
| `changing your password invalidates existing sessions on every device` | Changing password on one device logs the other out (`302` to `/login`); the changing device stays logged in. Restores the original password at the end so repeat runs stay idempotent. |

## AuthZ on private/mutating routes

| Test | What it checks |
|---|---|
| `settings, messages and my-events all redirect an anonymous visitor to /login` | `/settings`, `/messages`, `/my-events`, `/notifications`, `/tickets` all `302` to `/login` for anonymous visitors. (`/saved` is deliberately excluded — it's client-side `localStorage`, nothing private to guard server-side.) |
| `an anonymous visitor can't send a direct message` | `POST /messages/send` anonymously → `302` to `/login`. |

## Direct-message thread isolation (IDOR)

| Test | What it checks |
|---|---|
| `a DM thread between two users never appears for a third, uninvolved user` | A message sent SAM→MAYA appears on both their `/messages` pages, but never on TOM's — including when TOM guesses the deterministic `?thread=` id directly. |
| `you can't message yourself to read your own thread as a stand-in for someone else's` | Sending yourself a message → `400`. |

## publicUser() / profile rendering never leaks private fields

| Test | What it checks |
|---|---|
| `another user's profile page never includes their email, password hash, or session token` | Viewing another user's `/profile/<username>` never contains their email or a `scrypt$`-prefixed password hash. |
| `the event attendee list never includes a check-in's raw session token` | Regression test (see `PROCESS.md`) for a prior token-leak bug: attendee identity must come from `users.email` via a join, never the raw session token. Checks the page contains no `scrypt$` hash and no bare UUID. |

## Login doesn't reveal whether an email has an account

| Test | What it checks |
|---|---|
| `an unknown email and a known email with the wrong password get the identical response` | Logging in with a nonexistent email and logging in with a real email + wrong password both return `401` with byte-identical bodies (aside from the echoed email value) — no account-enumeration oracle. |
