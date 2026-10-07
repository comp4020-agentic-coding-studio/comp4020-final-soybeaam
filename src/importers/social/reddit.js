// Reddit connector (ADR 0003, step 2). App-only OAuth (client_credentials
// grant) against www.reddit.com/api/v1/access_token, then listings from
// oauth.reddit.com. Since November 2025 Reddit no longer issues API
// credentials self-service: new apps need approval under its Responsible
// Builder Policy, and the free tier is non-commercial.
import { MAX_RESULTS, missingEnv, requestJson, mapAll, redact, stripHash } from "./http.js";

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API = "https://oauth.reddit.com";

export const SUPPORTED_KINDS = ["hashtag", "keyword", "profile"];
export const REQUIRED_ENV = ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"];

export function isConfigured(env = process.env) {
  return missingEnv(env, REQUIRED_ENV).length === 0;
}

// Reddit's API rules ask for "<platform>:<app id>:<version> (by /u/<name>)".
function userAgent(env) {
  const by = env?.REDDIT_USERNAME ? `by /u/${env.REDDIT_USERNAME}; ` : "";
  return `web:quad-comp4020:1.0 (${by}COMP4020 student project)`;
}

// One token per run, keyed by client id so a credential change can't reuse
// someone else's token. Failed fetches are never cached.
let tokenCache = null; // { clientId, token, expiresAt }

export function resetTokenCache() {
  tokenCache = null;
}

async function getToken(env) {
  const clientId = env.REDDIT_CLIENT_ID;
  const secret = env.REDDIT_CLIENT_SECRET;
  if (tokenCache && tokenCache.clientId === clientId && tokenCache.expiresAt > Date.now()) {
    return { token: tokenCache.token };
  }
  const basic = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const { data, error } = await requestJson(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent(env),
    },
    body: "grant_type=client_credentials",
    secrets: [clientId, secret, basic],
  });
  if (error) return { error: `token request failed: ${error}` };
  const token = data?.access_token;
  if (!token) return { error: "token request failed: no access_token in response" };
  // The OAuth wiki describes expires_in both as epoch seconds and as seconds
  // from now; handle both, minus a minute's margin. Default one hour.
  const exp = Number(data?.expires_in);
  const expiresAt = !Number.isFinite(exp) || exp <= 0
    ? Date.now() + 3600_000 - 60_000
    : exp > 1e9
      ? exp * 1000 - 60_000
      : Date.now() + exp * 1000 - 60_000;
  tokenCache = { clientId, token, expiresAt };
  return { token };
}

// Reddit HTML-escapes URLs inside JSON (e.g. "&amp;" in preview links).
function unescapeUrl(url) {
  return typeof url === "string" ? url.replace(/&amp;/g, "&") : null;
}

// One listing child's `data` -> normaliser input. NSFW posts are skipped.
export function mapItem(item) {
  const d = item?.data ?? item;
  if (!d || d.over_18) return null;
  if (!d.name || !d.permalink) return null;

  const preview = unescapeUrl(d?.preview?.images?.[0]?.source?.url);
  // thumbnail can be a sentinel like "self", "default", "nsfw", "spoiler".
  const thumb = typeof d.thumbnail === "string" && d.thumbnail.startsWith("https://") ? unescapeUrl(d.thumbnail) : null;
  const author = d.author && d.author !== "[deleted]" ? String(d.author) : null;
  const text = [d.title, d.selftext].filter((s) => s && String(s).trim()).join("\n\n") || null;

  return {
    platform: "reddit",
    external_id: String(d.name),
    permalink: `https://www.reddit.com${d.permalink}`,
    author_name: author,
    author_handle: author ? `u/${author}` : null,
    author_url: author ? `https://www.reddit.com/user/${encodeURIComponent(author)}` : null,
    text,
    media_url: preview ?? thumb ?? null,
    media_type: d.is_video ? "video" : "image",
    posted_at: typeof d.created_utc === "number" ? d.created_utc : null,
  };
}

// Maps a query to an oauth.reddit.com path + params, or { error }.
function buildRequest(query) {
  const limit = String(MAX_RESULTS);
  if (query.kind === "hashtag" || query.kind === "keyword") {
    const q = stripHash(query.value);
    if (!q) return { error: "empty search value" };
    return { path: "/search", params: new URLSearchParams({ q, sort: "new", limit, type: "link" }) };
  }
  const v = String(query.value ?? "").trim().replace(/^\/+/, "");
  const sub = /^r\/([A-Za-z0-9_]{2,21})$/.exec(v);
  if (sub) return { path: `/r/${encodeURIComponent(sub[1])}/new`, params: new URLSearchParams({ limit }) };
  const user = /^u(?:ser)?\/([A-Za-z0-9_-]{3,20})$/.exec(v);
  if (user) {
    return {
      path: `/user/${encodeURIComponent(user[1])}/submitted`,
      params: new URLSearchParams({ sort: "new", limit }),
    };
  }
  return { error: 'profile value must be "r/<subreddit>" or "u/<username>"' };
}

export async function fetchPosts(query, env = process.env) {
  const secrets = [env?.REDDIT_CLIENT_ID, env?.REDDIT_CLIENT_SECRET];
  try {
    if (!SUPPORTED_KINDS.includes(query?.kind)) return { posts: [], error: `unsupported kind: ${query?.kind}` };
    if (!isConfigured(env)) return { posts: [], error: `not configured: ${missingEnv(env, REQUIRED_ENV).join(", ")}` };

    const req = buildRequest(query);
    if (req.error) return { posts: [], error: req.error };

    const auth = await getToken(env);
    if (auth.error) return { posts: [], error: auth.error };

    const { data, error } = await requestJson(`${API}${req.path}?${req.params}`, {
      headers: { Authorization: `bearer ${auth.token}`, "User-Agent": userAgent(env) },
      secrets: [...secrets, auth.token],
    });
    if (error) {
      if (/HTTP 401/.test(error)) resetTokenCache();
      return { posts: [], error };
    }
    return { posts: mapAll(data?.data?.children, mapItem), error: null };
  } catch (err) {
    return { posts: [], error: redact(`reddit connector failed: ${err?.message ?? err}`, secrets) };
  }
}
