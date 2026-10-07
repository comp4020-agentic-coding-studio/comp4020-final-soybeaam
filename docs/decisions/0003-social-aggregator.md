# ADR 0003: Social media aggregator for local event content

## Status

Accepted (week 9). Decided with the user:

- Build Option A (open-API connectors) with Option C (paste a post URL) as the
  fallback.
- Remove the `/holidays` list from `7cafd98` entirely, including the seeded
  holiday source and its events in the dev DB. The ICS importer stays.
- First-version moderation is a hide button for logged-in users.

## Context

The goal is to collect posts about local events from Instagram, X/Twitter,
Facebook, YouTube, Reddit and others, matched by hashtag, keyword, profile or
location, and show them in the site. The brief rules out scraping. That rules
out any platform without an official API, or whose API doesn't offer the kind
of search the feature needs.

ADR 0001 and 0002 constraints still apply. The app runs on one 256 MB
shared-cpu-1x machine that scales to zero, with SQLite on one volume. No
external call can sit on an ordinary page-view path, and API keys go in Fly
secrets, never in the (public) repo.

## What each platform's official API actually allows

These are my understanding of the APIs, not verified against current terms. They
change often, so recheck each one before building its connector.

| Platform | Hashtag / keyword search | Profile posts | Geotag search | Cost / access |
|---|---|---|---|---|
| YouTube Data API v3 | Yes (`search.list`, `q=`) | Yes (channel uploads) | Partial (`location` + `locationRadius` on video search) | Free API key, daily quota |
| Reddit API | Yes (subreddit search) | Yes (user / subreddit listings) | No | Free OAuth app, rate-limited, non-commercial terms |
| Bluesky (AT Protocol) | Yes (`searchPosts`) | Yes | No | Free, public |
| Mastodon | Yes (hashtag timelines, per instance) | Yes | No | Free, public |
| Instagram Graph API | Hashtag search only for *your own* Business account, about 30 hashtags a week | Only accounts you own or that authorise you | No (location search removed) | Meta app review + Business account |
| Facebook Graph API | No public post search | Only Pages you manage | No | Meta app review |
| X / Twitter API | Yes (recent search) | Yes | Mostly removed | Paid tier for search (no useful free read access) |

Two consequences:

1. **"Pull any public post by hashtag" is realistic for YouTube, Reddit,
   Bluesky and Mastodon only.** Instagram and Facebook only expose content from
   accounts that connect to the app, and X charges for search.
2. **Geotag search is effectively gone** everywhere except YouTube's radius
   search. Location has to come from keywords instead (e.g. "Canberra",
   "ANU", a venue name), matched against the event's own venue.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| A. Build connectors for the open APIs (YouTube, Reddit, Bluesky, Mastodon) now; leave Instagram/Facebook/X as connectors that run only when a key or connected account exists | No cost, no app review, every connector is official API. Same out-of-band import pattern as ICS (ADR 0002). | No Instagram/Facebook/X content until an account owner connects or a paid key is bought. |
