// Shared geocoding lookup used by importers (and, inline, by the manual
// add-event form): places (free, known campus venues) -> geocache (free,
// previously-resolved queries, including cached "not found" results) ->
// Nominatim (rate-limited network call, last resort).
import { lookupPlaceCoords, getGeocache, setGeocache } from "../db.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Quad/1.0 (COMP4020 student project)";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resolves free text (a venue name or address) to {lat, lng} or null.
//
// The ~1 req/sec Nominatim rate limit is enforced HERE (inside geocode()),
// gated on whether this call actually made a network request, rather than
// in the caller: the caller (import-events.js / ics.js) loops over many
// events and venues, often repeating the same venue name across events, so
// gating the sleep on "did I just hit the network" means repeated venues
// within one import run cost nothing extra, and the one-import-script
// caller doesn't need to remember to pace itself.
export async function geocode(text) {
  const normalized = String(text ?? "").trim().toLowerCase();
  if (!normalized) return null;

  const place = lookupPlaceCoords(normalized);
  if (place) return place;

  const cached = getGeocache(normalized);
  if (cached !== undefined) {
    // cached is either {lat, lng} (a found result) or {lat: null, lng: null}
    // (cached as "not found") - either way, no network call needed.
    return cached.lat != null && cached.lng != null ? cached : null;
  }

  let result = null;
  try {
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(normalized)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (res.ok) {
      const data = await res.json();
      const first = Array.isArray(data) ? data[0] : null;
      if (first && first.lat != null && first.lon != null) {
        result = { lat: Number(first.lat), lng: Number(first.lon) };
      }
    }
  } catch {
    // network failure, non-200 that threw, or malformed JSON: treat as "no
    // result" rather than letting a geocoding failure crash the import.
    result = null;
  }

  setGeocache(normalized, result?.lat ?? null, result?.lng ?? null);
  await sleep(1000);
  return result;
}
