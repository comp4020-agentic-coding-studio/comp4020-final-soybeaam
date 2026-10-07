// Bluesky (AT Protocol) connector (ADR 0003, step 2).
// - profile: app.bsky.feed.getAuthorFeed on the public AppView. The lexicon
//   says it does not require auth.
// - hashtag/keyword: app.bsky.feed.searchPosts. As of late September 2026
//   Bluesky's CDN refuses unauthenticated searchPosts with an HTML 403 on
//   both public.api.bsky.app and api.bsky.app, and the lexicon now says it
//   "may require authentication". So search needs an app password
//   (BLUESKY_HANDLE + BLUESKY_APP_PASSWORD, never the main password), which
//   is exchanged for a session token via com.atproto.server.createSession on
//   bsky.social, and the search is sent there with that token.
import { MAX_RESULTS, SEARCH_KINDS, missingEnv, requestJson, mapAll, redact, stripHash } from "./http.js";

const PUBLIC_API = "https://public.api.bsky.app/xrpc";
const PDS = "https://bsky.social/xrpc";

export const SUPPORTED_KINDS = ["hashtag", "keyword", "profile"];
// Only needed for the search kinds; profile works without them.
export const REQUIRED_ENV = ["BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD"];

// With a kind, says whether that kind can run. Without one, true because
// profile queries need no credentials.
export function isConfigured(env = process.env, kind) {
  if (kind && SEARCH_KINDS.includes(kind)) return missingEnv(env, REQUIRED_ENV).length === 0;
  return true;
}

// createSession is rate-limited, so the token is cached per handle for the
// run. accessJwt lasts a couple of hours; refresh well before that.
let sessionCache = null; // { handle, token, expiresAt }

export function resetSessionCache() {
  sessionCache = null;
}

async function getSession(env) {
  const handle = env.BLUESKY_HANDLE;
  const password = env.BLUESKY_APP_PASSWORD;
  if (sessionCache && sessionCache.handle === handle && sessionCache.expiresAt > Date.now()) {
    return { token: sessionCache.token };
  }
  const { data, error } = await requestJson(`${PDS}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password }),
    secrets: [password],
  });
  if (error) return { error: `login failed: ${error}` };
  const token = data?.accessJwt;
  if (!token) return { error: "login failed: no accessJwt in response" };
  sessionCache = { handle, token, expiresAt: Date.now() + 30 * 60_000 };
  return { token };
}

const NSFW_LABELS = new Set(["porn", "sexual", "nudity", "graphic-media", "gore"]);

// Image/video thumbnail from a hydrated embed *view* (post.embed). The raw
// record.embed only holds blob refs, not URLs, so it is never used.
function mediaFrom(embed) {
  if (!embed) return null;
  const type = String(embed.$type ?? "");
  if (type.startsWith("app.bsky.embed.recordWithMedia")) return mediaFrom(embed.media);
  if (type.startsWith("app.bsky.embed.images")) {
    const img = embed.images?.[0];
    const url = img?.thumb ?? img?.fullsize;
    return url ? { url, type: "image" } : null;
  }
  if (type.startsWith("app.bsky.embed.video")) {
    return embed.thumbnail ? { url: embed.thumbnail, type: "video" } : null;
  }
  if (type.startsWith("app.bsky.embed.external")) {
    return embed.external?.thumb ? { url: embed.external.thumb, type: "image" } : null;
  }
  return null;
}

// One postView (searchPosts posts[], or getAuthorFeed feed[].post) ->
// normaliser input.
export function mapItem(item) {
  const post = item?.post ?? item;
  const uri = post?.uri;
  if (!uri || typeof uri !== "string") return null;
  if (Array.isArray(post?.labels) && post.labels.some((l) => NSFW_LABELS.has(l?.val))) return null;

  const rkey = uri.split("/").pop();
  const handle = post?.author?.handle;
  const did = post?.author?.did;
  // Without a handle the DID still makes a valid bsky.app URL.
  const who = handle || did;
  if (!rkey || !who) return null;
  const media = mediaFrom(post?.embed);

  return {
    platform: "bluesky",
    external_id: uri,
    permalink: `https://bsky.app/profile/${encodeURIComponent(who)}/post/${encodeURIComponent(rkey)}`,
    author_name: post?.author?.displayName ?? null,
    author_handle: handle ? `@${handle}` : null,
    author_url: handle ? `https://bsky.app/profile/${encodeURIComponent(handle)}` : null,
    text: post?.record?.text ?? null,
    media_url: media?.url ?? null,
    media_type: media?.type ?? null,
    posted_at: post?.record?.createdAt ?? post?.indexedAt ?? null,
  };
}

export async function fetchPosts(query, env = process.env) {
  const secrets = [env?.BLUESKY_APP_PASSWORD];
  try {
    const kind = query?.kind;
    if (!SUPPORTED_KINDS.includes(kind)) return { posts: [], error: `unsupported kind: ${kind}` };

    if (kind === "profile") {
      const actor = String(query.value ?? "").trim().replace(/^@/, "");
      if (!/^([a-z0-9-]+\.)+[a-z0-9-]+$/i.test(actor) && !/^did:[a-z]+:[\w.:%-]+$/.test(actor)) {
        return { posts: [], error: "profile value must be a handle (name.bsky.social) or DID" };
      }
      const params = new URLSearchParams({ actor, limit: String(MAX_RESULTS), filter: "posts_no_replies" });
      const { data, error } = await requestJson(`${PUBLIC_API}/app.bsky.feed.getAuthorFeed?${params}`);
      if (error) return { posts: [], error };
      return { posts: mapAll(data?.feed, mapItem), error: null };
    }

    if (!isConfigured(env, kind)) {
      return { posts: [], error: `not configured: ${missingEnv(env, REQUIRED_ENV).join(", ")}` };
    }
    const term = kind === "hashtag" ? stripHash(query.value) : String(query.value ?? "").trim();
    if (!term) return { posts: [], error: "empty search value" };

    const session = await getSession(env);
    if (session.error) return { posts: [], error: session.error };

    const params = new URLSearchParams({ q: kind === "hashtag" ? `#${term}` : term, sort: "latest", limit: String(MAX_RESULTS) });
    if (kind === "hashtag") params.set("tag", term);
    const { data, error } = await requestJson(`${PDS}/app.bsky.feed.searchPosts?${params}`, {
      headers: { Authorization: `Bearer ${session.token}` },
      secrets: [...secrets, session.token],
    });
    if (error) {
      if (/HTTP 401/.test(error)) resetSessionCache();
      return { posts: [], error };
    }
    return { posts: mapAll(data?.posts, mapItem), error: null };
  } catch (err) {
    return { posts: [], error: redact(`bluesky connector failed: ${err?.message ?? err}`, secrets) };
  }
}
