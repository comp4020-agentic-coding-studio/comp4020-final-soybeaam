import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { hashPassword, DEV_ADMIN_ENABLED } from "./auth.js";

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

// Same pattern for the account columns on users. Every database before the
// redesign has only token/email/created_at, so all of these are retrofitted.
const userColumns = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
const USER_COLUMNS = [
  ["password_hash", "TEXT"],
  ["name", "TEXT"],
  ["username", "TEXT"],
  ["avatar_url", "TEXT"],
  ["bio", "TEXT"],
  ["location", "TEXT"],
  ["interests", "TEXT"], // JSON array, stored as text
  ["role", "TEXT NOT NULL DEFAULT 'user'"], // 'user' | 'admin'
  ["theme", "TEXT NOT NULL DEFAULT 'system'"],
  ["language", "TEXT NOT NULL DEFAULT 'en'"],
  ["timezone", "TEXT NOT NULL DEFAULT 'Australia/Sydney'"],
  ["notifications_email", "INTEGER NOT NULL DEFAULT 1"],
];
for (const [name, type] of USER_COLUMNS) {
  if (!userColumns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
}
// ADD COLUMN can't carry UNIQUE, so uniqueness lives in an index. SQLite
// treats NULLs as distinct, so users without a username don't collide.
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users(username)");

// Dummy accounts for local dev and demos, all with the password "password123".
// Seeded per email rather than "when the table is empty", because existing
// databases (./data, the Fly volume) already have users. If a seeded email
// exists without a password (e.g. it logged in before passwords existed), the
// hash is set and empty profile fields are filled, never overwritten.
const SEED_USERS = [
  {
    email: "admin@quad.test",
    username: "admin",
    name: "Priya Raman",
    role: DEV_ADMIN_ENABLED ? "admin" : "user", // its password is public, so it is only an admin locally
    bio: "Looks after Quad: events, accounts and the occasional broken link.",
    location: "Canberra, ACT",
    interests: ["Admin", "Workshops"],
  },
  {
    email: "alex@quad.test",
    username: "alexc",
    name: "Alex Chen",
    role: "user",
    bio: "Second-year computing student. Usually at trivia nights or the climbing wall.",
    location: "Canberra, ACT",
    interests: ["Quiz/Trivia", "Sport"],
  },
  {
    email: "sam@quad.test",
    username: "sam.okafor",
    name: "Sam Okafor",
    role: "user",
    bio: "Runs the Thursday study sprints at Menzies. Bring snacks.",
    location: "Acton, ACT",
    interests: ["Workshop", "Social"],
  },
  {
    email: "maya@quad.test",
    username: "mayap",
    name: "Maya Patel",
    role: "user",
    bio: "Music society treasurer. Mostly here for the gigs and the free pizza.",
    location: "Braddon, ACT",
    interests: ["Party", "Social"],
  },
  {
    email: "tom@quad.test",
    username: "tomw",
    name: "Tom Walsh",
    role: "user",
    bio: "Postgrad in history. Plays social futsal on Wednesdays.",
    location: "Turner, ACT",
    interests: ["Sport", "Other"],
  },
];
const SEED_PASSWORD = "password123";
{
  const find = db.prepare("SELECT token, password_hash FROM users WHERE email = ?");
  const insert = db.prepare(
    `INSERT INTO users (token, email, password_hash, name, username, bio, location, interests, role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // COALESCE keeps anything already set. The username is only filled if no
  // other row has claimed it, so seeding can't trip the unique index.
  const fill = db.prepare(
    `UPDATE users SET
       password_hash = ?,
       name = COALESCE(name, ?),
       username = COALESCE(username, CASE WHEN EXISTS (SELECT 1 FROM users u2 WHERE u2.username = ?) THEN NULL ELSE ? END),
       bio = COALESCE(bio, ?),
       location = COALESCE(location, ?),
       interests = COALESCE(interests, ?),
       role = ?
     WHERE token = ?`,
  );
  for (const u of SEED_USERS) {
    const row = find.get(u.email);
    if (row && row.password_hash) continue; // already seeded; skip the scrypt cost
    const hash = hashPassword(SEED_PASSWORD);
    const interests = JSON.stringify(u.interests);
    if (!row) {
      insert.run(crypto.randomUUID(), u.email, hash, u.name, u.username, u.bio, u.location, interests, u.role);
    } else {
      fill.run(hash, u.name, u.username, u.username, u.bio, u.location, interests, u.role, row.token);
    }
  }
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

// The first six are the original campus categories; the rest arrived with the
// social events seeded by social-db.js.
export const CATEGORIES = [
  "Social",
  "Workshop",
  "Quiz/Trivia",
  "Sport",
  "Party",
  "Other",
  "Music",
  "Technology",
  "Food",
  "Art",
];

export function userByToken(token) {
  return db.prepare("SELECT * FROM users WHERE token = ?").get(token);
}

export function findUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(String(email ?? "").trim().toLowerCase());
}

// Usernames are stored lowercase (updateProfile/updateUserAdmin) and looked
// up case-insensitively, so "Maya" and "maya" are the same person.
export function findUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(String(username ?? "").trim());
}

// Field length limits, shared by the settings form, the admin edit form and
// their validation.
export const LIMITS = { name: 80, username: 32, bio: 280, location: 80, email: 254 };

export const USERNAME_RE = new RegExp(`^[a-z0-9._-]{2,${LIMITS.username}}$`, "i");

// The one username rule. Returns an error message, or "" if raw is fine to
// save for the user whose token is selfToken. Blank is allowed (no username).
export function usernameError(raw, selfToken) {
  const name = String(raw ?? "").trim();
  if (!name) return "";
  if (!USERNAME_RE.test(name)) return `Use 2 to ${LIMITS.username} letters, numbers, dots, dashes or underscores.`;
  const other = findUserByUsername(name);
  if (other && other.token !== selfToken) return "That username is taken.";
  return "";
}

// Runs fn inside a transaction. DatabaseSync has no transaction helper.
function inTransaction(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// "Log out everywhere": the session cookie holds users.token, so giving the
// user a new token invalidates every existing cookie. Rows that reference the
// old token (check-ins, hosted events) move with it. Returns the new token, or
// null if oldToken matched nobody.
export function rotateToken(oldToken) {
  const newToken = crypto.randomUUID();
  return inTransaction(() => {
    // node:sqlite turns foreign keys on, and checkins.user_token references
    // users.token, so the three updates are only consistent together. Defer
    // the FK check to COMMIT (this pragma resets itself after the transaction).
    db.exec("PRAGMA defer_foreign_keys = ON");
    const res = db.prepare("UPDATE users SET token = ? WHERE token = ?").run(newToken, oldToken);
    if (res.changes === 0) return null;
    db.prepare("UPDATE checkins SET user_token = ? WHERE user_token = ?").run(newToken, oldToken);
    db.prepare("UPDATE events SET created_by = ? WHERE created_by = ?").run(newToken, oldToken);
    // Tables added by social-db.js. Checked by name so db.js still works on
    // its own, before (or without) social-db.js creating them.
    for (const table of ["event_maybes", "chat_messages", "announcements"]) {
      const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
      if (exists) db.prepare(`UPDATE ${table} SET user_token = ? WHERE user_token = ?`).run(newToken, oldToken);
    }
    return newToken;
  });
}

// Empty strings become NULL so a cleared field reads as "not set", and a
// blank username never collides with another blank one in the unique index.
function blankToNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Lowercase so the case-sensitive unique index can't hold both "Maya" and "maya".
function usernameValue(v) {
  return blankToNull(v)?.toLowerCase() ?? null;
}

// "a, b, A" -> ["a", "b"]: trimmed, blanks dropped, case-insensitive dedupe.
export function splitInterests(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text ?? "").split(",")) {
    const s = raw.trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  return out;
}

// users.interests is JSON text; tolerate anything else rather than throw.
export function parseInterests(text) {
  if (!text) return [];
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function interestsToText(interests) {
  if (interests === undefined || interests === null) return null;
  const list = Array.isArray(interests)
    ? interests
    : String(interests).split(",");
  const clean = list.map((s) => String(s).trim()).filter(Boolean);
  return clean.length ? JSON.stringify(clean) : null;
}

// Only the keys passed are changed: undefined leaves a field alone, "" (or
// null) clears it. Throws on a duplicate username (SQLite UNIQUE constraint,
// errcode 2067); callers should check findUserByUsername first for a
// friendly message.
export function updateProfile(token, fields = {}) {
  const sets = [];
  const params = [];
  for (const key of ["name", "username", "bio", "location", "avatar_url"]) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = ?`);
    params.push(key === "username" ? usernameValue(fields[key]) : blankToNull(fields[key]));
  }
  if (fields.interests !== undefined) {
    sets.push("interests = ?");
    params.push(interestsToText(fields.interests));
  }
  if (!sets.length) return;
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE token = ?`).run(...params, token);
}

export const THEMES = ["system", "light", "dark"];

// Only the keys passed are changed. theme falls back to 'system' if it isn't
// one of THEMES; notifications_email is stored as 0/1.
export function updatePreferences(token, { theme, language, timezone, notifications_email } = {}) {
  const sets = [];
  const params = [];
  if (theme !== undefined) {
    sets.push("theme = ?");
    params.push(THEMES.includes(theme) ? theme : "system");
  }
  if (language !== undefined) {
    sets.push("language = ?");
    params.push(blankToNull(language) ?? "en");
  }
  if (timezone !== undefined) {
    sets.push("timezone = ?");
    params.push(blankToNull(timezone) ?? "Australia/Sydney");
  }
  if (notifications_email !== undefined) {
    sets.push("notifications_email = ?");
    params.push(notifications_email && notifications_email !== "0" ? 1 : 0);
  }
  if (!sets.length) return;
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE token = ?`).run(...params, token);
}

