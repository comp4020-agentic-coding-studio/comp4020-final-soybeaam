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
  const insert = db.prepare(
    "INSERT INTO events (slug, title, event_date, location, affiliation) VALUES (?, ?, ?, ?, ?)",
  );
  insert.run("welcome-mixer", "Welcome mixer", "2026-10-10", "Union Court", "ANU");
  insert.run("club-trivia-night", "Club trivia night", "2026-10-15", "Marie Reay 4.03", "Trivia Club");
  insert.run("study-sprint", "Study sprint", "2026-10-20", "R.G. Menzies Library", null);
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

export function listEvents() {
  // host_email comes from the join so views never need created_by (which holds
  // the host's session token and must not be rendered).
  return db
    .prepare(
      `SELECT events.*, users.email AS host_email,
              (SELECT COUNT(*) FROM checkins WHERE checkins.event_slug = events.slug) AS attendee_count
       FROM events LEFT JOIN users ON users.token = events.created_by
       ORDER BY events.created_at DESC`,
    )
    .all();
}

export function getEvent(slug) {
  return db.prepare("SELECT * FROM events WHERE slug = ?").get(slug);
}

export function createEvent({ title, event_date, location, affiliation, created_by }) {
  const slug = slugify(title);
  db.prepare(
    "INSERT INTO events (slug, title, event_date, location, affiliation, created_by) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(slug, title, event_date || null, location || null, affiliation || null, created_by || null);
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
      `SELECT users.email, checkins.created_at FROM checkins
       JOIN users ON users.token = checkins.user_token
       WHERE checkins.event_slug = ?
       ORDER BY checkins.created_at ASC`,
    )
    .all(eventSlug);
}
