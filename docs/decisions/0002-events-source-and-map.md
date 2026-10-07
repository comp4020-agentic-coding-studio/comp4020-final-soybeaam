# ADR 0002: Live events source and map rendering

## Status

Proposed (week 9) — not yet implemented. See `docs/conversation.md` for the
discussion this records.

## Context

The app wants to show events pulled from outside sources (other universities,
clubs, external organisers), and to let people find them on a map with pins
and clustering. This has to run on the same constraints as ADR 0001: one
shared-cpu-1x Fly machine, 256 MB memory, one SQLite file on `/data`, and (from
crit 9) events updating live in every open session within about a second. The
extra requirement for this decision is **efficiency**: fetching, storing and
rendering events must not become the thing that makes the app slow or blows
the memory budget.

## Options considered: events source

| Option | Pros | Cons |
|---|---|---|
| Eventbrite | Familiar, large inventory of student/club-style events. | As far as I know, the public event-search API was discontinued around 2020; the only API access left is to events you own. Scraping breaks their terms of service and is brittle against markup changes — expensive to maintain for no efficiency gain. |
| ICS / iCal feeds | One parser (e.g. `ical.js`) handles every source. No API key, no rate limit beyond politeness, no terms-of-service risk. Feeds are small text files — cheap to fetch and cheap to diff against what's stored. Stable per-event `UID` makes re-imports an upsert, not a re-scrape. | Not every organiser publishes one. Feed quality varies (some omit end times or venue addresses), so description/venue fields can be missing or messy. |
| Ticketmaster Discovery API | Free tier, structured JSON, returns venue lat/lng directly — no geocoding step needed for those events. | Only covers ticketed commercial events (gigs, sport, shows), not club or student events, so it's a supplement, not a primary source. Needs a key kept out of the repo. |
| Meetup API | Covers community/club-style events, which fits the app's audience. | Paid or access-restricted; not worth the setup cost for a 256 MB side project. |

## Options considered: map rendering

| Option | Pros | Cons |
|---|---|---|
| Leaflet + OpenStreetMap tiles + `leaflet.markercluster` | No API key, no billing. OSM tiles are cached by the browser and by OSM's CDN, so the server never serves map imagery. Clustering runs entirely client-side — zero server CPU, and it is the part of this decision that most directly protects the shared-cpu-1x machine. Small library footprint. | Tile styling is plain compared to vendor maps. Heavy tile usage (not expected here) is subject to OSM's fair-use policy. |
| MapLibre GL (vector tiles) | Nicer rendering, smooth zoom. | Larger JS bundle, more client-side GPU/CPU work per device, and vector tile hosting is an extra piece of infrastructure (or another vendor) to manage. More than this app needs. |
| Google Maps / Mapbox GL JS | Best-known UX, mature clustering libraries. | API key, usage billing, and another vendor dependency the course stack doesn't need. Works against keeping cost and surface area down. |

## Decision

- **Primary source: ICS/iCal feeds**, parsed on a schedule and upserted into
  `events` keyed by `(source_id, external_id)`. Add the **Ticketmaster
  Discovery API** only if ticketed non-student events are wanted — it is
  additive, not a dependency the app needs to function.
- **Map: Leaflet + OpenStreetMap tiles + `leaflet.markercluster`**, loaded
  client-side, with coordinates stored on the event (`lat`, `lng`) rather than
  computed on every request.
- **Geocoding runs once per address, cached**, in a `geocache` table keyed by
  the normalised address string, so the same venue is never looked up twice.
  A small `places` table of known campus buildings (ANU, the Union) avoids
  geocoding entirely for the most common venues.

This keeps every expensive step — fetching a feed, geocoding an address,
rendering map tiles — off the request path for an ordinary page view, which is
the main efficiency goal: a visitor loading the events list or map triggers no
external HTTP call, only a read from SQLite.

## Consequences / cost

- **Server load stays flat as events grow.** Imports run on a timer (or a
  manual trigger), not per-request, so traffic to the app doesn't scale fetch
  cost. Clustering cost moves to the client's browser, which is free from the
  server's point of view and matches the 256 MB budget.
- **Geocoding is rate-limited (Nominatim: ~1 request/second) and only needed
  once per unique address.** For a campus-sized event list this is a one-off
  cost at import time, not an ongoing one. If the import volume ever grows
  past what Nominatim's fair-use policy allows, a paid geocoder would be a
  drop-in replacement behind the same `geocache` table.
- **Real-time (crit 9) interacts with imports.** An import that changes an
  event already on someone's screen is exactly the kind of concurrent-update
  case crit 9 asks the app to decide on — what the open session sees change,
  and whether it's flagged as updated or just silently replaced. That decision
  belongs in its own ADR once crit 9's design is settled, not duplicated here.
- **Feed coverage is a real gap.** ICS-only misses any organiser without a
  calendar feed, and no specific ANU/club feed URLs have been confirmed yet —
  that's a research task, not a technical risk, but it means the first version
  may have a short source list.
- **No vendor map bill, but a styling ceiling.** Leaflet/OSM is the cheapest
  and lowest-maintenance option and keeps the app free of a third-party map
  API key, at the cost of a plainer map than MapLibre or Google Maps would
  give. For an events-locator feature that's judged on "can I find something
  nearby" rather than visual polish, that trade favours efficiency over
  presentation.
