# Process overview

## The build

## Picking the stack

## Scoping

## Building it

## Directing, grounding and correcting the agent

## What I'd still change

---

## Reference trace: commits ↔ conversation logs

Scratch reference only, built from `git log` and `docs/conversation*.md`, for
tracing back what happened and when while writing the sections above. Not
part of the submission text itself.

### 2026-09-28 — initial scaffold
- [`6b7a4b8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/6b7a4b8) — Initial commit. No conversation log.

### 2026-10-06 — core app (no conversation log recorded for this date)
- [`3cf6d07`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/3cf6d07) — Build the Quad events app: core check-in loop, card UI, ADR scaffold. First working Fastify + `node:sqlite` server; users/events/check-ins schema; login, hosting, check-in routes; 5 new spec tests added.
- [`b98926e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/b98926e) — Add categories, pricing, a mocked checkout, and sidebar sort/filter. `welcome-mixer` kept at $0 deliberately so existing spec tests didn't need a payment step.

### 2026-10-07 — docs/conversation.md (crit 8/9 admin) + docs/conversation_2026-10-07-social-aggregator.md
- [`59257a9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/59257a9) — Update process docs and add crit-8 reflection. Committed `PROCESS.md`, `README.md`, ADR 0001, `reflections/crit-8.md` ahead of crit 8 preflight/deploy.
- [`34973e8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/34973e8) — Add conversation log (the crit-8/9 log, `docs/conversation.md`).
- [`a2da6bf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/a2da6bf) — Added conversation.md rules in CLAUDE.md.
- [`c3d4bd3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/c3d4bd3) — update claude.md.
- [`4ed4dd0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/4ed4dd0) — Add schema for event sources, geocoding and imports.
- [`8b62fec`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/8b62fec) — Extend the add-event form with venue, address, description and URL.
- [`4dd9fbd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/4dd9fbd) — Add an event map (Leaflet + OSM + marker clustering).
- [`e30cc04`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/e30cc04) — Import events from ICS feeds, with cached geocoding.
- [`5d0c0af`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/5d0c0af) — Add Ticketmaster as an optional ticketed-events supplement.
- [`911f261`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/911f261) — Add ADR 0002 and update conversation log.
- [`7cafd98`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/7cafd98) — Split imported holidays into their own list, off the map and grid.
- [`dc945c1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/dc945c1) — Remove the holidays list; add ADR 0003 for a social aggregator. Holidays reverted after deciding to pivot to the social aggregator instead.
- [`e6bff9e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/e6bff9e) — Add the social feed: schema, post normaliser, /social page, hide.
- [`2d35825`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/2d35825) — Add social connectors for YouTube, Reddit, Bluesky, Mastodon, X, Instagram, Facebook.
- [`885180d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/885180d) — Let users paste a post link onto an event page (oEmbed).
- [`65dfa28`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/65dfa28) — Add conversation log for the social aggregator session (this is `docs/conversation_2026-10-07-social-aggregator.md`).
- Platform notes logged that session: Bluesky needs an app password, Reddit API keys need manual approval, X costs ~US$0.005/post read, Instagram/Facebook need Meta app review, Mastodon hashtag search needs no credentials.

### 2026-10-08 — three conversation logs (demo-tags, site-redesign, social-events)
- [`64a4655`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/64a4655) — Restore the app to its crit-8 state. Rollback before the redesign branch work.
- [`915603f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/915603f) — Redesign Quad: password login, home page, profile/settings, dev admin. Built via Opus orchestrator on `worktree-site-redesign`, stopped partway by the user; see `docs/conversation_2026-10-08-site-redesign.md`.
- [`a65bb67`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/a65bb67) — Add conversation log for the site redesign session.
- [`28867ee`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/28867ee) — Extend Quad into a social event platform. Sidebar app shell, rich event page, Discover/My Events/Saved/Tickets/Map/Communities/Activity/Announcements/Messages, localStorage-backed client state. See `docs/conversation_2026-10-08-social-events.md` entries 1–6.
- [`a6346f0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/a6346f0) — Add real coordinates and address lookup for events. `src/geocode.js` via Nominatim, cached, off-switchable; see log entry 8.
- [`4341211`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/4341211) — Tag seeded dummy users and events with a DEMO label. Built on `worktree-demo-tags`; see `docs/conversation_2026-10-08-demo-tags.md` — not merged to main in that session (merged later, see 2026-10-17 `5097055`).
- [`fcd9d07`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/fcd9d07) — Correct the DEMO tag contrast figure to 6.4:1.
- [`aab241a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/aab241a) — Swap the drawn maps for real OpenFreeMap maps. MapLibre GL JS 5.24.0 via pinned CDN + SRI; see log entry 9.

### 2026-10-14 — docs/conversation_2026-10-14-theme-colors.md
- [`25d423a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/25d423a) — Merge worktree-site-redesign into main.
- [`13e0121`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/13e0121) — reflection done (crit-9 reflection, inferred from date).
- [`dc8812e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/dc8812e) — Add accent colour palettes and a light/dark/system theme dial. Built on `feature/theme-light-mode`; see conversation log — plan recorded but log notes implementation was still in progress when written.
- [`9827b83`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/9827b83) — Persist guest theme via cookie; widen site-main on large screens.

