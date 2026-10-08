// Address to coordinates, using OpenStreetMap Nominatim (no API key, no
// dependency). Follows the usage policy: a descriptive User-Agent, at most one
// request per second, and results (including misses) cached in SQLite.
// geocode() never throws: any failure returns null. Set GEOCODE=off to disable.

import { db } from "./db.js";

db.exec(`
  CREATE TABLE IF NOT EXISTS geocode_cache (
    query TEXT PRIMARY KEY,
    lat REAL,
    lng REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Quad-student-project/1.0 (COMP4020 coursework)";
const MIN_GAP_MS = 1100; // a little over the 1 request per second limit
const TIMEOUT_MS = 4000;

const getCached = db.prepare("SELECT lat, lng FROM geocode_cache WHERE query = ?");
const putCached = db.prepare("INSERT OR REPLACE INTO geocode_cache (query, lat, lng) VALUES (?, ?, ?)");

// Requests run one at a time, spaced out by MIN_GAP_MS.
let queue = Promise.resolve();
let lastRequestAt = 0;

function schedule(task) {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.catch(() => {});
  return run;
}

async function lookup(address) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `${ENDPOINT}?format=jsonv2&limit=1&countrycodes=au&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    if (!Array.isArray(data)) return { ok: false };
    const hit = data[0];
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    if (!hit || !Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: true, point: null };
    return { ok: true, point: { lat, lng } };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

// Returns {lat, lng} or null. Cached misses stay misses. Network errors and
// bad responses are not cached, so a later try can succeed.
export async function geocode(address) {
  try {
    if (process.env.GEOCODE === "off") return null;
    const query = String(address ?? "").trim().replace(/\s+/g, " ");
    if (!query) return null;
    const key = query.toLowerCase();
    const cached = getCached.get(key);
    if (cached) return cached.lat == null || cached.lng == null ? null : { lat: cached.lat, lng: cached.lng };
    const result = await schedule(() => lookup(query));
    if (!result.ok) return null;
    putCached.run(key, result.point?.lat ?? null, result.point?.lng ?? null);
    return result.point;
  } catch {
    return null;
  }
}

// Straight-line distance in km from Sydney CBD, one decimal place.
const CBD = { lat: -33.8688, lng: 151.2093 };
export function distanceFromCbdKm(lat, lng) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat - CBD.lat);
  const dLng = rad(lng - CBD.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(CBD.lat)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(a)) * 10) / 10;
}
