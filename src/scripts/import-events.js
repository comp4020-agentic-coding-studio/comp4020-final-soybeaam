// Batch import script (step 4 of the events-sources plan). Run via
// `pnpm import:events` (locally against ./data, or in production via the
// scheduled GitHub Actions workflow over `flyctl ssh console`). Shares
// src/db.js's DATA_DIR-resolved SQLite file, so it operates on the same
// data the running server sees - no separate DB, no HTTP round trip.
import { db } from "../db.js";
import { importIcsSource } from "../importers/ics.js";

async function main() {
  const sources = db.prepare("SELECT * FROM sources WHERE kind = 'ics'").all();

  for (const source of sources) {
    const result = await importIcsSource(source);
    console.log(
      `[ics] ${source.name}: imported ${result.imported}, skipped ${result.skipped}` +
        (result.errors.length ? `, errors: ${result.errors.join("; ")}` : ""),
    );
  }

  // Ticketmaster import (step 5) goes here
  if (process.env.TICKETMASTER_API_KEY) {
    console.log("TICKETMASTER_API_KEY is set, but Ticketmaster import isn't implemented yet (step 5).");
  }
}

await main();
