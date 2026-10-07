// YouTube Data API v3 connector (ADR 0003, step 2). Uses search.list with an
// API key: q= for hashtag/keyword, channelId= for profile, and
// location + locationRadius for geo (the only platform with geo search).
// Quota: search.list is expensive against the daily quota, so keep the
// number of YouTube queries small on the 30 minute schedule.
import { MAX_RESULTS, missingEnv, requestJson, mapAll, redact, stripHash } from "./http.js";

const API = "https://www.googleapis.com/youtube/v3";

export const SUPPORTED_KINDS = ["hashtag", "keyword", "profile", "geo"];
export const REQUIRED_ENV = ["YOUTUBE_API_KEY"];

export function isConfigured(env = process.env) {
  return missingEnv(env, REQUIRED_ENV).length === 0;
}

// One search.list item -> normaliser input. Only video results carry
// id.videoId; anything else (channel/playlist results) is skipped.
export function mapItem(item) {
  const videoId = item?.id?.videoId;
  if (!videoId) return null;
  const snippet = item?.snippet;
  const thumbs = snippet?.thumbnails;
  const channelId = snippet?.channelId;
  const title = snippet?.title;
  const description = snippet?.description;
  return {
    platform: "youtube",
    external_id: String(videoId),
    permalink: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    author_name: snippet?.channelTitle ?? null,
    author_handle: null,
    author_url: channelId ? `https://www.youtube.com/channel/${encodeURIComponent(channelId)}` : null,
    // Titles and descriptions arrive HTML-entity-encoded; the normaliser decodes them.
    text: [title, description].filter((s) => s && String(s).trim()).join("\n\n") || null,
    media_url: thumbs?.high?.url ?? thumbs?.medium?.url ?? thumbs?.default?.url ?? null,
    media_type: "video",
    posted_at: snippet?.publishedAt ?? null,
  };
}

// "-35.28,149.12,5km" -> { location: "-35.28,149.12", radius: "5km" } or null.
export function parseGeo(value) {
  const parts = String(value ?? "").split(",").map((s) => s.trim());
  if (parts.length !== 3) return null;
  const [latS, lngS, radius] = parts;
  if (!/^-?\d+(\.\d+)?$/.test(latS) || !/^-?\d+(\.\d+)?$/.test(lngS)) return null;
  const lat = Number(latS);
  const lng = Number(lngS);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const m = /^(\d+(?:\.\d+)?)(m|km|ft|mi)$/.exec(radius);
  if (!m) return null;
  const toKm = { m: 0.001, km: 1, ft: 0.0003048, mi: 1.609344 };
  const km = Number(m[1]) * toKm[m[2]];
  if (!(km > 0) || km > 1000) return null; // API maximum is 1000 km
  return { location: `${lat},${lng}`, radius };
}

async function resolveChannelId(value, key) {
  const v = String(value ?? "").trim();
  if (/^UC[\w-]{10,}$/.test(v)) return { channelId: v };
  if (!/^@?[\w.-]{3,100}$/.test(v)) return { error: "profile must be a channel id (UC...) or @handle" };
  const url = `${API}/channels?part=id&forHandle=${encodeURIComponent(v)}&key=${encodeURIComponent(key)}`;
  const { data, error } = await requestJson(url, { secrets: [key] });
  if (error) return { error: `channel lookup failed: ${error}` };
  const id = data?.items?.[0]?.id;
  return id ? { channelId: String(id) } : { error: `no channel found for ${v}` };
}

export async function fetchPosts(query, env = process.env) {
  try {
    const kind = query?.kind;
    if (!SUPPORTED_KINDS.includes(kind)) return { posts: [], error: `unsupported kind: ${kind}` };
    const key = env?.YOUTUBE_API_KEY;
    if (!key) return { posts: [], error: "not configured: YOUTUBE_API_KEY" };

    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: String(MAX_RESULTS),
      order: "date",
    });

    if (kind === "hashtag" || kind === "keyword") {
      const q = kind === "hashtag" ? `#${stripHash(query.value)}` : String(query.value ?? "").trim();
      if (!q || q === "#") return { posts: [], error: "empty search value" };
      params.set("q", q);
    } else if (kind === "profile") {
      const resolved = await resolveChannelId(query.value, key);
      if (resolved.error) return { posts: [], error: resolved.error };
      params.set("channelId", resolved.channelId);
    } else {
      const geo = parseGeo(query.value);
      if (!geo) return { posts: [], error: 'geo value must look like "-35.28,149.12,5km"' };
      params.set("location", geo.location);
      params.set("locationRadius", geo.radius);
    }

    params.set("key", key);
    const { data, error } = await requestJson(`${API}/search?${params}`, { secrets: [key] });
    if (error) return { posts: [], error };
    return { posts: mapAll(data?.items, mapItem), error: null };
  } catch (err) {
    return { posts: [], error: redact(`youtube connector failed: ${err?.message ?? err}`, [env?.YOUTUBE_API_KEY]) };
  }
}
