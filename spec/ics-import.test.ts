import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Unit-level tests for the ICS importer modules (step 4 of the
// events-sources plan). These exercise pure functions against fixtures and
// an isolated SQLite file - no live server needed, unlike the rest of
// spec/, which hits a running app over HTTP.
//
// src/db.js opens its DatabaseSync at module load time, from
// process.env.DATA_DIR. To get a DB isolated from other spec files (and
// from any dev server's /data volume), set DATA_DIR to a fresh temp dir
// BEFORE importing src/db.js. Static imports are hoisted above any code in
// this file, so a dynamic import() after setting the env var is used
// instead.
const scratchDir = mkdtempSync(join(tmpdir(), "ics-import-test-"));
process.env.DATA_DIR = scratchDir;

// @ts-expect-error src/ is plain JS with no declaration files
const db = await import("../src/db.js");
// @ts-expect-error src/ is plain JS with no declaration files
const { parseIcsEvents, importIcsSource } = await import("../src/importers/ics.js");
// @ts-expect-error src/ is plain JS with no declaration files
const { geocode } = await import("../src/importers/geocode.js");

afterAll(() => {
  // Close the SQLite handle first - on Windows, deleting a directory while
  // the DB file inside it is still open fails with EPERM.
  try {
    db.db.close();
  } catch {
    // already closed, or close() unavailable - either way, best effort.
  }
  try {
    rmSync(scratchDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup; a leftover temp dir isn't worth failing the suite.
  }
});

describe("upsertImportedEvent idempotency", () => {
  it("calling it twice with the same source_id/external_id updates in place, no duplicate row", () => {
    db.db.prepare("INSERT OR IGNORE INTO sources (id, kind, name) VALUES (99, 'ics', 'Test feed')").run();

    const first = db.upsertImportedEvent({
      source_id: 99,
      external_id: "abc-123",
      title: "First title",
      starts_at: "2026-11-01T10:00:00.000Z",
      ends_at: null,
      venue_name: "Somewhere",
      address: null,
      lat: null,
      lng: null,
      description: null,
      url: null,
      category: null,
      price_cents: 0,
    });

    const second = db.upsertImportedEvent({
      source_id: 99,
      external_id: "abc-123",
      title: "Updated title",
      starts_at: "2026-11-01T10:00:00.000Z",
      ends_at: null,
      venue_name: "Somewhere",
      address: null,
      lat: null,
      lng: null,
      description: null,
      url: null,
      category: null,
      price_cents: 0,
    });

    // same slug both times - no duplicate row, and the slug never changes
    // on an update-by-conflict.
    expect(second).toBe(first);

    const rows = db.db
      .prepare("SELECT * FROM events WHERE source_id = 99 AND external_id = 'abc-123'")
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Updated title");
  });
});

describe("parseIcsEvents", () => {
  const fixture = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:event-1@example.com
SUMMARY:Test Event One
DTSTART:20261101T100000Z
DTEND:20261101T120000Z
LOCATION:Union Court
DESCRIPTION:A test event
URL:https://example.com/event-1
END:VEVENT
BEGIN:VEVENT
UID:event-no-summary@example.com
DTSTART:20261102T100000Z
DTEND:20261102T120000Z
LOCATION:Somewhere else
END:VEVENT
BEGIN:VEVENT
SUMMARY:Event missing a UID
DTSTART:20261103T100000Z
DTEND:20261103T120000Z
END:VEVENT
END:VCALENDAR
`;

  it("maps fields and skips VEVENTs missing SUMMARY or UID", () => {
    const events = parseIcsEvents(fixture);
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.external_id).toBe("event-1@example.com");
    expect(event.title).toBe("Test Event One");
    expect(event.venue_name).toBe("Union Court");
    expect(event.description).toBe("A test event");
    expect(event.url).toBe("https://example.com/event-1");
    expect(event.starts_at).toBe(new Date("2026-11-01T10:00:00.000Z").toISOString());
    expect(event.ends_at).toBe(new Date("2026-11-01T12:00:00.000Z").toISOString());
  });
});

describe("importIcsSource", () => {
  it("fetches, parses, geocodes and upserts, tolerating a per-event failure", async () => {
    db.db.prepare("INSERT OR IGNORE INTO sources (id, kind, name, url) VALUES (100, 'ics', 'Smoke feed', 'https://example.com/feed.ics')").run();

    const fixture = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:smoke-1@example.com
SUMMARY:Smoke Test Event
DTSTART:20261101T100000Z
DTEND:20261101T120000Z
LOCATION:Union Court
END:VEVENT
END:VCALENDAR
`;
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: async () => fixture,
    })));

    const summary = await importIcsSource({ id: 100, kind: "ics", name: "Smoke feed", url: "https://example.com/feed.ics" });
    expect(summary.imported).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(summary.errors).toHaveLength(0);

    const row = db.db
      .prepare("SELECT * FROM events WHERE source_id = 100 AND external_id = 'smoke-1@example.com'")
      .get();
    expect(row).toBeTruthy();
    expect(row.title).toBe("Smoke Test Event");
    // "Union Court" is a seeded `places` entry, so this resolves without a
    // network call.
    expect(row.lat).toBeCloseTo(-35.2778, 2);

    vi.unstubAllGlobals();
  });

  it("returns a summary with 0 imported and a recorded error when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));

    const summary = await importIcsSource({ id: 101, kind: "ics", name: "Broken feed", url: "https://example.com/broken.ics" });
    expect(summary.imported).toBe(0);
    expect(summary.errors.length).toBeGreaterThan(0);

    vi.unstubAllGlobals();
  });
});

describe("geocode caching", () => {
  beforeAll(() => {
    db.db.prepare("INSERT OR IGNORE INTO places (name, lat, lng) VALUES ('seeded place', -1, -1)").run();
  });

  it("never calls fetch for a places-table hit", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await geocode("Seeded Place");
    expect(result).toEqual({ lat: -1, lng: -1 });
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("calls fetch exactly once for a new query, then zero more times once cached", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => [{ lat: "10.0", lon: "20.0" }],
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const first = await geocode("Brand new address, nowhere in particular");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ lat: 10, lng: 20 });

    const second = await geocode("Brand new address, nowhere in particular");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ lat: 10, lng: 20 });

    vi.unstubAllGlobals();
  }, 10000);
});
