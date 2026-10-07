import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// One SQLite file on the volume Fly mounts at /data (fly.toml). Locally, or
// in CI's throwaway container, DATA_DIR falls back to ./data so there's
// nothing extra to set up.
const dataDir = process.env.DATA_DIR ?? "/data";
const dbPath = `${dataDir}/app.db`;

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    token TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    event_date TEXT,
    location TEXT,
    affiliation TEXT,
    category TEXT,
    price_cents INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_slug TEXT NOT NULL REFERENCES events(slug),
    user_token TEXT NOT NULL REFERENCES users(token),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (event_slug, user_token)
  );

  CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS geocache (
    query TEXT PRIMARY KEY,
    lat REAL,
    lng REAL,
    resolved_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS places (
    name TEXT PRIMARY KEY,
    lat REAL NOT NULL,
    lng REAL NOT NULL
  );

  -- Social aggregator (ADR 0003). Queries are data, not code: each row is one
  -- (platform, kind, value) search the importer runs. Posts are upserted on
  -- (platform, external_id), and hidden_at is set by the hide button.
  CREATE TABLE IF NOT EXISTS social_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    kind TEXT NOT NULL,
    value TEXT NOT NULL,
    event_slug TEXT REFERENCES events(slug),
    last_run_at TEXT,
    last_error TEXT,
    UNIQUE (platform, kind, value)
  );

  CREATE TABLE IF NOT EXISTS social_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    external_id TEXT NOT NULL,
    query_id INTEGER REFERENCES social_queries(id),
    event_slug TEXT REFERENCES events(slug),
    author_name TEXT,
    author_handle TEXT,
    author_url TEXT,
    text TEXT,
    media_url TEXT,
    media_type TEXT,
    permalink TEXT NOT NULL,
    posted_at TEXT,
    embed_html TEXT,
    hidden_at TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (platform, external_id)
  );
`);

// Older databases (the local ./data dir, or the Fly volume from before this
// column existed) were created before `category`/`price_cents` existed.
// CREATE TABLE IF NOT EXISTS doesn't retrofit new columns, so add them by
// hand, guarded by PRAGMA table_info rather than SQLite's "ADD COLUMN IF NOT
// EXISTS" (only available on newer SQLite than we want to depend on).
const existingColumns = new Set(
  db.prepare("PRAGMA table_info(events)").all().map((c) => c.name),
);
if (!existingColumns.has("category")) {
  db.exec("ALTER TABLE events ADD COLUMN category TEXT");
}
if (!existingColumns.has("price_cents")) {
  db.exec("ALTER TABLE events ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0");
}
if (!existingColumns.has("starts_at")) {
  db.exec("ALTER TABLE events ADD COLUMN starts_at TEXT");
}
if (!existingColumns.has("ends_at")) {
  db.exec("ALTER TABLE events ADD COLUMN ends_at TEXT");
}
if (!existingColumns.has("venue_name")) {
  db.exec("ALTER TABLE events ADD COLUMN venue_name TEXT");
}
if (!existingColumns.has("address")) {
  db.exec("ALTER TABLE events ADD COLUMN address TEXT");
}
if (!existingColumns.has("lat")) {
  db.exec("ALTER TABLE events ADD COLUMN lat REAL");
}
if (!existingColumns.has("lng")) {
  db.exec("ALTER TABLE events ADD COLUMN lng REAL");
}
if (!existingColumns.has("description")) {
  db.exec("ALTER TABLE events ADD COLUMN description TEXT");
}
if (!existingColumns.has("url")) {
  db.exec("ALTER TABLE events ADD COLUMN url TEXT");
}
if (!existingColumns.has("source_id")) {
  db.exec("ALTER TABLE events ADD COLUMN source_id INTEGER");
}
if (!existingColumns.has("external_id")) {
  db.exec("ALTER TABLE events ADD COLUMN external_id TEXT");
}
if (!existingColumns.has("updated_at")) {
  db.exec("ALTER TABLE events ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
}

// Partial unique index backing upsertImportedEvent's ON CONFLICT target, and
// a plain index to support map-bounds queries once lat/lng are populated.
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_events_source_external
    ON events(source_id, external_id) WHERE external_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_events_latlng
    ON events(lat, lng) WHERE lat IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_social_posts_posted
    ON social_posts(posted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_social_posts_event
    ON social_posts(event_slug) WHERE event_slug IS NOT NULL;
`);

