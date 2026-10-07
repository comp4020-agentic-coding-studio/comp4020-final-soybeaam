// Shared clean-up for social posts (ADR 0003, "Parsing and missing data").
// Each platform connector maps its own API JSON into the loose shape below,
// then passes it through normalisePost(), which either returns a post that's
// safe to store or null (skipped and counted by the caller). No DB access
// here, so it unit-tests without a database.

export const PLATFORMS = ["youtube", "reddit", "bluesky", "mastodon", "instagram", "facebook", "x"];

const TEXT_MAX = 2000;
const AUTHOR_MAX = 200;

// undefined, null, "", whitespace-only, and the literal strings "undefined"
// and "null" all mean "missing". Returns a trimmed string or null.
function presentString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s || s === "undefined" || s === "null") return null;
  return s;
}

function decodeEntities(s) {
  // &amp; last, so "&amp;lt;" decodes to the text "&lt;", not to "<".
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function truncate(s, max) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Post body: keeps single line breaks (the card renders them with
// white-space: pre-line), collapses spaces/tabs, and squashes 3+ newlines.
function cleanText(value, max) {
  const s = presentString(value);
  if (!s) return null;
  const cleaned = decodeEntities(
    s
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned ? truncate(cleaned, max) : null;
}

// Author fields are one line, so all whitespace collapses to single spaces.
function cleanLine(value, max) {
  const s = presentString(value);
  if (!s) return null;
  const cleaned = decodeEntities(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
  return cleaned ? truncate(cleaned, max) : null;
}

function cleanUrl(value, protocols) {
  const s = presentString(value);
  if (!s) return null;
  try {
    const url = new URL(s);
    return protocols.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

// ISO strings, epoch seconds or milliseconds (number or numeric string), or a
// Date. Anything unparseable is null rather than a guess.
function cleanDate(value) {
  if (value === undefined || value === null) return null;
  let date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number" || /^\s*\d+(\.\d+)?\s*$/.test(String(value))) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    // Below 1e11 is treated as seconds (1e11 s is the year 5138; 1e11 ms is 1973).
    date = new Date(n < 1e11 ? n * 1000 : n);
  } else {
    // Only ISO 8601 strings: V8's fallback parser turns loose text like
    // "Posted 3" into a real (wrong) date, which would be a guess.
    const s = presentString(value);
    if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
    date = new Date(s);
  }
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toISOString();
  } catch {
    return null;
  }
}

export function normalisePost(raw) {
  if (!raw || typeof raw !== "object") return null;

  const platform = presentString(raw.platform)?.toLowerCase() ?? null;
  if (!platform || !PLATFORMS.includes(platform)) return null;

  const external_id = presentString(raw.external_id);
  if (!external_id) return null;

  const permalink = cleanUrl(raw.permalink, ["https:", "http:"]);
  if (!permalink) return null;

  const media_url = cleanUrl(raw.media_url, ["https:"]);
  const media_type =
    media_url && (raw.media_type === "image" || raw.media_type === "video") ? raw.media_type : null;

  const queryId = Number(raw.query_id);

  return {
    platform,
    external_id,
    permalink,
    author_name: cleanLine(raw.author_name, AUTHOR_MAX),
    author_handle: cleanLine(raw.author_handle, AUTHOR_MAX),
    author_url: cleanUrl(raw.author_url, ["https:", "http:"]),
    text: cleanText(raw.text, TEXT_MAX),
    media_url,
    media_type,
    posted_at: cleanDate(raw.posted_at),
    event_slug: presentString(raw.event_slug),
    query_id: raw.query_id != null && Number.isInteger(queryId) ? queryId : null,
    embed_html: typeof raw.embed_html === "string" && raw.embed_html.trim() ? raw.embed_html : null,
  };
}
