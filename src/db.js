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

  -- One profile row per user (1:1). user_id is users.token, so the existing
  -- token stays the identity everything else already references. email and
  -- created_at live on users and are joined in by getProfile(), not copied.
  -- preferences/interests hold JSON text; role and subscription are plain
  -- labels with a default so a brand-new user needs no profile input.
  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(token),
    username TEXT UNIQUE,
    display_name TEXT,
    profile_photo TEXT,
    date_of_birth TEXT,
    location TEXT,
    language TEXT NOT NULL DEFAULT 'en',
    timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
    preferences TEXT NOT NULL DEFAULT '{}',
    interests TEXT NOT NULL DEFAULT '[]',
    role TEXT NOT NULL DEFAULT 'student',
    subscription TEXT NOT NULL DEFAULT 'free',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

export const CATEGORIES = ["Social", "Workshop", "Quiz/Trivia", "Sport", "Party", "Other"];

export function findOrCreateUser(email) {
  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (existing) return existing;
  const token = crypto.randomUUID();
  db.prepare("INSERT INTO users (token, email) VALUES (?, ?)").run(token, email);
  db.prepare("INSERT INTO user_profiles (user_id) VALUES (?)").run(token);
  return { token, email };
}

export function userByToken(token) {
  return db.prepare("SELECT * FROM users WHERE token = ?").get(token);
}

const PROFILE_FIELDS = [
  "username", "display_name", "profile_photo", "date_of_birth", "location",
  "language", "timezone", "role", "subscription",
];
const PROFILE_JSON_FIELDS = ["preferences", "interests"];

// Full UserProfile: email/created_at from users, the rest from user_profiles.
// Users created before the profile table existed get their row on first read.
export function getProfile(userId) {
  db.prepare("INSERT OR IGNORE INTO user_profiles (user_id) VALUES (?)").run(userId);
  const row = db
    .prepare(
      `SELECT p.user_id, p.username, p.display_name, u.email, p.profile_photo,
              p.date_of_birth, p.location, p.language, p.timezone,
              p.preferences, p.interests, p.role, p.subscription,
              u.created_at, p.updated_at
         FROM user_profiles p JOIN users u ON u.token = p.user_id
        WHERE p.user_id = ?`,
    )
    .get(userId);
  if (!row) return undefined;
  return {
    ...row,
    preferences: JSON.parse(row.preferences),
    interests: JSON.parse(row.interests),
  };
}

// Partial update: only keys present in `fields` change. Unknown keys (email,
// user_id, created_at) are ignored; they aren't editable through the profile.
export function updateProfile(userId, fields) {
  getProfile(userId); // ensure the row exists
  const sets = [];
  const values = [];
  for (const key of PROFILE_FIELDS) {
    if (key in fields) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  for (const key of PROFILE_JSON_FIELDS) {
    if (key in fields) {
      sets.push(`${key} = ?`);
      values.push(JSON.stringify(fields[key]));
    }
  }
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    db.prepare(`UPDATE user_profiles SET ${sets.join(", ")} WHERE user_id = ?`).run(
      ...values,
      userId,
    );
  }
  return getProfile(userId);
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
      `SELECT users.email, checkins.created_at FROM checkins
       JOIN users ON users.token = checkins.user_token
       WHERE checkins.event_slug = ?
       ORDER BY checkins.created_at ASC`,
    )
    .all(eventSlug);
}
