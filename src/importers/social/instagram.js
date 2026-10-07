// Instagram Graph API connector (ADR 0003, step 2), via the Instagram API
// with Facebook Login. Needs a User access token for someone with a task on
// the Facebook Page linked to an Instagram Business/Creator account, plus
// that account's IG user id.
// - hashtag: ig_hashtag_search -> /<hashtag-id>/recent_media. Needs the
//   "Instagram Public Content Access" feature (Meta app review). Only media
//   from the last 24 hours, and at most 30 unique hashtags per 7 days per
//   account, so keep hashtag queries few and stable.
// - profile: only the connected account's own /<ig-user-id>/media. Other
//   people's profiles are not readable through this API.
// - keyword and geo: not offered by the API (location search was removed).
import { MAX_RESULTS, missingEnv, requestJson, mapAll, redact, stripHash } from "./http.js";

export const GRAPH_VERSION = "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const SUPPORTED_KINDS = ["hashtag", "profile"];
export const REQUIRED_ENV = ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_BUSINESS_ID"];

export function isConfigured(env = process.env) {
  return missingEnv(env, REQUIRED_ENV).length === 0;
}

// Picks an *image* URL for the card: media_url for IMAGE, thumbnail_url for
// VIDEO (media_url there is the video file), first child for a carousel
// (which has no media_url of its own).
function mediaFrom(m, depth = 0) {
  const type = m?.media_type;
  if (type === "IMAGE") return m?.media_url ? { url: m.media_url, type: "image" } : null;
  if (type === "VIDEO") return m?.thumbnail_url ? { url: m.thumbnail_url, type: "video" } : null;
  if (type === "CAROUSEL_ALBUM" && depth === 0) {
    for (const child of Array.isArray(m?.children?.data) ? m.children.data : []) {
      const found = mediaFrom(child, 1);
      if (found) return found;
    }
  }
  return null;
}

// One IG Media object -> normaliser input. recent_media does not return
// username, so hashtag results have no author.
export function mapItem(item) {
  const id = item?.id;
  const permalink = item?.permalink;
  if (!id || !permalink) return null;
  const media = mediaFrom(item);
  const username = item?.username;
  return {
    platform: "instagram",
    external_id: String(id),
    permalink,
    author_name: username ?? null,
    author_handle: username ? `@${username}` : null,
    author_url: username ? `https://www.instagram.com/${encodeURIComponent(username)}/` : null,
    text: item?.caption ?? null,
    media_url: media?.url ?? null,
    // A video with no thumbnail still counts as a video post; the normaliser
    // drops media_type when there's no media_url.
    media_type: media?.type ?? (item?.media_type === "VIDEO" ? "video" : null),
    posted_at: item?.timestamp ?? null, // "2026-10-01T09:00:00+0000"
  };
}

export async function fetchPosts(query, env = process.env) {
  const token = env?.INSTAGRAM_ACCESS_TOKEN;
  try {
    const kind = query?.kind;
    if (!SUPPORTED_KINDS.includes(kind)) return { posts: [], error: `unsupported kind: ${kind}` };
    if (!isConfigured(env)) return { posts: [], error: `not configured: ${missingEnv(env, REQUIRED_ENV).join(", ")}` };
    const biz = String(env.INSTAGRAM_BUSINESS_ID).trim();
    if (!/^\d+$/.test(biz)) return { posts: [], error: "INSTAGRAM_BUSINESS_ID must be numeric" };
    // Token in a header, not the URL.
    const opts = { headers: { Authorization: `Bearer ${token}` }, secrets: [token] };
    const limit = String(MAX_RESULTS);

    if (kind === "hashtag") {
      const tag = stripHash(query.value);
      if (!/^[\p{L}\p{N}_]+$/u.test(tag)) return { posts: [], error: "hashtag must be letters, digits or _" };
      const search = await requestJson(
        `${GRAPH}/ig_hashtag_search?${new URLSearchParams({ user_id: biz, q: tag })}`,
        opts,
      );
      if (search.error) return { posts: [], error: `hashtag lookup failed: ${search.error}` };
      const hashtagId = search.data?.data?.[0]?.id;
      if (!hashtagId || !/^\d+$/.test(String(hashtagId))) return { posts: [], error: `no hashtag id for #${tag}` };
      const params = new URLSearchParams({
        user_id: biz,
        fields: "id,caption,media_type,media_url,permalink,timestamp,children{media_type,media_url}",
        limit,
      });
      const { data, error } = await requestJson(`${GRAPH}/${hashtagId}/recent_media?${params}`, opts);
      if (error) return { posts: [], error };
      return { posts: mapAll(data?.data, mapItem), error: null };
    }

    // profile: only the connected account. Accept its id, or anything that
    // isn't a different numeric id (e.g. its @username), and read /<biz>/media.
    const v = String(query.value ?? "").trim();
    if (/^\d+$/.test(v) && v !== biz) {
      return { posts: [], error: "only the connected account's own profile is available" };
    }
    const params = new URLSearchParams({
      fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username,children{media_type,media_url,thumbnail_url}",
      limit,
    });
    const { data, error } = await requestJson(`${GRAPH}/${biz}/media?${params}`, opts);
    if (error) return { posts: [], error };
    return { posts: mapAll(data?.data, mapItem), error: null };
  } catch (err) {
    return { posts: [], error: redact(`instagram connector failed: ${err?.message ?? err}`, [token]) };
  }
}
