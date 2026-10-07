// ICS feed importer (step 4 of the events-sources plan). Fetches a source's
// feed, parses VEVENTs, geocodes venues, and upserts into `events` keyed by
// (source_id, external_id).
import ical from "node-ical";
import { upsertImportedEvent } from "../db.js";
import { geocode } from "./geocode.js";

// node-ical gives a plain string for a bare property (e.g. SUMMARY:foo),
// but an object shaped like {params, val} when the property carries ICS
// parameters (e.g. SUMMARY;LANGUAGE=en-us:foo) - seen in the wild against a
// real public holidays feed during manual testing. Normalize both shapes to
// a plain string so a parameterized field doesn't surface as "[object
// Object]".
function textValue(field) {
  if (field == null) return null;
  if (typeof field === "object" && "val" in field) return String(field.val);
  return String(field);
}

// Parses raw ICS text into plain event objects, with no fetch/geocode/DB
// work - split out from importIcsSource() so it can be unit-tested against
// a fixture string with no network call. Skips any VEVENT missing a UID or
// SUMMARY, since upsertImportedEvent can't key or title a row without them.
export function parseIcsEvents(icsText) {
  const parsed = ical.parseICS(icsText);
  const events = [];
  for (const key of Object.keys(parsed)) {
    const component = parsed[key];
    if (!component || component.type !== "VEVENT") continue;
    if (!component.uid || !component.summary) continue;

    events.push({
      external_id: textValue(component.uid),
      title: textValue(component.summary),
      starts_at: component.start instanceof Date ? component.start.toISOString() : null,
      ends_at: component.end instanceof Date ? component.end.toISOString() : null,
      venue_name: textValue(component.location),
      description: textValue(component.description),
      url: textValue(component.url),
    });
  }
  return events;
}

// Fetches `source.url`, parses it, geocodes each venue, and upserts every
// event found. Never throws: a bad feed, a bad fetch, or one bad VEVENT
// each degrade to a recorded error rather than aborting the whole run.
export async function importIcsSource(source) {
  const summary = { sourceId: source.id, imported: 0, skipped: 0, errors: [] };

  let icsText;
  try {
    const res = await fetch(source.url);
    if (!res.ok) {
      summary.errors.push(`fetch failed: HTTP ${res.status}`);
      return summary;
    }
    icsText = await res.text();
  } catch (err) {
    summary.errors.push(`fetch failed: ${err?.message ?? err}`);
    return summary;
  }

  let events;
  try {
    const parsed = ical.parseICS(icsText);
    const vevents = Object.values(parsed).filter((c) => c && c.type === "VEVENT");
    events = parseIcsEvents(icsText);
    summary.skipped += vevents.length - events.length;
  } catch (err) {
    summary.errors.push(`parse failed: ${err?.message ?? err}`);
    return summary;
  }

  for (const event of events) {
    try {
      let lat = null;
      let lng = null;
      if (event.venue_name) {
        const coords = await geocode(event.venue_name);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        }
      }

      upsertImportedEvent({
        source_id: source.id,
        external_id: event.external_id,
        title: event.title,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        venue_name: event.venue_name,
        address: null,
        lat,
        lng,
        description: event.description,
        url: event.url,
        category: null,
        price_cents: 0,
      });
      summary.imported++;
    } catch (err) {
      summary.skipped++;
      summary.errors.push(`event ${event.external_id ?? "?"}: ${err?.message ?? err}`);
    }
  }

  return summary;
}