function slugify(title) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let slug = base || "event";
  let n = 1;
  const exists = db.prepare("SELECT 1 FROM events WHERE slug = ?");
  while (exists.get(slug)) slug = `${base}-${++n}`;
  return slug;
}

// Seed a few placeholder events on first boot so a stranger with no account
// yet has something to check in to immediately.
const count = db.prepare("SELECT COUNT(*) AS n FROM events").get();
if (count.n === 0) {
  // Seed source: manual entries (including these seeded events) are
  // attributed to source_id=1 so imported events can be told apart later.
  db.prepare("INSERT OR IGNORE INTO sources (id, kind, name) VALUES (1, 'manual', 'Quad')").run();

  // Approximate real-world coordinates for the three seeded ANU venues
  // (Canberra campus), plausible but not survey-precise.
  const places = db.prepare("INSERT OR IGNORE INTO places (name, lat, lng) VALUES (?, ?, ?)");
  places.run("Union Court", -35.2778, 149.1185);
  places.run("Marie Reay 4.03", -35.2772, 149.1202);
  places.run("R.G. Menzies Library", -35.2782, 149.1197);

  const insert = db.prepare(
    "INSERT INTO events (slug, title, event_date, location, affiliation, category, price_cents, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  // welcome-mixer stays free ($0): spec/events.test.ts checks in to it
  // directly, with no payment step, so it must never carry a price.
  insert.run("welcome-mixer", "Welcome mixer", "2026-10-10", "Union Court", "ANU", "Social", 0, 1);
  insert.run(
    "club-trivia-night",
    "Club trivia night",
    "2026-10-15",
    "Marie Reay 4.03",
    "Trivia Club",
    "Quiz/Trivia",
    1500,
    1,
  );
  insert.run("study-sprint", "Study sprint", "2026-10-20", "R.G. Menzies Library", null, "Workshop", 0, 1);
}

export const CATEGORIES = ["Social", "Workshop", "Quiz/Trivia", "Sport", "Party", "Other"];

// Finds a sources row by kind (one row per kind is all importers need so
// far), or creates one. Mirrors findOrCreateUser's find-or-create shape.
export function findOrCreateSource({ kind, name, url }) {
  const existing = db.prepare("SELECT * FROM sources WHERE kind = ?").get(kind);
  if (existing) return existing;
  db.prepare("INSERT INTO sources (kind, name, url) VALUES (?, ?, ?)").run(kind, name, url ?? null);
  return db.prepare("SELECT * FROM sources WHERE kind = ?").get(kind);
}

export function findOrCreateUser(email) {
  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (existing) return existing;
  const token = crypto.randomUUID();
  db.prepare("INSERT INTO users (token, email) VALUES (?, ?)").run(token, email);
  return { token, email };
}

export function userByToken(token) {
  return db.prepare("SELECT * FROM users WHERE token = ?").get(token);
}

// sort: "name_asc" | "name_desc" | "soonest" | "latest" (default: latest-created, as before)
// category: exact match against events.category, or falsy for no filter
export function listEvents({ sort, category } = {}) {
  // host_email comes from the join so views never need created_by (which holds
  // the host's session token and must not be rendered).
  let sql = `SELECT events.*, users.email AS host_email,
              (SELECT COUNT(*) FROM checkins WHERE checkins.event_slug = events.slug) AS attendee_count
       FROM events LEFT JOIN users ON users.token = events.created_by`;
  const params = [];
  if (category) {
    sql += ` WHERE events.category = ?`;
    params.push(category);
  }
  sql +=
    {
      name_asc: " ORDER BY events.title COLLATE NOCASE ASC",
      name_desc: " ORDER BY events.title COLLATE NOCASE DESC",
      // NULLs (no date set) sort last in both directions, rather than first.
      soonest: " ORDER BY events.event_date IS NULL, events.event_date ASC",
    }[sort] ?? " ORDER BY events.created_at DESC";
  return db.prepare(sql).all(...params);
}

export function getEvent(slug) {
  return db.prepare("SELECT * FROM events WHERE slug = ?").get(slug);
}

export function createEvent({
  title,
  event_date,
  location,
  affiliation,
  category,
  price_cents,
  created_by,
  venue_name,
  address,
  description,
  url,
  source_id,
  lat,
  lng,
}) {
  const slug = slugify(title);
  db.prepare(
    `INSERT INTO events (slug, title, event_date, location, affiliation, category, price_cents, created_by, venue_name, address, description, url, source_id, lat, lng)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    slug,
    title,
    event_date || null,
    location || null,
    affiliation || null,
    category || null,
    Number(price_cents) || 0,
    created_by || null,
    venue_name || null,
    address || null,
    description || null,
    url || null,
    source_id ?? 1,
    lat ?? null,
    lng ?? null,
  );
  return slug;
}

// Minimal inline geocoding lookup for the manual add-event form (step 2 of
// the sources/map plan). Only checks the `places` table (known campus
// venues) by exact case-insensitive name match — no geocache, no network
// call, that's step 4's geocode module. Returns null, never throws, so a
// miss never blocks event creation ("no gatekeeper").
export function lookupPlaceCoords(venueOrAddressText) {
  const text = String(venueOrAddressText ?? "").trim().toLowerCase();
  if (!text) return null;
  const row = db.prepare("SELECT lat, lng FROM places WHERE lower(name) = ?").get(text);
  return row ? { lat: row.lat, lng: row.lng } : null;
}

// Geocache reads/writes for src/importers/geocode.js. A row with NULL
// lat/lng is a cached "looked up, nothing found" result — distinct from no
// row at all (never looked up) — so a failed Nominatim lookup is never
// retried on every import run.
export function getGeocache(query) {
  const key = String(query ?? "").trim().toLowerCase();
  if (!key) return undefined;
  const row = db.prepare("SELECT lat, lng FROM geocache WHERE query = ?").get(key);
  if (!row) return undefined;
  return { lat: row.lat, lng: row.lng };
}

export function setGeocache(query, lat, lng) {
  const key = String(query ?? "").trim().toLowerCase();
  if (!key) return;
  db.prepare(
    `INSERT INTO geocache (query, lat, lng) VALUES (?, ?, ?)
     ON CONFLICT(query) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, resolved_at = datetime('now')`,
  ).run(key, lat ?? null, lng ?? null);
}

// Inserts or updates an event imported from an external source (ICS,
// Ticketmaster, etc.), keyed by (source_id, external_id) via the partial
// unique index created above. The slug is generated once, on first insert;
// an update-by-conflict must never change it, so slug is intentionally left
// out of the UPDATE SET below.
export function upsertImportedEvent({
  source_id,
  external_id,
  title,
  starts_at,
  ends_at,
  venue_name,
  address,
  lat,
  lng,
  description,
  url,
  category,
  price_cents,
}) {
  const existing = db
    .prepare("SELECT slug FROM events WHERE source_id = ? AND external_id = ?")
    .get(source_id, external_id);

  if (existing) {
    db.prepare(
      `UPDATE events SET
         title = ?, starts_at = ?, ends_at = ?, venue_name = ?, address = ?,
         lat = ?, lng = ?, description = ?, url = ?, category = ?, price_cents = ?,
         updated_at = datetime('now')
       WHERE source_id = ? AND external_id = ?`,
    ).run(
      title,
      starts_at || null,
      ends_at || null,
      venue_name || null,
      address || null,
      lat ?? null,
      lng ?? null,
      description || null,
      url || null,
      category || null,
      Number(price_cents) || 0,
      source_id,
      external_id,
    );
    return existing.slug;
  }

  const slug = slugify(title);
  db.prepare(
    `INSERT INTO events
       (slug, title, starts_at, ends_at, venue_name, address, lat, lng, description, url, category, price_cents, source_id, external_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    slug,
    title,
    starts_at || null,
    ends_at || null,
    venue_name || null,
    address || null,
    lat ?? null,
    lng ?? null,
    description || null,
    url || null,
    category || null,
    Number(price_cents) || 0,
    source_id,
    external_id,
  );
  return slug;
}

// Events with known coordinates, for the /map page. Selects only what the
// map needs (not events.*), relying on idx_events_latlng via the same
// WHERE lat IS NOT NULL predicate.
export function eventsWithCoords() {
  return db
    .prepare(
      `SELECT slug, title, lat, lng, starts_at, event_date, venue_name, location
       FROM events WHERE lat IS NOT NULL`,
    )
    .all();
}

// --- Social aggregator (ADR 0003) ---

// Takes a post already cleaned by src/importers/social/normalise.js. Keyed
// on the plain UNIQUE (platform, external_id), so a re-import updates in
// place. hidden_at is deliberately absent from the UPDATE SET: a re-import
// must never un-hide a post. event_slug/query_id keep their existing value
// when the incoming one is NULL, so a later untargeted query can't detach a
// post from its event.
export function upsertSocialPost(post) {
  db.prepare(
    `INSERT INTO social_posts
       (platform, external_id, query_id, event_slug, author_name, author_handle, author_url,
        text, media_url, media_type, permalink, posted_at, embed_html)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(platform, external_id) DO UPDATE SET
       query_id = COALESCE(excluded.query_id, social_posts.query_id),
       event_slug = COALESCE(excluded.event_slug, social_posts.event_slug),
       author_name = excluded.author_name,
       author_handle = excluded.author_handle,
       author_url = excluded.author_url,
       text = excluded.text,
       media_url = excluded.media_url,
       media_type = excluded.media_type,
       permalink = excluded.permalink,
       posted_at = excluded.posted_at,
       embed_html = excluded.embed_html,
       fetched_at = datetime('now')`,
  ).run(
    post.platform,
    post.external_id,
    post.query_id ?? null,
    post.event_slug ?? null,
    post.author_name ?? null,
    post.author_handle ?? null,
    post.author_url ?? null,
    post.text ?? null,
    post.media_url ?? null,
    post.media_type ?? null,
    post.permalink,
    post.posted_at ?? null,
    post.embed_html ?? null,
  );
  return db
    .prepare("SELECT * FROM social_posts WHERE platform = ? AND external_id = ?")
    .get(post.platform, post.external_id);
}

// Visible posts only, newest first. posted_at is ISO ("...T...Z") and
// fetched_at is SQLite's "YYYY-MM-DD HH:MM:SS", which don't compare
// correctly as strings, so both go through datetime() before ordering.
export function listSocialPosts({ platform, eventSlug, limit = 50 } = {}) {
  const n = Number(limit);
  const capped = Number.isFinite(n) ? Math.min(200, Math.max(1, Math.trunc(n))) : 50;
  let sql = "SELECT * FROM social_posts WHERE hidden_at IS NULL";
  const params = [];
  if (platform) {
    sql += " AND platform = ?";
    params.push(platform);
  }
  if (eventSlug) {
    sql += " AND event_slug = ?";
    params.push(eventSlug);
  }
  sql += " ORDER BY datetime(COALESCE(posted_at, fetched_at)) DESC, id DESC LIMIT ?";
  params.push(capped);
  return db.prepare(sql).all(...params);
}

export function hideSocialPost(id) {
  const result = db
    .prepare("UPDATE social_posts SET hidden_at = datetime('now') WHERE id = ? AND hidden_at IS NULL")
    .run(id);
  return result.changes > 0;
}

export function listSocialQueries() {
  return db.prepare("SELECT * FROM social_queries ORDER BY id ASC").all();
}

export function addSocialQuery({ platform, kind, value, event_slug }) {
  db.prepare(
    "INSERT OR IGNORE INTO social_queries (platform, kind, value, event_slug) VALUES (?, ?, ?, ?)",
  ).run(platform, kind, value, event_slug ?? null);
  return db
    .prepare("SELECT * FROM social_queries WHERE platform = ? AND kind = ? AND value = ?")
    .get(platform, kind, value);
}

// error: falsy on success (clears last_error), otherwise an Error or string.
export function recordSocialQueryRun(id, error) {
  const message = error ? String(error instanceof Error ? error.message : error) : null;
  db.prepare(
    "UPDATE social_queries SET last_run_at = datetime('now'), last_error = ? WHERE id = ?",
  ).run(message, id);
}

export function checkIn(eventSlug, userToken) {
  db.prepare(
    "INSERT OR IGNORE INTO checkins (event_slug, user_token) VALUES (?, ?)",
  ).run(eventSlug, userToken);
}

export function hasCheckedIn(eventSlug, userToken) {
  return !!db
    .prepare("SELECT 1 FROM checkins WHERE event_slug = ? AND user_token = ?")
    .get(eventSlug, userToken);
}

export function attendees(eventSlug) {
  return db
    .prepare(
      `SELECT users.email, checkins.created_at FROM checkins
       JOIN users ON users.token = checkins.user_token
       WHERE checkins.event_slug = ?
       ORDER BY checkins.created_at ASC`,
    )
    .all(eventSlug);
}