### 2026-10-17 — docs/conversation_2026-10-17-event-image-curation.md
- [`a2c905a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/a2c905a) — Cache, gzip, and ETag the /style.css response.
- [`c31d591`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/c31d591) — Add real event cover photos for the placeholder image slots.
- [`6bebe6c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/6bebe6c) — Rename event cover photos to category-based filenames.
- [`416f6d0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/416f6d0) — Resize and compress event cover images to cut homepage load time. 173MB → 11.3MB (93% reduction) via `sharp`, used as a temporary devDependency then removed.
- [`258111a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/258111a) — Curate event cover images to match each event's specific theme. Added explicit `EVENT_COVERS` slug→filename map in `src/event-images.js`, checked before the category-hash fallback. Root cause noted in the log: slug-hash into a small per-category pool meant unrelated events in the same category could share a photo.
- [`c7c3ca0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/c7c3ca0) — Log event image resize and curation session (this conversation log).
- [`5097055`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/5097055) — Merge branch 'worktree-demo-tags' into worktree-merge-main.
- [`13a427b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/13a427b) — Merge branch 'feature/theme-light-mode' into worktree-merge-main.
- [`dabbf9b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/dabbf9b) — Wire direct messages to a server-backed dm_messages table.
- [`2dc4c59`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/2dc4c59) — Merge branch 'worktree-dm-server-backed' into worktree-merge-main.

### 2026-10-21 — no conversation log recorded for this date
- [`85ab7d8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/85ab7d8) — Add event image assets.
- [`d94420a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/d94420a) — Fix broken CI: restore demo tag on check-in list, fix stale test.
- [`3f067c1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/3f067c1) — Remove uncompressed event image originals.
- [`24a934f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/24a934f) — Add crit-10 reflection scaffold.
- [`0c7e150`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/0c7e150) — Fill in crit-10 reflection.

### 2026-10-22 — docs/conversation_2026-10-22-ui-polish.md
- [`6d2f356`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/6d2f356) — Redirect home page Browse events button to /discover.
- [`d1fe51b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/d1fe51b) — Switch Quad's default accent colour from orange to purple.
- [`51c4cae`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/51c4cae) — Turn Coming up carousel into an animated, auto-playing slideshow on wide screens.
- [`8972ce3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/8972ce3) — Add a brief page-load overlay. Progressive enhancement, no-JS safe, respects reduced motion, ~420ms CSS animation.
- [`efa7e51`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/efa7e51) — Animate the home hero illustration. Entrance waits for the loader to finish; off under reduced motion.
- [`65b3394`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/65b3394) — Make the desktop sidebar collapsible to an icon rail. State persisted under `quad:sidebar-collapsed`, restored pre-paint.
- [`f6ef271`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/f6ef271) — Log this session's conversation (this file).
- [`f4f468d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/f4f468d) — Merge branch 'worktree-redirect-browse-events'.
- [`4469401`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/4469401) — Merge branch 'worktree-purple-accent'.
- [`038cdad`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/038cdad) — Merge branch 'worktree-coming-up-carousel'.
- Verification note from the log: `pnpm check` passed 9/9; only headless screenshots taken, not a live interactive browser check.