export function setPassword(token, hash) {
  db.prepare("UPDATE users SET password_hash = ? WHERE token = ?").run(hash, token);
}

// q: substring match on name/email/username. role: 'user' | 'admin' | falsy.
// sort: "name" | "email" | "created" | "checkins" (default: newest first).
// Rows include checkin_count. They also include token, which is the session
// secret: use it for lookups/forms server-side, never render it.
export function listUsers({ q, role, sort } = {}) {
  let sql = `SELECT users.*,
               (SELECT COUNT(*) FROM checkins WHERE checkins.user_token = users.token) AS checkin_count
             FROM users`;
  const where = [];
  const params = [];
  if (q && String(q).trim()) {
    const like = `%${String(q).trim()}%`;
    where.push("(users.name LIKE ? OR users.email LIKE ? OR users.username LIKE ?)");
    params.push(like, like, like);
  }
  if (role === "user" || role === "admin") {
    where.push("users.role = ?");
    params.push(role);
  }
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql +=
    {
      name: " ORDER BY users.name IS NULL, users.name COLLATE NOCASE ASC",
      email: " ORDER BY users.email COLLATE NOCASE ASC",
      created: " ORDER BY users.created_at DESC",
      checkins: " ORDER BY checkin_count DESC, users.email ASC",
    }[sort] ?? " ORDER BY users.created_at DESC";
  return db.prepare(sql).all(...params);
}

