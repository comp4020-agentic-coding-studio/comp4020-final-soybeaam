// Batch import script (step 4 of the events-sources plan). Run via
// `pnpm import:events` (locally against ./data, or in production via the
// scheduled GitHub Actions workflow over `flyctl ssh console`). Shares
// src/db.js's DATA_DIR-resolved SQLite file, so it operates on the same
// data the running server sees - no separate DB, no HTTP round trip.
import { db, findOrCreateSource } from "../db.js";
import { importIcsSource } from "../importers/ics.js";
import { importTicketmasterEvents } from "../importers/ticketmaster.js";
import { runSocialImport } from "../importers/social/index.js";

async function main() {
  const sources = db.prepare("SELECT * FROM sources WHERE kind = 'ics'").all();

  for (const source of sources) {
    const result = await importIcsSource(source);
    console.log(
      `[ics] ${source.name}: imported ${result.imported}, skipped ${result.skipped}` +
        (result.errors.length ? `, errors: ${result.errors.join("; ")}` : ""),
    );
  }

  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (apiKey) {
    const source = findOrCreateSource({ kind: "ticketmaster", name: "Ticketmaster" });
    const result = await importTicketmasterEvents(source, { apiKey });
    console.log(
      `[ticketmaster] ${source.name}: imported ${result.imported}, skipped ${result.skipped}` +
        (result.errors.length ? `, errors: ${result.errors.join("; ")}` : ""),
    );
  } else {
    console.log("[ticketmaster] skipped: TICKETMASTER_API_KEY not configured");
  }

  // Social posts (ADR 0003). Each query is skipped cleanly when its
  // platform's credentials are missing.
  await runSocialImport();
}

await main();