### 2026-10-26 — no conversation log recorded for this date
- [`c6a188e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/c6a188e) — Redesign the Coming up section as a one-at-a-time animated slider.
- [`6b41299`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/6b41299) — Credit Pexels for images in the site footer.
- [`90950f3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/90950f3) — Turn the Coming up slider into a continuous, draggable filmstrip.
- [`fdd9c26`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/fdd9c26) — Shrink slider cards and keep the drift animating on hover.
- [`f53809a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/f53809a) — Make slider cards genuinely small, not just the slide width.
- [`7b2d55d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/7b2d55d) — Bring slider card width back up to 12.5rem.
- [`285b5c3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/285b5c3) — Make slider cards a uniform height.
- [`e47de7f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/e47de7f) — Animate the home hero SVG and make it interactive.
- [`3ac19ce`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/3ac19ce) — Make the hero illustration respond to pointer and click.
- [`baff49f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/baff49f) — Merge remote-tracking branch 'origin/feature/theme-light-mode' into merge-all.
- [`cb33cb0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/cb33cb0) — Merge remote-tracking branch 'origin/worktree-footer-pexels-credit' into merge-all.
- [`4bd51fd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/4bd51fd) — Merge worktree-purple-accent, reconciling hero animation with light-mode's new entrance sequence.

### 2026-10-29 — no conversation log recorded for this date (this session)
- [`41afd8f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/41afd8f) — Merge branch 'worktree-coming-up-carousel' (updated tip). Branch had diverged from what main had previously merged; re-merged the current tip.
- [`cf9bfc8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/cf9bfc8) — Merge branch 'merge-all' (theme-light-mode, footer pexels credit, purple accent hero). Brought in the three branches `merge-all` had already combined.
- Session also: deleted 5 fully-merged branches (local + remote) and their worktrees where not locked by another active session; deployed current `main` to Fly (`comp4020-final-soybeaam.fly.dev`); renamed 28 (local) + 4 (Fly volume) leftover "Spec-created event {timestamp}" rows to names matching their assigned cover photos, directly in each `data/app.db` (gitignored, no commit needed for that part).

### 2026-10-30 — docs/conversation_2026-10-30-auth-leak-tests.md
- Asked what tests would catch auth bugs and user-data leaks across the
  session-cookie/password login system and the social/DM features, then to
  write them.
- [`33bf948`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/33bf948) — Fix a FOREIGN KEY crash when rotating a token with DM history. `rotateToken()` in `src/db.js` moves every row referencing a user's old session token to their new one on a password change or "log out everywhere", but never learned about `dm_messages` (added after `rotateToken()` was written) and its two token columns, `from_token`/`to_token`. Any user who had sent or received a DM then changed their password hit a SQLite foreign-key violation and a 500. Found while writing the password-change test below, reproduced live against the dev server before the fix, confirmed fixed after it (clean 302, rotated `from_token` in the database).
- [`f538fb9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/f538fb9) — Add `spec/auth.test.ts`, 10 new tests, none failing by the time this committed (the one real failure they caught, the FK crash above, was already fixed in the prior commit). Covers: a tampered/forged session cookie never being accepted as a valid session; logout clearing the session; a password change rotating the token and invalidating every other device's session; `/settings`, `/messages`, `/my-events`, `/notifications` and `/tickets` all redirecting an anonymous visitor to `/login` (`/saved` deliberately excluded — client-side localStorage state only, nothing private server-side); an anonymous visitor being unable to send a DM; a DM thread never reaching a third, uninvolved user even if they guess the thread id via `?thread=`; messaging yourself as a way to read someone else's thread being rejected; another user's profile never exposing their email or password hash; the attendee list never exposing a raw session token (regression test for a gap `PROCESS.md` had flagged); and an unknown email vs. a wrong password producing an identical login response. Runs as three accounts (sam, maya, tom) kept separate from `events.test.ts`'s shared `alex@quad.test`.
- Verification: all 19 tests passing (9 existing + 10 new), typecheck clean, re-run repeatedly against the persistent dev database for consistency.

### 2026-10-30/31 — testing walkthrough + Docker CI check + accent-colour bug (this session, docs/conversation.md)
- Asked for a walkthrough of what testing needed doing; audited `spec/` (noting a pasted PROCESS.md quote was from a different repo, `comp4020-final-yunlin`, not this one — no `live.test.ts`/presence feature here) and ran `pnpm check` locally: 9/9 passing at that point.
- Built and ran the `Dockerfile` image with a throwaway `/data`, pointed `APP_URL` at it, and ran `pnpm check` against it three times in direct succession, matching what CI does on push. Two of those three runs failed, each on a different test (`/saved` not redirecting an anonymous visitor; a seeded login unexpectedly returning 401 mid-suite) — later traced to another session actively committing `spec/auth.test.ts` and the `rotateToken()` fix (`33bf948`/`f538fb9` above) into the same shared checkout while the Docker builds were running, not to any bug in a stable codebase. Lesson applied: Docker CI-equivalent checks now run from an isolated worktree, not the shared checkout, so a concurrent commit can't land mid-build.
- Asked whether an accent-colour-not-updating-across-pages bug had been addressed in any prior session — it hadn't; `docs/conversation_2026-10-14-theme-colors.md` only records a plan, not an implementation note, and no other log mentions it.
- User confirmed the bug independently (accent colour set on one page not applying when navigating to another) and asked for a fix regardless.
- [`ad875da`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/ad875da) — Fix accent colour not applying when navigating between pages. `client.js`'s `save()` helper stores the chosen accent via `JSON.stringify` (`"blue"` becomes the literal 4-character string `"blue"`, quotes included), but `THEME_HEAD_SCRIPT` in `src/views.js` — the pre-paint script that runs in `<head>` on every page, before the stylesheet, specifically to avoid a flash of the wrong colours on navigation — read the value back with a plain `localStorage.getItem` and no `JSON.parse`. Every page except the one the colour was picked on got `data-accent='"blue"'`, which matches no `[data-accent="blue"]` rule in `style.css`, so it silently fell back to purple. The Settings page itself looked unaffected only because `client.js`'s own change handler sets `data-accent` directly from the raw form value on interaction, bypassing the broken read; the bug only showed on navigating away. Fix: parse the stored value the same way `client.js`'s own `load()` helper does, matching the already-correct `quad:sidebar-collapsed` handling one line below it in the same script (that one worked because `JSON.stringify(true)` doesn't add quotes).
- Verification: `pnpm check` (typecheck + 19/19 tests) passing both locally and against a freshly built Docker image on a clean worktree checkout.
- Also surfaced, not fixed: `spec/invariants.test.ts`'s README-heading check failed once against a locally-run dev server (expected heading "What's live today", README said "What's available today") — confirmed pre-existing and unrelated to the accent fix, but passed again on a later Docker build, implying the README heading was already reconciled by a concurrent session. No code change made for this on the branch described above.
