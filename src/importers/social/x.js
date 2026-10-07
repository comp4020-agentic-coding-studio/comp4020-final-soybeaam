// X (Twitter) API v2 connector (ADR 0003, step 2). Recent search (last 7
// days) with an app-only Bearer token. X has no free read tier: reads are
// pay-per-use (about US$0.005 per post returned at the time of writing), so
// 25 posts per query per run on the 30 minute schedule is roughly US$6 a day
// per query. A 402 means the account has run out of credits.
import { MAX_RESULTS, missingEnv, requestJson, mapAll, redact, stripHash } from "./http.js";

const SEARCH_URL = "https://api.x.com/2/tweets/search/recent";

export const SUPPORTED_KINDS = ["hashtag", "keyword", "profile"];
export const REQUIRED_ENV = ["X_BEARER_TOKEN"];

export function isConfigured(env = process.env) {
  return missingEnv(env, REQUIRED_ENV).length === 0;
}

// includes.users / includes.media -> lookup maps keyed by id / media_key.
export function buildLookups(includes) {
  const users = new Map();
  const media = new Map();
  for (const u of Array.isArray(includes?.users) ? includes.users : []) if (u?.id) users.set(String(u.id), u);
  for (const m of Array.isArray(includes?.media) ? includes.media : []) if (m?.media_key) media.set(String(m.media_key), m);
  return { users, media };
}

// One post from data[] -> normaliser input, joining its author and first
// media item from the response's `includes`.
export function mapItem(item, lookups = buildLookups(null)) {
  const id = item?.id;
  if (!id || !/^\d+$/.test(String(id))) return null;
  const user = item?.author_id ? lookups.users.get(String(item.author_id)) : undefined;
  const username = user?.username;
  const firstKey = item?.attachments?.media_keys?.[0];
  const m = firstKey ? lookups.media.get(String(firstKey)) : undefined;
  // Photos have url; videos and GIFs only have a preview image.
  const isVideo = m?.type === "video" || m?.type === "animated_gif";
  const mediaUrl = m ? (isVideo ? m.preview_image_url : (m.url ?? m.preview_image_url)) : null;

  return {
    platform: "x",
    external_id: String(id),
    // x.com/i/status/<id> resolves without knowing the username.
    permalink: username
      ? `https://x.com/${encodeURIComponent(username)}/status/${id}`
      : `https://x.com/i/status/${id}`,
    author_name: user?.name ?? null,
    author_handle: username ? `@${username}` : null,
    author_url: username ? `https://x.com/${encodeURIComponent(username)}` : null,
    text: item?.text ?? null,
    media_url: mediaUrl ?? null,
    media_type: m ? (isVideo ? "video" : "image") : null,
    posted_at: item?.created_at ?? null,
  };
}

function buildQuery(query) {
  const v = String(query.value ?? "").trim();
  if (query.kind === "hashtag") {
    const tag = stripHash(v);
    return /^[\p{L}\p{N}_]+$/u.test(tag) ? `#${tag}` : null;
  }
  if (query.kind === "profile") {
    const user = v.replace(/^@/, "");
    return /^\w{1,15}$/.test(user) ? `from:${user}` : null;
  }
  return v || null;
}

export async function fetchPosts(query, env = process.env) {
  const token = env?.X_BEARER_TOKEN;
  try {
    if (!SUPPORTED_KINDS.includes(query?.kind)) return { posts: [], error: `unsupported kind: ${query?.kind}` };
    if (!token) return { posts: [], error: "not configured: X_BEARER_TOKEN" };
    const q = buildQuery(query);
    if (!q) return { posts: [], error: `invalid ${query.kind} value` };

    // tweet.fields, not post.fields: the auto-generated reference page shows
    // post.fields, but the guides, data dictionary and SDKs all use tweet.fields.
    const params = new URLSearchParams({
      query: `${q} -is:retweet`,
      max_results: String(Math.max(10, MAX_RESULTS)), // API minimum is 10
      "tweet.fields": "created_at,author_id,attachments",
      expansions: "author_id,attachments.media_keys",
      "user.fields": "name,username",
      "media.fields": "url,preview_image_url,type",
    });
    const { data, error } = await requestJson(`${SEARCH_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      secrets: [token],
    });
    if (error) return { posts: [], error: error.startsWith("HTTP 402") ? `${error} (out of API credits)` : error };

    // A 200 can still carry only errors[] (e.g. a rejected query). No data
    // and no errors is just zero results.
    if (!Array.isArray(data?.data)) {
      const first = Array.isArray(data?.errors) ? data.errors[0] : null;
      return { posts: [], error: first ? redact(`X API error: ${first.detail ?? first.message ?? first.title ?? "unknown"}`, [token]) : null };
    }

    const lookups = buildLookups(data?.includes);
    return { posts: mapAll(data.data, (item) => mapItem(item, lookups)), error: null };
  } catch (err) {
    return { posts: [], error: redact(`x connector failed: ${err?.message ?? err}`, [token]) };
  }
}
