// Mastodon connector (ADR 0003, step 2). One instance per deployment, from
// MASTODON_INSTANCE (default mastodon.social). Hashtag timelines and account
// statuses are public on most instances; full-text status search is not
// available to unauthenticated users, so keyword needs MASTODON_TOKEN.
// An instance can still disable public hashtag feeds (401 or an empty list).
import { MAX_RESULTS, requestJson, mapAll, redact, stripHash } from "./http.js";

const DEFAULT_INSTANCE = "mastodon.social";

export const SUPPORTED_KINDS = ["hashtag", "keyword", "profile"];
// Nothing is required: MASTODON_TOKEN is optional and only unlocks keyword.
export const REQUIRED_ENV = [];

export function isConfigured(_env = process.env) {
  return true;
}

// A bare hostname only: no scheme, path, port or credentials.
export function resolveInstance(env) {
  const raw = String(env?.MASTODON_INSTANCE ?? "").trim() || DEFAULT_INSTANCE;
  const ok = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(raw);
  return ok ? raw.toLowerCase() : null;
}

function mediaFrom(attachments) {
  if (!Array.isArray(attachments)) return null;
  const first = attachments.find((a) => ["image", "gifv", "video"].includes(a?.type));
  if (!first) return null;
  // preview_url is always a still image, even for video/gifv.
  const url = first.preview_url ?? (first.type === "image" ? first.url : null);
  return url ? { url, type: first.type === "image" ? "image" : "video" } : null;
}

// One Status -> normaliser input. Boosts are unwrapped to the boosted post;
// sensitive (content-warned) posts are skipped. external_id is the status
// `uri`, which is the same across instances (the numeric `id` is local to
// the instance that served it, so switching MASTODON_INSTANCE would
// duplicate posts).
export function mapItem(item) {
  const s = item?.reblog ?? item;
  if (!s || s.sensitive) return null;
  const id = s.uri ?? s.url;
  const permalink = s.url ?? s.uri;
  if (!id || !permalink) return null;
  const media = mediaFrom(s.media_attachments);
  const acct = s.account?.acct;
  return {
    platform: "mastodon",
    external_id: String(id),
    permalink,
    author_name: s.account?.display_name || s.account?.username || null,
    author_handle: acct ? `@${acct}` : null,
    author_url: s.account?.url ?? null,
    text: s.content ?? null, // HTML; the normaliser strips tags
    media_url: media?.url ?? null,
    media_type: media?.type ?? null,
    posted_at: s.created_at ?? null,
  };
}

export async function fetchPosts(query, env = process.env) {
  const token = env?.MASTODON_TOKEN;
  try {
    const kind = query?.kind;
    if (!SUPPORTED_KINDS.includes(kind)) return { posts: [], error: `unsupported kind: ${kind}` };
    const instance = resolveInstance(env);
    if (!instance) return { posts: [], error: "MASTODON_INSTANCE must be a bare hostname like mastodon.social" };
    const base = `https://${instance}/api`;
    const auth = token ? { Authorization: `Bearer ${token}` } : {};
    const opts = { headers: auth, secrets: [token] };
    const limit = String(MAX_RESULTS);

    if (kind === "hashtag") {
      const tag = stripHash(query.value);
      if (!/^[\p{L}\p{N}_]+$/u.test(tag)) return { posts: [], error: "hashtag must be letters, digits or _" };
      const { data, error } = await requestJson(`${base}/v1/timelines/tag/${encodeURIComponent(tag)}?limit=${limit}`, opts);
      if (error) return { posts: [], error };
      return { posts: mapAll(data, mapItem), error: null };
    }

    if (kind === "keyword") {
      if (!token) return { posts: [], error: "keyword search unsupported without MASTODON_TOKEN" };
      const q = String(query.value ?? "").trim();
      if (!q) return { posts: [], error: "empty search value" };
      const params = new URLSearchParams({ q, type: "statuses", limit });
      const { data, error } = await requestJson(`${base}/v2/search?${params}`, opts);
      if (error) return { posts: [], error };
      return { posts: mapAll(data?.statuses, mapItem), error: null };
    }

    // profile: "@user", "user" or "user@other.instance"
    const acct = String(query.value ?? "").trim().replace(/^@/, "");
    if (!/^[\w.-]+(@[\w.-]+\.[a-z]{2,})?$/i.test(acct)) {
      return { posts: [], error: "profile must look like @user or user@instance" };
    }
    const lookup = await requestJson(`${base}/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`, opts);
    if (lookup.error) return { posts: [], error: `account lookup failed: ${lookup.error}` };
    const accountId = lookup.data?.id;
    if (!accountId || !/^\w+$/.test(String(accountId))) return { posts: [], error: `no account found for ${acct}` };
    const { data, error } = await requestJson(
      `${base}/v1/accounts/${encodeURIComponent(accountId)}/statuses?limit=${limit}&exclude_replies=true`,
      opts,
    );
    if (error) return { posts: [], error };
    return { posts: mapAll(data, mapItem), error: null };
  } catch (err) {
    return { posts: [], error: redact(`mastodon connector failed: ${err?.message ?? err}`, [token]) };
  }
}
