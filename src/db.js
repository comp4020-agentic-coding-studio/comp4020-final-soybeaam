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
    is_demo INTEGER NOT NULL DEFAULT 0,
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
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_slug TEXT NOT NULL REFERENCES events(slug),
    user_token TEXT NOT NULL REFERENCES users(token),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (event_slug, user_token)
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
if (!existingColumns.has("is_demo")) {
  db.exec("ALTER TABLE events ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0");
}
const userColumns = new Set(
  db.prepare("PRAGMA table_info(users)").all().map((c) => c.name),
);
if (!userColumns.has("is_demo")) {
  db.exec("ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0");
}

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
  const insert = db.prepare(
    "INSERT INTO events (slug, title, event_date, location, affiliation, category, price_cents) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  // welcome-mixer stays free ($0): spec/events.test.ts checks in to it
  // directly, with no payment step, so it must never carry a price.
  insert.run("welcome-mixer", "Welcome mixer", "2026-10-10", "Union Court", "ANU", "Social", 0);
  insert.run(
    "club-trivia-night",
    "Club trivia night",
    "2026-10-15",
    "Marie Reay 4.03",
    "Trivia Club",
    "Quiz/Trivia",
    1500,
  );
  insert.run("study-sprint", "Study sprint", "2026-10-20", "R.G. Menzies Library", null, "Workshop", 0);
}

// Demo data: dummy hosts and attendees for the seeded events, flagged with
// is_demo so the UI can label them and nobody mistakes them for real people.
// This runs on every boot rather than inside the empty-database seed above,
// because existing databases (local, and the Fly volume) already have events
// and would otherwise never get the flags. Every statement is idempotent.
// Domain is .invalid (RFC 2606) so it can't collide with a real address, nor
// with the spec's @example.com test users.
const DEMO_USERS = ["alex.demo@quad.invalid", "priya.demo@quad.invalid", "sam.demo@quad.invalid"];
const DEMO_EVENTS = [
  // [slug, host, attendees]
  ["welcome-mixer", "alex.demo@quad.invalid", ["priya.demo@quad.invalid", "sam.demo@quad.invalid"]],
  ["club-trivia-night", "priya.demo@quad.invalid", ["alex.demo@quad.invalid"]],
  ["study-sprint", "sam.demo@quad.invalid", ["priya.demo@quad.invalid"]],
];
{
  const insertUser = db.prepare(
    "INSERT OR IGNORE INTO users (token, email, is_demo) VALUES (?, ?, 1)",
  );
  const tokenFor = db.prepare("SELECT token FROM users WHERE email = ?");
  for (const email of DEMO_USERS) insertUser.run(crypto.randomUUID(), email);
  db.prepare(
    `UPDATE users SET is_demo = 1 WHERE email IN (${DEMO_USERS.map(() => "?").join(", ")})`,
  ).run(...DEMO_USERS);

  const markEvent = db.prepare("UPDATE events SET is_demo = 1 WHERE slug = ?");
  // Only claim a host for seeded events that have none, so a real host is
  // never overwritten.
  const setHost = db.prepare(
    "UPDATE events SET created_by = ? WHERE slug = ? AND created_by IS NULL",
  );
  const demoCheckin = db.prepare(
    `INSERT OR IGNORE INTO checkins (event_slug, user_token)
     SELECT ?, ? WHERE EXISTS (SELECT 1 FROM events WHERE slug = ?)`,
  );
  for (const [slug, host, guests] of DEMO_EVENTS) {
    markEvent.run(slug);
    setHost.run(tokenFor.get(host).token, slug);
    for (const guest of guests) demoCheckin.run(slug, tokenFor.get(guest).token, slug);
  }
}

export const CATEGORIES = ["Social", "Workshop", "Quiz/Trivia", "Sport", "Party", "Other"];

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
  let sql = `SELECT events.*, users.email AS host_email, users.is_demo AS host_is_demo,
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

// Same host join as listEvents, so the event page can name (and tag) the host
// without ever touching created_by.
export function getEvent(slug) {
  return db
    .prepare(
      `SELECT events.*, users.email AS host_email, users.is_demo AS host_is_demo
       FROM events LEFT JOIN users ON users.token = events.created_by
       WHERE events.slug = ?`,
    )
    .get(slug);
}

export function createEvent({ title, event_date, location, affiliation, category, price_cents, created_by }) {
  const slug = slugify(title);
  db.prepare(
    `INSERT INTO events (slug, title, event_date, location, affiliation, category, price_cents, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    slug,
    title,
    event_date || null,
    location || null,
    affiliation || null,
    category || null,
    Number(price_cents) || 0,
    created_by || null,
  );
  return slug;
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
      `SELECT users.email, users.is_demo, checkins.created_at FROM checkins
       JOIN users ON users.token = checkins.user_token
       WHERE checkins.event_slug = ?
       ORDER BY checkins.created_at ASC`,
    )
    .all(eventSlug);
}
