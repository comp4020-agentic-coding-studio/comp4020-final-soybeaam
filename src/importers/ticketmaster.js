// Ticketmaster Discovery API importer (step 5 of the events-sources plan).
// Shares the same upsert path as the ICS importer, but is gated on an API
// key (a secret, set via TICKETMASTER_API_KEY / flyctl secrets, never
// committed). Ticketmaster usually returns venue lat/lng directly, so this
// importer does not geocode unless a venue is genuinely missing coordinates,
// in which case it falls back to the shared geocode() lookup for
// consistency with the ICS importer.
import { upsertImportedEvent } from "../db.js";
import { geocode } from "./geocode.js";

const DISCOVERY_URL = "https://app.ticketmaster.com/discovery/v2/events.json";

// Maps one Discovery API event object to the upsertImportedEvent shape.
// Returns null if the event is missing id/name - can't key or title a row
// without them, same skip pattern as the ICS importer.
function mapEvent(event) {
  if (!event?.id || !event?.name) return null;

  const venue = event._embedded?.venues?.[0];
  const priceRange = event.priceRanges?.[0];

  return {
    external_id: event.id,
    title: event.name,
    starts_at: event.dates?.start?.dateTime || event.dates?.start?.localDate || null,
    venue_name: venue?.name ?? null,
    address: venue?.address?.line1 ?? null,
    lat: venue?.location?.latitude != null ? Number(venue.location.latitude) : null,
    lng: venue?.location?.longitude != null ? Number(venue.location.longitude) : null,
    description: event.info || event.pleaseNote || null,
    url: event.url ?? null,
    price_cents: priceRange?.min != null ? Math.round(priceRange.min * 100) : 0,
  };
}

// Fetches events from the Ticketmaster Discovery API for `source` and
// upserts them. Never throws: no API key, a bad fetch, a bad response shape,
// or one bad event each degrade to a no-op/recorded-error rather than
// aborting the whole run.
export async function importTicketmasterEvents(source, { apiKey, city } = {}) {
  const summary = { sourceId: source?.id, imported: 0, skipped: 0, errors: [] };

  if (!apiKey) {
    summary.note = "no API key configured";
    return summary;
  }

  const resolvedCity = city || "Canberra";
  const url = `${DISCOVERY_URL}?apikey=${encodeURIComponent(apiKey)}&city=${encodeURIComponent(resolvedCity)}&size=50`;

  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      summary.errors.push(`fetch failed: HTTP ${res.status}`);
      return summary;
    }
    data = await res.json();
  } catch (err) {
    summary.errors.push(`fetch failed: ${err?.message ?? err}`);
    return summary;
  }

  // No `_embedded` key at all means zero results, not an error.
  const events = data?._embedded?.events;
  if (!Array.isArray(events)) {
    return summary;
  }

  for (const rawEvent of events) {
    try {
      const mapped = mapEvent(rawEvent);
      if (!mapped) {
        summary.skipped++;
        continue;
      }

      let { lat, lng } = mapped;
      if ((lat == null || lng == null) && mapped.venue_name) {
        const coords = await geocode(mapped.venue_name);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        }
      }

      upsertImportedEvent({
        source_id: source.id,
        external_id: mapped.external_id,
        title: mapped.title,
        starts_at: mapped.starts_at,
        ends_at: null,
        venue_name: mapped.venue_name,
        address: mapped.address,
        lat,
        lng,
        description: mapped.description,
        url: mapped.url,
        category: null,
        price_cents: mapped.price_cents,
      });
      summary.imported++;
    } catch (err) {
      summary.skipped++;
      summary.errors.push(`event ${rawEvent?.id ?? "?"}: ${err?.message ?? err}`);
    }
  }

  return summary;
}
