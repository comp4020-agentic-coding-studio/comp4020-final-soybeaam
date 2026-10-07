# Conversation log

Written: 2026-10-07 17:17 AUSEST

A summary of this Claude Code session, not a verbatim transcript.

## Crit 9 social aggregator build

### Events sources, map and imports (~15:15)
- Planned and built ICS/iCal feeds as primary source with Ticketmaster optional.
- Added Quad user form to submit events with venue, address, description and URL.
- Built Leaflet map on /map with OpenStreetMap tiles and markercluster.
- Implemented ICS importer with cached Nominatim geocoding and GitHub Actions scheduler.
- Five commits: schema for sources/geocache/places (4ed4dd0), extended add-event form (8b62fec), /map clustering (4dd9fbd), ICS importer with caching (e30cc04), optional Ticketmaster importer (5d0c0af).
- Committed ADR 0002 (911f261).

### Testing with seed data (~15:45 to ~15:55)
- Ran pnpm import:events with no source configured (nothing imported).
- No static ANU feed found. Suggested public Australian holidays ICS.
- Seeded holidays feed and imported 65 events, 50 geocoded.
- Started dev server on :8080. Discovered DATA_DIR resolves to C:\data on Windows, not ./data.
- Built /holidays page with sidebar showing non-clickable holiday list and date filter (7cafd98).

### Social media aggregator design and build (~16:05 onwards)
- User requested aggregator pulling from Instagram, X, Facebook, YouTube, Reddit and more by hashtag, keyword, profile and geotag (no scraping).
- Analysis found official APIs have limited public access: YouTube, Reddit, Bluesky and Mastodon allow public hashtag search; Instagram and Facebook need Meta app review; X is paid; geotag search mostly gone.
- Proposed three options, user chose: open-API connectors plus paste-a-link fallback, remove holidays entirely, add hide button for moderation.
- Built in four commits: reverted holidays and committed ADR 0003, deleted 65 holiday events and source (dc945c1); social tables, post normaliser, /social feed page and hide button (e6bff9e); connectors for YouTube, Reddit, Bluesky, Mastodon, X, Instagram, Facebook plus pnpm social:add/list (2d35825); paste-a-link oEmbed on event pages with sandboxed iframe embeds (885180d). Fixed bug where failed re-paste wiped stored embed.
- 133 tests pass.

### Platform notes
- Bluesky search now requires app password.
- Reddit API keys need manual approval since November 2025.
- X costs about US$0.005 per post read (roughly US$6/day at current schedule).
- Instagram and Facebook require Meta app review.
- Mastodon hashtags work with no credentials. Seeded mastodon hashtag canberra and imported 23 posts.

## Open items
- Check embeds render in real browser.
- Decide whether to use X (cost).
- Update README "What's live today" section to mention map, imports and social feed.
- Nothing from social work yet pushed.
