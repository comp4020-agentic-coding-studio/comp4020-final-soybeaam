# Conversation log

Written: 2026-10-17 15:30:00 AUSEST

A summary of this Claude Code session, not a verbatim transcript.

## Dev server port
- Asked which port the dev server runs on. Answer: 8080, from
  `src/server.js` (`process.env.PORT ?? 8080`).

## Localhost not reachable
- The user could not reach localhost:8080. The server process was not running.
- Restarted it and confirmed it returns 200.

## Slow homepage load
- The site felt slower than before. `src/assets/event_images/` totalled 173MB
  of full-resolution Pexels photos, some up to 13.8MB each.
- Every homepage load pulls these through the event carousel and grid cards.

## Image resize
- User approved resizing. Used `sharp` as a temporary devDependency, then
  removed it.
- All 62 images resized to max width 1600px and re-encoded as JPEG quality 78.
- Total size went from 172.7MB to 11.3MB (93% reduction). No visible quality
  loss at card size.
- Committed as its own commit.

## Images did not match events
- The user noticed the photos did not match the events they represented.
- Cause: each event's slug was hashed into its category's small photo pool.
  For example, all "Music" events drew from 2 photos, so a techno basement
  night and an acoustic rooftop session could get the same kind of image.

## Per-event image curation
- Reviewed the content of all 62 images, directly and via a delegated subagent
  review, and matched them against the titles and descriptions of the 29 seed
  events.
- Added an explicit `EVENT_COVERS` slug-to-filename map in
  `src/event-images.js`. It is checked first.
- The old category-hash pool still applies as a fallback. It covers events
  created through the app, which have no hand-picked photo.
- Committed as a separate commit from the resize work.

## Verification
- No duplicate images across the 29 seed events. No missing or unlisted images.
- `pnpm typecheck` passed. `pnpm test` passed (8/8).
- Spot-checked the live server. Pasta & Wine Night shows a cooking photo.
  Community Football shows a stadium football photo.
