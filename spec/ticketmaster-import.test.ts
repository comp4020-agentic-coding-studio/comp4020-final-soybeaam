import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Unit-level tests for the Ticketmaster importer (step 5 of the
// events-sources plan). Same isolated-DB-via-dynamic-import technique as
// spec/ics-import.test.ts: src/db.js opens its DatabaseSync at module load
// time from process.env.DATA_DIR, so DATA_DIR must be set to a fresh temp
// dir BEFORE importing src/db.js, via a dynamic import() rather than a
// hoisted static one.
const scratchDir = mkdtempSync(join(tmpdir(), "ticketmaster-import-test-"));
process.env.DATA_DIR = scratchDir;

// @ts-expect-error src/ is plain JS with no declaration files
const db = await import("../src/db.js");
// @ts-expect-error src/ is plain JS with no declaration files
const { importTicketmasterEvents } = await import("../src/importers/ticketmaster.js");

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

db.db.prepare("INSERT OR IGNORE INTO sources (id, kind, name) VALUES (200, 'ticketmaster', 'Ticketmaster')").run();
const source = { id: 200, kind: "ticketmaster", name: "Ticketmaster" };

function fixtureResponse() {
  return {
    _embedded: {
      events: [
        {
          id: "tm-event-1",
          name: "Test Concert One",
          dates: { start: { dateTime: "2026-11-05T19:00:00Z" } },
          _embedded: {
            venues: [
              {
                name: "Test Arena",
                address: { line1: "123 Test St" },
                location: { latitude: "-35.2777", longitude: "149.1244" },
              },
            ],
          },
          priceRanges: [{ min: 45.5 }],
          url: "https://ticketmaster.example.com/event-1",
          info: "Some info about the event",
        },
        {
          id: "tm-event-2",
          name: "Test Concert Two",
          dates: { start: { localDate: "2026-11-06" } },
          _embedded: {
            venues: [{ name: "Another Venue" }],
          },
          url: "https://ticketmaster.example.com/event-2",
        },
      ],
    },
  };
}

describe("importTicketmasterEvents: no API key", () => {
  it("returns immediately with imported: 0 and makes zero fetch calls", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("fetch should not have been called");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const summary = await importTicketmasterEvents(source, { apiKey: null });
    expect(summary.imported).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(summary.errors).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    const summaryUndefined = await importTicketmasterEvents(source, {});
    expect(summaryUndefined.imported).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

describe("importTicketmasterEvents: fixture response", () => {
  it("upserts events, maps fields correctly, and converts lat/lng strings to numbers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => fixtureResponse(),
      })),
    );

    const summary = await importTicketmasterEvents(source, { apiKey: "fake-key-for-test" });
    expect(summary.imported).toBe(2);
    expect(summary.errors).toHaveLength(0);

    const row1 = db.db
      .prepare("SELECT * FROM events WHERE source_id = 200 AND external_id = 'tm-event-1'")
      .get();
    expect(row1).toBeTruthy();
    expect(row1.title).toBe("Test Concert One");
    expect(row1.venue_name).toBe("Test Arena");
    expect(row1.address).toBe("123 Test St");
    expect(typeof row1.lat).toBe("number");
    expect(typeof row1.lng).toBe("number");
    expect(row1.lat).toBeCloseTo(-35.2777, 4);
    expect(row1.lng).toBeCloseTo(149.1244, 4);
    expect(row1.price_cents).toBe(4550);
    expect(row1.description).toBe("Some info about the event");
    expect(row1.url).toBe("https://ticketmaster.example.com/event-1");
    expect(row1.starts_at).toBe("2026-11-05T19:00:00Z");

    const row2 = db.db
      .prepare("SELECT * FROM events WHERE source_id = 200 AND external_id = 'tm-event-2'")
      .get();
    expect(row2).toBeTruthy();
    expect(row2.title).toBe("Test Concert Two");
    expect(row2.starts_at).toBe("2026-11-06");
    expect(row2.price_cents).toBe(0);

    vi.unstubAllGlobals();
  });

  it("calling it again with the same fixture doesn't duplicate rows (idempotency)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => fixtureResponse(),
      })),
    );

    await importTicketmasterEvents(source, { apiKey: "fake-key-for-test" });

    const rows = db.db
      .prepare("SELECT * FROM events WHERE source_id = 200 AND external_id = 'tm-event-1'")
      .all();
    expect(rows).toHaveLength(1);

    vi.unstubAllGlobals();
  });
});

describe("importTicketmasterEvents: no _embedded key", () => {
  it("treats a response with no results as imported: 0, no error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ page: { totalElements: 0 } }),
      })),
    );

    const summary = await importTicketmasterEvents(source, { apiKey: "fake-key-for-test" });
    expect(summary.imported).toBe(0);
    expect(summary.errors).toHaveLength(0);

    vi.unstubAllGlobals();
  });
});

describe("importTicketmasterEvents: fetch failure", () => {
  it("catches a thrown fetch error and records it without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const summary = await importTicketmasterEvents(source, { apiKey: "fake-key-for-test" });
    expect(summary.imported).toBe(0);
    expect(summary.errors.length).toBeGreaterThan(0);
    expect(summary.errors[0]).toContain("network down");

    vi.unstubAllGlobals();
  });
});
