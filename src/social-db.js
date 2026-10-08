// Data layer for the social side of Quad: the extra event columns, maybes,
// chat, announcements, plus the seeded demo content from seed-events.js.
//
// Importing db.js first means its tables and seed users exist before anything
// here runs. Every function exported from this file returns plain public
// objects: user rows always go through publicUser(), so a session token or
// password hash can never reach a view or a JSON response.
import { createHash } from "node:crypto";
import { db, parseInterests } from "./db.js";
import {
  SOCIAL_EVENTS,
  COMMUNITIES,
  SEED_ACTIVITY,
  SEED_DMS,
  SEED_ANNOUNCEMENTS,
  SEED_EMAILS,
  eventDetails,
  seedChatFor,
  seedCommunityChat,
} from "./seed-events.js";

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

// Same retrofit pattern as db.js: CREATE TABLE IF NOT EXISTS won't add
// columns to an older table, so each one is added if PRAGMA says it's missing.
// All nullable or defaulted, so events created with only a title still work.
const eventColumns = new Set(db.prepare("PRAGMA table_info(events)").all().map((c) => c.name));
const EVENT_COLUMNS = [
  ["start_time", "TEXT"],
  ["end_time", "TEXT"],
  ["distance_km", "REAL"],
  ["capacity", "INTEGER"],
  ["description", "TEXT"],
  ["tags", "TEXT"], // JSON array
  ["rating", "REAL"],
  ["interested_count", "INTEGER NOT NULL DEFAULT 0"],
  ["base_attendees", "INTEGER NOT NULL DEFAULT 0"],
  ["friends_going", "INTEGER NOT NULL DEFAULT 0"],
  ["status", "TEXT"], // 'upcoming' | 'selling-fast' | 'sold-out' | 'live'
  ["cover_hue", "INTEGER"],
  ["community", "TEXT"], // a COMMUNITIES slug
  ["details", "TEXT"], // JSON: {schedule, lineup, faqs, map_x, map_y}
  ["seed_offset", "INTEGER"], // days from today; only set on seeded events
  ["lat", "REAL"], // real coordinates, nullable
  ["lng", "REAL"],
];
for (const [name, type] of EVENT_COLUMNS) {
  if (!eventColumns.has(name)) db.exec(`ALTER TABLE events ADD COLUMN ${name} ${type}`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS event_maybes (
    event_slug TEXT NOT NULL REFERENCES events(slug),
    user_token TEXT NOT NULL REFERENCES users(token),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (event_slug, user_token)
  );

  -- room is 'event:<slug>' or 'community:<slug>'. No FK, since communities
  -- aren't a table.
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT NOT NULL,
    user_token TEXT NOT NULL REFERENCES users(token),
    kind TEXT NOT NULL DEFAULT 'text',
    body TEXT NOT NULL DEFAULT '',
    meta TEXT,
    reply_to INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS chat_messages_room ON chat_messages(room, created_at);

  -- event_slug NULL means a global announcement.
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_slug TEXT,
    user_token TEXT NOT NULL REFERENCES users(token),
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS announcements_event ON announcements(event_slug);
`);

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

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

function parseJson(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text) ?? fallback;
  } catch {
    return fallback;
  }
}

// Small stable number from a string, for fake-but-consistent display values.
function hash(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

// A UTC timestamp in SQLite's datetime('now') format, so views can pass it to
// formatDate() like any stored created_at.
function sqlTime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
function minutesAgo(mins) {
  return sqlTime(new Date(Date.now() - mins * 60000));
}

function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Days from today until the coming Saturday/Sunday (0 if it is that day).
function resolveOffset(v) {
  if (typeof v === "number") return v;
  const dow = new Date().getDay(); // 0 = Sunday
  if (v === "sat") return (6 - dow + 7) % 7;
  if (v === "sun") return (7 - dow) % 7;
  return 0;
}

// The users table is small, so look-ups load it once per call into a map.
function allUsers() {
  return db.prepare("SELECT * FROM users").all();
}
function usersByToken() {
  return new Map(allUsers().map((u) => [u.token, u]));
}

// Seed users are found by email: on older databases their username may have
// been taken by someone else (see the seed in db.js).
function seedUserRow(username) {
  const email = SEED_EMAILS[username];
  return email ? db.prepare("SELECT * FROM users WHERE email = ?").get(email) : undefined;
}
function seedUsernameFor(user) {
  if (!user) return null;
  return Object.keys(SEED_EMAILS).find((k) => SEED_EMAILS[k] === user.email) ?? null;
}

/* ------------------------------------------------------------------ */
/* Public shapes                                                       */
/* ------------------------------------------------------------------ */

// The only user shape that leaves this module. No token, password hash,
// email, role or preferences.
export function publicUser(row) {
  if (!row) return null;
  const key = row.username || row.name || row.email || "";
  const hour = new Date().getHours();
  return {
    username: row.username ?? null,
    name: row.name ?? null,
    display_name: row.name || row.username || "Quad member",
    avatar_url: row.avatar_url ?? null,
    bio: row.bio ?? null,
    location: row.location ?? null,
    interests: parseInterests(row.interests),
    online: hash(`${key}:${hour}`) % 3 !== 0,
    mutual_friends: hash(`mutual:${key}`) % 7,
  };
}

function isWeekendSoon(dateStr, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr ?? "") || dateStr < today) return false;
  const d = new Date(`${dateStr}T12:00:00`);
  const days = Math.round((d.getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000);
  return days <= 6 && (d.getDay() === 0 || d.getDay() === 6);
}

const EMPTY_DETAILS = { schedule: [], lineup: [], faqs: [], map_x: null, map_y: null };

// The drawn maps cover a fixed box around Sydney. toMapXY turns real
// coordinates into 0..100 positions on it, or null when outside the box.
const MAP_BOX = { north: -33.7, south: -34.05, west: 150.95, east: 151.32 };
export function toMapXY(lat, lng) {
  if (lat == null || lng == null) return null;
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la > MAP_BOX.north || la < MAP_BOX.south || lo < MAP_BOX.west || lo > MAP_BOX.east) return null;
  const round = (n) => Math.round(n * 10) / 10;
  return {
    map_x: round(((lo - MAP_BOX.west) / (MAP_BOX.east - MAP_BOX.west)) * 100),
    map_y: round(((MAP_BOX.north - la) / (MAP_BOX.north - MAP_BOX.south)) * 100),
  };
}

// One events row (with going_count/maybe_count/host_email from the query)
// to the public event shape. created_by (the host's token) is dropped.
function eventOut(row, users) {
  if (!row) return null;
  const { created_by, seed_offset, ...rest } = row;
  const today = localToday();
  const going = Number(row.going_count ?? 0);
  const attendeeCount = Number(row.base_attendees ?? 0) + going;
  const details = { ...EMPTY_DETAILS, ...parseJson(row.details, {}) };
  if (row.lat != null && row.lng != null) {
    // Real coordinates win over the hand-set pin. Outside the box: no pin.
    const xy = toMapXY(row.lat, row.lng);
    details.map_x = xy ? xy.map_x : null;
    details.map_y = xy ? xy.map_y : null;
  }
  const dated = /^\d{4}-\d{2}-\d{2}$/.test(row.event_date ?? "");
  return {
    ...rest,
    tags: parseJson(row.tags, []),
    details,
    host: publicUser(created_by ? users.get(created_by) : null),
    going_count: going,
    maybe_count: Number(row.maybe_count ?? 0),
    attendee_count: attendeeCount,
    spots_left: row.capacity ? Math.max(0, row.capacity - attendeeCount) : null,
    is_free: !(row.price_cents > 0),
    is_today: row.event_date === today,
    is_this_weekend: isWeekendSoon(row.event_date, today),
    is_past: dated && row.event_date < today,
    is_seeded: seed_offset !== null && seed_offset !== undefined,
  };
}

const EVENT_SELECT = `SELECT events.*, users.email AS host_email,
    (SELECT COUNT(*) FROM checkins WHERE checkins.event_slug = events.slug) AS going_count,
    (SELECT COUNT(*) FROM event_maybes m WHERE m.event_slug = events.slug
       AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.event_slug = m.event_slug AND c.user_token = m.user_token)) AS maybe_count
  FROM events LEFT JOIN users ON users.token = events.created_by`;

const SOONEST = " ORDER BY events.event_date IS NULL, events.event_date ASC, events.start_time ASC, events.title ASC";

// Every event (legacy ones included), soonest first, undated last.
export function listSocialEvents() {
  const users = usersByToken();
  return db.prepare(EVENT_SELECT + SOONEST).all().map((r) => eventOut(r, users));
}

export function getEventFull(slug) {
  const row = db.prepare(`${EVENT_SELECT} WHERE events.slug = ?`).get(slug);
  return row ? eventOut(row, usersByToken()) : null;
}

// Server-side filtering for /discover, so it works without JS.
// when: 'today' | 'weekend' | 'week' | 'month'; price: 'free' | 'paid';
// sort: 'soonest' | 'popular' | 'rating' | 'distance'.
export function filterEvents(events, { q, category, when, price, sort, community } = {}) {
  const today = localToday();
  const plus = (n) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  let out = events.filter((e) => !e.is_past);
  if (q) {
    const needle = String(q).toLowerCase();
    out = out.filter((e) =>
      [e.title, e.description, e.location, e.category, ...(e.tags ?? [])].some((s) =>
        String(s ?? "").toLowerCase().includes(needle),
      ),
    );
  }
  if (category) out = out.filter((e) => e.category === category);
  if (community) out = out.filter((e) => e.community === community);
  if (price === "free") out = out.filter((e) => e.is_free);
  if (price === "paid") out = out.filter((e) => !e.is_free);
  if (when === "today") out = out.filter((e) => e.is_today);
  if (when === "weekend") out = out.filter((e) => e.is_this_weekend);
  if (when === "week") out = out.filter((e) => e.event_date && e.event_date <= plus(7));
  if (when === "month") out = out.filter((e) => e.event_date && e.event_date <= plus(30));
  const by = {
    popular: (a, b) => b.attendee_count - a.attendee_count,
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    distance: (a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity),
  }[sort];
  return by ? [...out].sort(by) : out;
}

// Same category, upcoming, not this event.
export function relatedEvents(event, limit = 4) {
  if (!event?.category) return [];
  return listSocialEvents()
    .filter((e) => e.category === event.category && e.slug !== event.slug && !e.is_past)
    .slice(0, limit);
}

// {going, maybe}: publicUser objects plus status ('going' | 'maybe') and
// since (when they said so). Someone who is going isn't also listed as maybe.
export function eventAttendees(slug) {
  const going = db
    .prepare(
      `SELECT users.*, checkins.created_at AS since FROM checkins
       JOIN users ON users.token = checkins.user_token
       WHERE checkins.event_slug = ? ORDER BY checkins.created_at ASC`,
    )
    .all(slug)
    .map((r) => ({ ...publicUser(r), status: "going", since: r.since }));
  const maybe = db
    .prepare(
      `SELECT users.*, m.created_at AS since FROM event_maybes m
       JOIN users ON users.token = m.user_token
       WHERE m.event_slug = ?
         AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.event_slug = m.event_slug AND c.user_token = m.user_token)
       ORDER BY m.created_at ASC`,
    )
    .all(slug)
    .map((r) => ({ ...publicUser(r), status: "maybe", since: r.since }));
  return { going, maybe };
}

export function isMaybe(slug, token) {
  return !!db.prepare("SELECT 1 FROM event_maybes WHERE event_slug = ? AND user_token = ?").get(slug, token);
}

export function setMaybe(slug, token, on) {
  if (on) {
    db.prepare("INSERT OR IGNORE INTO event_maybes (event_slug, user_token) VALUES (?, ?)").run(slug, token);
  } else {
    db.prepare("DELETE FROM event_maybes WHERE event_slug = ? AND user_token = ?").run(slug, token);
  }
}

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

export const CHAT_MAX = 1000;
// Kinds a user can post. Seeded chat also has image, gif, poll and location.
const POSTABLE_KINDS = ["text", "question"];

function hostTokenForRoom(room) {
  if (!room.startsWith("event:")) return null;
  return db.prepare("SELECT created_by FROM events WHERE slug = ?").get(room.slice(6))?.created_by ?? null;
}

function messageOut(row, users, byId, viewerToken, hostToken) {
  const parent = row.reply_to ? byId.get(row.reply_to) : null;
  const parentAuthor = parent ? publicUser(users.get(parent.user_token)) : null;
  return {
    id: row.id,
    room: row.room,
    kind: row.kind,
    body: row.body,
    meta: parseJson(row.meta, null),
    reply_to: row.reply_to ?? null,
    reply: parent
      ? { id: parent.id, author_name: parentAuthor?.display_name ?? "Someone", body: String(parent.body ?? "").slice(0, 140) }
      : null,
    author: publicUser(users.get(row.user_token)),
    is_mine: !!viewerToken && row.user_token === viewerToken,
    from_host: !!hostToken && row.user_token === hostToken,
    at: row.created_at,
  };
}

// The latest `limit` messages in a room, oldest first. Replies carry a short
// summary of the message they answer in `reply`.
export function chatFor(room, viewerToken = null, limit = 200) {
  const rows = db
    .prepare(
      `SELECT * FROM (SELECT * FROM chat_messages WHERE room = ? ORDER BY created_at DESC, id DESC LIMIT ?)
       ORDER BY created_at ASC, id ASC`,
    )
    .all(room, limit);
  const users = usersByToken();
  const byId = new Map(rows.map((r) => [r.id, r]));
  // A reply to something older than the window still gets its summary.
  for (const r of rows) {
    if (r.reply_to && !byId.has(r.reply_to)) {
      const p = db.prepare("SELECT * FROM chat_messages WHERE id = ? AND room = ?").get(r.reply_to, room);
      if (p) byId.set(p.id, p);
    }
  }
  const hostToken = hostTokenForRoom(room);
  return rows.map((r) => messageOut(r, users, byId, viewerToken, hostToken));
}

// Callers validate the body length. kind falls back to 'text'; reply_to is
// dropped unless it is a message in the same room. Returns the new message.
export function postChat(room, token, body, { kind = "text", reply_to = null } = {}) {
  const k = POSTABLE_KINDS.includes(kind) ? kind : "text";
  let parentId = Number(reply_to);
  if (!Number.isInteger(parentId) || parentId <= 0) parentId = null;
  if (parentId && !db.prepare("SELECT 1 FROM chat_messages WHERE id = ? AND room = ?").get(parentId, room)) {
    parentId = null;
  }
  const res = db
    .prepare("INSERT INTO chat_messages (room, user_token, kind, body, reply_to) VALUES (?, ?, ?, ?, ?)")
    .run(room, token, k, String(body), parentId);
  const row = db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(res.lastInsertRowid);
  const byId = new Map();
  if (parentId) byId.set(parentId, db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(parentId));
  return messageOut(row, usersByToken(), byId, token, hostTokenForRoom(room));
}

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

function announcementOut(row, users) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    pinned: !!row.pinned,
    at: row.created_at,
    author: publicUser(users.get(row.user_token)),
    event: row.event_slug ? { slug: row.event_slug, title: row.event_title ?? row.event_slug } : null,
  };
}

const ANN_SELECT = `SELECT announcements.*, events.title AS event_title FROM announcements
  LEFT JOIN events ON events.slug = announcements.event_slug`;
const ANN_ORDER = " ORDER BY announcements.pinned DESC, announcements.created_at DESC, announcements.id DESC";

export function announcementsFor(slug) {
  const users = usersByToken();
  return db.prepare(`${ANN_SELECT} WHERE announcements.event_slug = ?${ANN_ORDER}`).all(slug).map((r) => announcementOut(r, users));
}

// Every announcement, global and per-event, pinned first.
export function allAnnouncements() {
  const users = usersByToken();
  return db.prepare(ANN_SELECT + ANN_ORDER).all().map((r) => announcementOut(r, users));
}

// {id, event_slug, pinned} for permission checks, or null.
export function getAnnouncement(id) {
  const row = db.prepare("SELECT id, event_slug, pinned FROM announcements WHERE id = ?").get(id);
  return row ? { id: row.id, event_slug: row.event_slug ?? null, pinned: !!row.pinned } : null;
}

// event_slug null makes a global announcement. Returns the new announcement.
export function postAnnouncement({ event_slug = null, token, title, body = "", pinned = false }) {
  const res = db
    .prepare("INSERT INTO announcements (event_slug, user_token, title, body, pinned) VALUES (?, ?, ?, ?, ?)")
    .run(event_slug, token, String(title), String(body ?? ""), pinned ? 1 : 0);
  const row = db.prepare(`${ANN_SELECT} WHERE announcements.id = ?`).get(res.lastInsertRowid);
  return announcementOut(row, usersByToken());
}

// Flips pinned. Returns the new value, or null if there's no such row.
export function togglePin(id) {
  const res = db.prepare("UPDATE announcements SET pinned = 1 - pinned WHERE id = ?").run(id);
  if (!res.changes) return null;
  return !!db.prepare("SELECT pinned FROM announcements WHERE id = ?").get(id).pinned;
}

// Host of the event, or any admin. event can be any object with a slug.
export function canManageEvent(user, event) {
  if (!user || !event?.slug) return false;
  if (user.role === "admin") return true;
  const row = db.prepare("SELECT created_by FROM events WHERE slug = ?").get(event.slug);
  return !!row && !!row.created_by && row.created_by === user.token;
}

/* ------------------------------------------------------------------ */
/* Communities                                                         */
/* ------------------------------------------------------------------ */

function seedPublic(username) {
  return publicUser(seedUserRow(username));
}

function communityOut(c) {
  const upcoming = listSocialEvents().filter((e) => e.community === c.slug && !e.is_past);
  return {
    slug: c.slug,
    name: c.name,
    description: c.description,
    cover_hue: c.cover_hue,
    member_count: c.member_count,
    members: c.member_usernames.map(seedPublic).filter(Boolean),
    moderators: c.moderators.map(seedPublic).filter(Boolean),
    trending_topics: c.trending_topics,
    upcoming_count: upcoming.length,
    discussion_count: c.discussions.length,
  };
}

export function communities() {
  return COMMUNITIES.map(communityOut);
}

// One community with its upcoming events, discussions and chat, or null.
export function community(slug, viewerToken = null) {
  const c = COMMUNITIES.find((x) => x.slug === slug);
  if (!c) return null;
  return {
    ...communityOut(c),
    events: listSocialEvents().filter((e) => e.community === c.slug && !e.is_past),
    discussions: c.discussions.map((d, i) => ({
      id: `${c.slug}-${i}`,
      author: seedPublic(d.author_username),
      title: d.title,
      body: d.body,
      replies: d.replies,
      at: minutesAgo(d.minutes_ago),
    })),
    chat: chatFor(`community:${c.slug}`, viewerToken),
  };
}

/* ------------------------------------------------------------------ */
/* Activity and notifications                                          */
/* ------------------------------------------------------------------ */

function targetFor(slug, titles) {
  if (titles.has(slug)) return { type: "event", slug, title: titles.get(slug), href: `/events/${slug}` };
  const c = COMMUNITIES.find((x) => x.slug === slug);
  if (c) return { type: "community", slug, title: c.name, href: `/communities/${slug}` };
  return null;
}

function roomTarget(room, titles) {
  const [type, slug] = String(room).split(/:(.*)/s);
  return type === "event" || type === "community" ? targetFor(slug, titles) : null;
}

// Newest first: the seeded lines (timed relative to now) merged with real
// check-ins, chat posts, announcements and user-hosted events.
// Each item: {id, actor: publicUser | null, count: number | null, verb, target: {type, slug, title, href}, at}.
export function activityFeed(limit = 30) {
  const users = usersByToken();
  const titles = new Map(db.prepare("SELECT slug, title FROM events").all().map((e) => [e.slug, e.title]));
  const items = [];

  SEED_ACTIVITY.forEach((a, i) => {
    const target = targetFor(a.target_slug, titles);
    if (!target) return;
    const actor = a.username ? seedPublic(a.username) : null;
    if (a.username && !actor) return;
    items.push({ id: `seed-${i}`, actor, count: a.count ?? null, verb: a.verb, target, at: minutesAgo(a.minutes_ago) });
  });

  for (const r of db
    .prepare("SELECT id, event_slug, user_token, created_at FROM checkins ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(limit)) {
    const target = targetFor(r.event_slug, titles);
    if (target) items.push({ id: `checkin-${r.id}`, actor: publicUser(users.get(r.user_token)), count: null, verb: "joined", target, at: r.created_at });
  }
  for (const r of db
    .prepare("SELECT id, room, user_token, created_at FROM chat_messages ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(limit)) {
    const target = roomTarget(r.room, titles);
    if (target) items.push({ id: `chat-${r.id}`, actor: publicUser(users.get(r.user_token)), count: null, verb: "posted in", target, at: r.created_at });
  }
  for (const r of db
    .prepare("SELECT id, event_slug, user_token, created_at FROM announcements WHERE event_slug IS NOT NULL ORDER BY created_at DESC LIMIT ?")
    .all(limit)) {
    const target = targetFor(r.event_slug, titles);
    if (target) items.push({ id: `ann-${r.id}`, actor: publicUser(users.get(r.user_token)), count: null, verb: "posted an update for", target, at: r.created_at });
  }
  for (const r of db
    .prepare("SELECT slug, created_by, created_at FROM events WHERE seed_offset IS NULL AND created_by IS NOT NULL ORDER BY created_at DESC LIMIT ?")
    .all(limit)) {
    items.push({ id: `event-${r.slug}`, actor: publicUser(users.get(r.created_by)), count: null, verb: "created", target: targetFor(r.slug, titles), at: r.created_at });
  }

  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

// Notifications for a logged-in user, newest first. ids are stable so the
// client can remember which ones were read (localStorage).
// Each: {id, kind: 'announcement' | 'reply' | 'reminder' | 'community', text, href, at}.
export function notificationsFor(user, limit = 50) {
  if (!user) return [];
  const users = usersByToken();
  const out = [];
  const going = db
    .prepare(
      `SELECT events.slug, events.title, events.event_date, events.start_time FROM checkins
       JOIN events ON events.slug = checkins.event_slug WHERE checkins.user_token = ?`,
    )
    .all(user.token);
  const goingSlugs = new Set(going.map((e) => e.slug));

  for (const a of allAnnouncements()) {
    if (a.event && !goingSlugs.has(a.event.slug)) continue;
    out.push({
      id: `ann-${a.id}`,
      kind: "announcement",
      text: a.event ? `${a.event.title}: ${a.title}` : a.title,
      href: a.event ? `/events/${a.event.slug}` : "/announcements",
      at: a.at,
    });
  }

  const titles = new Map(db.prepare("SELECT slug, title FROM events").all().map((e) => [e.slug, e.title]));
  const replies = db
    .prepare(
      `SELECT r.id, r.room, r.user_token, r.created_at FROM chat_messages r
       JOIN chat_messages p ON p.id = r.reply_to
       WHERE p.user_token = ? AND r.user_token != ?
       ORDER BY r.created_at DESC LIMIT 30`,
    )
    .all(user.token, user.token);
  for (const r of replies) {
    const target = roomTarget(r.room, titles);
    if (!target) continue;
    const who = publicUser(users.get(r.user_token))?.display_name ?? "Someone";
    out.push({ id: `reply-${r.id}`, kind: "reply", text: `${who} replied to you in ${target.title}`, href: `${target.href}#chat`, at: r.created_at });
  }

  const today = localToday();
  for (const e of going) {
    if (e.event_date !== today) continue;
    out.push({
      id: `today-${e.slug}-${today}`,
      kind: "reminder",
      text: `${e.title} is on today${e.start_time ? ` at ${e.start_time}` : ""}`,
      href: `/events/${e.slug}`,
      at: minutesAgo(5),
    });
  }

  const me = seedUsernameFor(user);
  if (me) {
    for (const c of COMMUNITIES) {
      if (!c.member_usernames.includes(me)) continue;
      c.discussions.forEach((d, i) => {
        if (d.author_username === me) return;
        out.push({ id: `community-${c.slug}-${i}`, kind: "community", text: `New in ${c.name}: ${d.title}`, href: `/communities/${c.slug}`, at: minutesAgo(d.minutes_ago) });
      });
    }
  }

  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* People, messages, my events, tickets                                */