| B. Use a paid aggregator service (e.g. Curator, Juicer, Walls.io) and embed its widget | Covers Instagram/Facebook/X legally through their own approvals; least code. | Monthly cost, a third-party script on every feed page, posts never reach our DB so they can't be tied to events or filtered server-side. |
| C. Official oEmbed embeds only (paste a post URL, render the platform's embed) | Works for almost every platform with no key, including Instagram and X. | Not an aggregator: someone has to find and paste each post. Each embed loads that platform's JS, which is heavy. |

## Decision (proposed)

**Option A, with C as the manual fallback.**

- **Connectors:** `src/importers/social/{youtube,reddit,bluesky,mastodon}.js`
  run in the existing `pnpm import:events` script. Each one is skipped cleanly
  when its key is missing, like Ticketmaster today. Instagram, Facebook and X
  get stub connectors that only run when a token is configured, and are
  documented as needing account connection or a paid tier.
- **Queries are data, not code:** a `social_queries` table holds
  `(platform, kind, value)` rows, where kind is `hashtag | keyword | profile |
  geo`. An optional `event_slug` ties a query to an event so its posts show on
  that event's page as well as the feed.
- **Manual fallback:** a logged-in user can paste a post URL on an event page.
  The server resolves it via the platform's oEmbed endpoint and stores it as a
  post. No gatekeeper, matching README point 3.
- **"Real-time"** means posts arrive at import frequency (every 30 min via the
  existing GitHub Actions schedule), then reach open pages through whatever
  live-update mechanism crit 9 adds. Polling platform APIs on page views is
  ruled out for efficiency and rate-limit reasons.

## Schema

```sql
CREATE TABLE social_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,      -- 'youtube' | 'reddit' | 'bluesky' | 'mastodon' | 'instagram' | 'facebook' | 'x'
  kind TEXT NOT NULL,          -- 'hashtag' | 'keyword' | 'profile' | 'geo'
  value TEXT NOT NULL,         -- '#anuo-week', 'canberra events', '@anusa', '-35.28,149.12,5km'
  event_slug TEXT REFERENCES events(slug),
  last_run_at TEXT,
  last_error TEXT,
  UNIQUE (platform, kind, value)
);

CREATE TABLE social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,   -- the platform's own post id
  query_id INTEGER REFERENCES social_queries(id),  -- NULL for manually pasted posts
  event_slug TEXT REFERENCES events(slug),
  author_name TEXT,
  author_handle TEXT,
  author_url TEXT,
  text TEXT,
  media_url TEXT,              -- first image/thumbnail only
  media_type TEXT,             -- 'image' | 'video' | NULL
  permalink TEXT NOT NULL,     -- always link back to the original
  posted_at TEXT,
  embed_html TEXT,             -- oEmbed HTML, only for manually pasted posts
  hidden_at TEXT,              -- set by the hide button; NULL = visible
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (platform, external_id)
);
CREATE INDEX idx_social_posts_posted ON social_posts(posted_at DESC);
CREATE INDEX idx_social_posts_event ON social_posts(event_slug) WHERE event_slug IS NOT NULL;
```

`UNIQUE (platform, external_id)` makes re-imports upserts, as with ICS.

## Parsing and missing data

Every platform returns a different shape, and almost every field is optional
somewhere (deleted authors, text-only posts, posts with no timestamp in an
embed, video-only posts). Rules:

**Backend (each connector):**
- Each connector maps its API response to one normalised object through a
  single `normalisePost()` per platform. That function is the only place that
  knows the platform's JSON shape.
- **Required:** `platform`, `external_id`, `permalink`. A post missing any of
  these is skipped and counted, never stored half-formed. Without a permalink
  we can't attribute or link back, which platform terms require.
- **Optional, stored as NULL, never as `""` or `"undefined"`:** author fields,
  text, media, `posted_at`.
- Text is stored as plain text, with HTML stripped and length capped (e.g.
  2,000 characters). It is escaped at render time, not trusted at import time.
- `posted_at` is converted to ISO 8601 UTC. An unparseable date becomes NULL
  rather than a guess.
- `media_url` is kept only if it's `https://`. Anything else becomes NULL.
- A connector failure (bad key, rate limit, network) is recorded in
  `social_queries.last_error` and the run continues with the next query, the
  same resilience pattern as `importIcsSource`.

**Frontend (feed and event-page views):**
- Each card renders only the parts that exist: no empty author line, no broken
  image, no "Invalid Date".
- Missing author → "Unknown author". Missing time → time line omitted. Missing
  text and media → card shows only the platform badge and "View on
  <platform>". Since permalink is required, this is never a dead card.
- Images get `loading="lazy"`, explicit dimensions, and an `onerror` handler
  that hides the image, so an expired CDN link (common for Instagram and
  Reddit thumbnails) doesn't leave a broken-image icon.
- Pasted oEmbed HTML loads only on the event page that uses it, never in the
  feed grid, for the same reason Leaflet only loads on `/map`.

## Consequences / cost

- **Platform coverage is uneven, and the README must say so.** Instagram and
  Facebook, probably the platforms students use most for events, are the least
  reachable. The manual paste fallback is what covers them.
- **Terms of use.** Reddit's free API is non-commercial, and every platform
  requires attribution and a link back. The `permalink`-required rule and
  author fields handle the second; the first is fine for a course project but
  would need revisiting for anything commercial.
- **Moderation becomes real.** Aggregated public posts can contain anything.
  The README lists moderation as a future item. Pulling from public hashtags
  makes it more pressing than user-hosted events did, because the posting
  happens off-platform. The first version adds a `hidden_at` column and a
  hide button any logged-in user can press. Hidden posts stay in the DB (so
  a re-import doesn't resurrect them) but are never rendered. There is no
  approval step, so this doesn't add the gatekeeper README point 3 rules out.
- **Storage stays small.** Only metadata and one media URL per post, no media
  files. Thousands of posts fit comfortably in SQLite on the 1 GB volume.
- **Removing `/holidays`.** The holidays page, its sidebar link and
  `listHolidays` are removed by reverting `7cafd98`. That also removes the
  manual-only filter on the home grid and map, so events imported from real
  ICS calendars show alongside hosted ones again, as ADR 0002 intended. The
  ICS importer itself stays.
