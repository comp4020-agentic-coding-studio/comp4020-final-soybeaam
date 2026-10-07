# Conversation log

Written: 2026-10-07 14:50:03 AUSEST

A summary of this Claude Code session, not a verbatim transcript.

## Crit 8 submission
- Ran preflight for crit 8 ("It's alive!", due Wed 2026-10-07 12:00). It found
  no reflection, uncommitted changes and unpushed commits.
- `reflections/crit-8.md` already existed locally. `pnpm check:evidence` passed
  once it was committed.
- Committed `PROCESS.md`, `README.md`, `docs/decisions/0001-app-stack.md` and
  `reflections/crit-8.md` as `59257a9`, then pushed.
- Deployed to Fly with
  `flyctl deploy --remote-only --ha=false -a comp4020-final-soybeaam`.
  `verify-deploy.sh` confirmed the page and its CSS return 200.
- CI's `check` and `deploy` jobs are gated on the repo being public, so they
  were skipped while it was private.
- Ran `pnpm typecheck`, `pnpm test` (7 tests) and `pnpm check:evidence`
  locally. All passed.

## Ship
- The secret scan flagged three "credential assignment" surfaces. On reading
  them they were identifiers (`token` columns and variables) and a placeholder
  `SESSION_SECRET` fallback, not real secrets.
- Flipped the repo public. The CI run (check and deploy) passed and the live
  site re-verified.
- Tagged `crit-8` at `59257a9`.
- Set a random `SESSION_SECRET` on the Fly app so production no longer signs
  cookies with the public placeholder.

## Crit 9 ("All at once", due Wed 2026-10-14 12:00)
- Same repo as crit 8. Reflection filename is `reflections/crit-9.md`.
- Spec: real-time updates within about a second, one written-down concurrency
  decision, process evidence, and being able to account for how the work was
  directed.
- `pnpm check` was green as the baseline.

## Housekeeping
- Updated the `comp4020` plugin from 0.14.22 to 0.14.27 (needs a restart).
- Weekly proxy budget: $21.23 of $100.00 spent, resets Thu 8 Oct 9:00 am
  Canberra.
- Opened the local dev server at http://localhost:8080/ in the browser.

## Events sources, map and schema (recommendations only, no code changed)
- Eventbrite's public search API is, as far as I know, no longer available, and
  scraping breaks its terms. Check their current docs before relying on this.
- Recommended ICS/iCal feeds as the primary source, with the Ticketmaster
  Discovery API as an optional extra for ticketed events.
- Map: Leaflet with OpenStreetMap tiles and `leaflet.markercluster`, using
  stored `lat`/`lng` populated by one-off geocoding (cached) or a small table of
  campus places.
- Proposed additive schema changes: `starts_at`, `ends_at`, `venue_name`,
  `address`, `lat`, `lng`, `description`, `url`, `source_id`, `external_id` and
  `updated_at` on `events`, plus `sources` and `geocache` tables and a unique
  index on `(source_id, external_id)`.
- Not yet implemented. A decision is still needed on whether to write it as an
  ADR or start with the migration.