// Admin edit. Only the keys passed are changed; role must be 'user' or 'admin'.
// Same duplicate-username caveat as updateProfile.
export function updateUserAdmin(token, fields = {}) {
  const allowed = ["name", "username", "email", "bio", "location", "avatar_url"];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = ?`);
    if (key === "email") params.push(String(fields.email).trim().toLowerCase());
    else if (key === "username") params.push(usernameValue(fields.username));
    else params.push(blankToNull(fields[key]));
  }
  if (fields.interests !== undefined) {
    sets.push("interests = ?");
    params.push(interestsToText(fields.interests));
  }
  if (fields.role !== undefined) {
    if (fields.role !== "user" && fields.role !== "admin") throw new Error(`invalid role: ${fields.role}`);
    sets.push("role = ?");
    params.push(fields.role);
  }
  if (!sets.length) return;
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE token = ?`).run(...params, token);
}

export function stats() {
  const n = (sql) => db.prepare(sql).get().n;
  return {
    users: n("SELECT COUNT(*) AS n FROM users"),
    admins: n("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'"),
    events: n("SELECT COUNT(*) AS n FROM events"),
    checkins: n("SELECT COUNT(*) AS n FROM checkins"),
    checkins_last_7_days: n("SELECT COUNT(*) AS n FROM checkins WHERE created_at >= datetime('now', '-7 days')"),
  };
}

// Recent activity for the admin dashboard: the latest check-ins and the
// latest created events, each capped at `limit`. No tokens are returned.
export function recentActivity(limit = 10) {
  const checkins = db
    .prepare(
      `SELECT checkins.created_at, checkins.event_slug, events.title AS event_title,
              users.email AS user_email, users.name AS user_name, users.username AS user_username
       FROM checkins
       JOIN users ON users.token = checkins.user_token
       LEFT JOIN events ON events.slug = checkins.event_slug
       ORDER BY checkins.created_at DESC, checkins.id DESC
       LIMIT ?`,
    )
    .all(limit);
  const events = db
    .prepare(
      `SELECT events.slug, events.title, events.created_at,
              users.email AS host_email, users.name AS host_name
       FROM events LEFT JOIN users ON users.token = events.created_by
       ORDER BY events.created_at DESC
       LIMIT ?`,
    )
    .all(limit);
  return { checkins, events };
}

// sort: "name_asc" | "name_desc" | "soonest" | "latest" (default: latest-created, as before)
// category: exact match against events.category, or falsy for no filter
export function listEvents({ sort, category } = {}) {
  // host_email comes from the join so views never need created_by (which holds
  // the host's session token and must not be rendered).
  let sql = `SELECT events.*, users.email AS host_email,
              users.name AS host_name, users.username AS host_username,
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

// lat, lng and distance_km are optional (the lat/lng/distance_km columns are
// added by social-db.js, which is always loaded alongside this).
export function createEvent({ title, event_date, location, affiliation, category, price_cents, created_by, lat, lng, distance_km }) {
  const slug = slugify(title);
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);
  db.prepare(
    `INSERT INTO events (slug, title, event_date, location, affiliation, category, price_cents, created_by, lat, lng, distance_km)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    slug,
    title,
    event_date || null,
    location || null,
    affiliation || null,
    category || null,
    Number(price_cents) || 0,
    created_by || null,
    hasPoint ? lat : null,
    hasPoint ? lng : null,
    hasPoint && Number.isFinite(distance_km) ? distance_km : null,
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

export function checkinCountFor(token) {
  return db.prepare("SELECT COUNT(*) AS n FROM checkins WHERE user_token = ?").get(token).n;
}

// Events a user has checked in to, soonest first (undated last). Only public
// event fields: no host email, no created_by token.
export function eventsCheckedInBy(token) {
  return db
    .prepare(
      `SELECT events.slug, events.title, events.event_date, events.location
       FROM checkins JOIN events ON events.slug = checkins.event_slug
       WHERE checkins.user_token = ?
       ORDER BY events.event_date IS NULL, events.event_date ASC`,
    )
    .all(token);
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