/* ------------------------------------------------------------------ */

const lower = (list) => (list ?? []).map((s) => String(s).toLowerCase());

// Up to `limit` people ranked by interests shared with the viewer, then by
// overlap with the event's tags/category. With a slug, people going to (or
// maybe going to) that event come first. Each is publicUser plus
// {shared_interests: string[], reason: string, score: number}.
export function peopleToMeet(user, slug = null, limit = 6) {
  // Accepts a users row (interests as JSON text) or a publicUser (an array).
  const mine = new Set(lower(Array.isArray(user?.interests) ? user.interests : parseInterests(user?.interests)));
  let topics = new Set();
  let pool = [];
  if (slug) {
    const e = getEventFull(slug);
    if (e) topics = new Set(lower([...(e.tags ?? []), e.category].filter(Boolean)));
    const tokens = db
      .prepare(
        `SELECT user_token FROM checkins WHERE event_slug = ?
         UNION SELECT user_token FROM event_maybes WHERE event_slug = ?`,
      )
      .all(slug, slug)
      .map((r) => r.user_token);
    const users = usersByToken();
    pool = tokens.map((t) => users.get(t)).filter(Boolean);
  }
  const seen = new Set(pool.map((u) => u.token));
  if (pool.length < limit) {
    for (const u of allUsers()) if (u.username && !seen.has(u.token)) pool.push(u);
  }
  return pool
    .filter((u) => !user || u.token !== user.token)
    .map((u) => {
      const p = publicUser(u);
      const theirs = lower(p.interests);
      const shared = p.interests.filter((_, i) => mine.has(theirs[i]));
      const onTopic = theirs.filter((t) => topics.has(t)).length;
      const atEvent = seen.has(u.token) ? 1 : 0;
      const score = shared.length * 2 + onTopic + atEvent * 2 + p.mutual_friends / 10;
      const reason = shared.length
        ? `You both like ${shared.slice(0, 2).join(" and ")}`
        : atEvent
          ? "Going to this event"
          : p.mutual_friends
            ? `${p.mutual_friends} mutual friends`
            : "New to Quad";
      return { ...p, shared_interests: shared, reason, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Direct-message threads for the Messages page (seeded, read-only).
// Each: {id, with: publicUser, messages: [{from: publicUser, body, at, is_mine}], last: {body, at}, unread: number}.
// Accounts outside the seed get a single welcome thread from the admin account.
export function dmThreadsFor(user) {
  if (!user) return [];
  const me = seedUsernameFor(user);
  const self = publicUser(user);
  let threads = SEED_DMS.filter((t) => me && t.participants.includes(me));
  if (!threads.length && me !== "admin") {
    threads = [
      {
        id: "welcome",
        participants: ["admin", "__me"],
        messages: [{ from: "admin", body: "Welcome to Quad. Reply here if you get stuck or spot a bug.", minutes_ago: 60 }],
      },
    ];
  }
  return threads
    .map((t) => {
      const other = t.participants.find((p) => p !== me && p !== "__me");
      const messages = t.messages.map((m) => ({
        from: m.from === me ? self : seedPublic(m.from),
        body: m.body,
        at: minutesAgo(m.minutes_ago),
        is_mine: m.from === me,
      }));
      const last = messages[messages.length - 1];
      return {
        id: t.id,
        with: seedPublic(other),
        messages,
        last: { body: last.body, at: last.at },
        unread: last.is_mine ? 0 : 1,
      };
    })
    .filter((t) => t.with)
    .sort((a, b) => (a.last.at < b.last.at ? 1 : -1));
}

// {going, maybe, hosted}: event objects (listSocialEvents shape), soonest first.
export function myEvents(user) {
  if (!user) return { going: [], maybe: [], hosted: [] };
  const all = listSocialEvents();
  const goingSlugs = new Set(
    db.prepare("SELECT event_slug FROM checkins WHERE user_token = ?").all(user.token).map((r) => r.event_slug),
  );
  const maybeSlugs = new Set(
    db.prepare("SELECT event_slug FROM event_maybes WHERE user_token = ?").all(user.token).map((r) => r.event_slug),
  );
  const hostedSlugs = new Set(
    db.prepare("SELECT slug FROM events WHERE created_by = ?").all(user.token).map((r) => r.slug),
  );
  return {
    going: all.filter((e) => goingSlugs.has(e.slug)),
    maybe: all.filter((e) => maybeSlugs.has(e.slug) && !goingSlugs.has(e.slug)),
    hosted: all.filter((e) => hostedSlugs.has(e.slug)),
  };
}

// A display-only ticket code. Derived from the slug and the username (or the
// email if there's no username), hashed, so it never exposes the session token.
function ticketCode(slug, user) {
  const h = createHash("sha256").update(`${slug}:${user.username || user.email}`).digest("hex").toUpperCase();
  return `QUAD-${h.slice(0, 4)}-${h.slice(4, 8)}`;
}

// One ticket per event the user is going to.
// Each: {code, event, holder: publicUser, price_cents, is_free}.
export function ticketsFor(user) {
  if (!user) return [];
  const holder = publicUser(user);
  return myEvents(user).going.map((event) => ({
    code: ticketCode(event.slug, user),
    event,
    holder,
    price_cents: event.price_cents ?? 0,
    is_free: event.is_free,
  }));
}

/* ------------------------------------------------------------------ */
/* Seeding (runs once per boot, never deletes anything)                */
/* ------------------------------------------------------------------ */

function seedSocial() {
  const insertEvent = db.prepare(
    `INSERT OR IGNORE INTO events (slug, title, event_date, location, category, price_cents, created_by,
       start_time, end_time, distance_km, capacity, description, tags, rating, interested_count,
       base_attendees, friends_going, status, cover_hue, community, details, seed_offset)
     VALUES (?, ?, date('now', 'localtime', ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertCheckin = db.prepare(
    "INSERT OR IGNORE INTO checkins (event_slug, user_token, created_at) VALUES (?, ?, datetime('now', ?))",
  );
  const insertMaybe = db.prepare(
    "INSERT OR IGNORE INTO event_maybes (event_slug, user_token, created_at) VALUES (?, ?, datetime('now', ?))",
  );
  const insertChat = db.prepare(
    "INSERT INTO chat_messages (room, user_token, kind, body, meta, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))",
  );
  const insertAnn = db.prepare(
    "INSERT INTO announcements (event_slug, user_token, title, body, pinned, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))",
  );
  const roomEmpty = (room) => !db.prepare("SELECT 1 FROM chat_messages WHERE room = ? LIMIT 1").get(room);
  const isOurs = (slug) => !!db.prepare("SELECT 1 FROM events WHERE slug = ? AND seed_offset IS NOT NULL").get(slug);
  const tokens = {};
  for (const u of Object.keys(SEED_EMAILS)) tokens[u] = seedUserRow(u)?.token ?? null;

  const seedChat = (room, messages) => {
    const ids = [];
    for (const m of messages) {
      const token = tokens[m.username];
      if (!token) {
        ids.push(null);
        continue;
      }
      const replyTo = m.reply_to_index !== undefined ? ids[m.reply_to_index] ?? null : null;
      const meta = m.meta ? JSON.stringify(m.meta) : null;
      const res = insertChat.run(room, token, m.kind, m.body, meta, replyTo, `-${m.minutes_ago} minutes`);
      ids.push(Number(res.lastInsertRowid));
    }
  };

  inTransaction(() => {
    for (const e of SOCIAL_EVENTS) {
      const offset = resolveOffset(e.day_offset);
      const res = insertEvent.run(
        e.slug, e.title, `${offset} days`, e.location, e.category, e.price_cents, tokens[e.organizer_username],
        e.start_time, e.end_time, e.distance_km, e.capacity, e.description, JSON.stringify(e.tags), e.rating,
        e.interested, e.base_attendees, e.friends_going, e.status, e.cover_hue, e.community,
        JSON.stringify(eventDetails(e)), offset,
      );
      if (res.changes === 1) {
        // A newly seeded event gets a few real attendees (organiser included)
        // and a maybe, so attendee lists show actual people.
        Object.keys(SEED_EMAILS).forEach((u, i) => {
          if (!tokens[u]) return;
          const pick = hash(`${e.slug}:${u}`) % 3;
          if (u === e.organizer_username || pick === 0) insertCheckin.run(e.slug, tokens[u], `-${(i + 1) * 47} minutes`);
          else if (pick === 1) insertMaybe.run(e.slug, tokens[u], `-${(i + 1) * 31} minutes`);
        });
      }
      // Weekend events move to the coming Sat/Sun, so recompute every boot.
      // Only rows this seed created (seed_offset set) are touched.
      db.prepare("UPDATE events SET seed_offset = ? WHERE slug = ? AND seed_offset IS NOT NULL").run(offset, e.slug);

      const room = `event:${e.slug}`;
      if (isOurs(e.slug) && roomEmpty(room)) seedChat(room, seedChatFor(e));
    }

    // Keep "today" and "this weekend" current: seeded dates are relative.
    db.exec("UPDATE events SET event_date = date('now', 'localtime', seed_offset || ' days') WHERE seed_offset IS NOT NULL");

    for (const c of COMMUNITIES) {
      const room = `community:${c.slug}`;
      if (roomEmpty(room)) seedChat(room, seedCommunityChat(c));
    }

    const hasAnn = db.prepare("SELECT 1 FROM announcements WHERE event_slug = ? LIMIT 1");
    const hasGlobal = !!db.prepare("SELECT 1 FROM announcements WHERE event_slug IS NULL LIMIT 1").get();
    const done = new Set();
    for (const a of SEED_ANNOUNCEMENTS) {
      if (a.event_slug) {
        const e = SOCIAL_EVENTS.find((x) => x.slug === a.event_slug);
        const token = e && tokens[e.organizer_username];
        if (!token || !isOurs(a.event_slug)) continue;
        // "Has none yet" is checked once per event, before its first insert.
        if (!done.has(a.event_slug) && hasAnn.get(a.event_slug)) continue;
        done.add(a.event_slug);
        insertAnn.run(a.event_slug, token, a.title, a.body, a.pinned, `-${a.minutes_ago} minutes`);
      } else {
        if (hasGlobal || !tokens.admin) continue;
        insertAnn.run(null, tokens.admin, a.title, a.body, a.pinned, `-${a.minutes_ago} minutes`);
      }
    }
  });
}

seedSocial();

// Seeded events get a stable pseudo-random spot near one of these Sydney
// anchors, chosen by a hash of the slug. Only rows with lat IS NULL are set,
// so nothing is overwritten.
const SYDNEY_ANCHORS = [
  [-33.8688, 151.2093], // CBD
  [-33.8847, 151.2109], // Surry Hills
  [-33.8979, 151.1789], // Newtown
  [-33.8789, 151.2201], // Darlinghurst
  [-33.8915, 151.2767], // Bondi
  [-33.7969, 151.2878], // Manly
  [-33.815, 151.0011], // Parramatta
  [-33.7969, 151.1832], // Chatswood
  [-33.9115, 151.1552], // Marrickville
  [-33.8806, 151.1858], // Glebe
];

function seedCoordinates() {
  const rows = db.prepare("SELECT slug FROM events WHERE seed_offset IS NOT NULL AND lat IS NULL").all();
  const update = db.prepare("UPDATE events SET lat = ?, lng = ? WHERE slug = ? AND lat IS NULL");
  const jitter = (s) => ((hash(s) % 10000) / 10000 * 2 - 1) * 0.008;
  const round = (n) => Math.round(n * 1e6) / 1e6;
  inTransaction(() => {
    for (const { slug } of rows) {
      const [lat, lng] = SYDNEY_ANCHORS[hash(slug) % SYDNEY_ANCHORS.length];
      update.run(round(lat + jitter(`${slug}:lat`)), round(lng + jitter(`${slug}:lng`)), slug);
    }
  });
}
seedCoordinates();
