// Facebook Pages connector (ADR 0003, step 2). The Graph API has no public
// post search, so the only kind is profile: the value is a Page id (or Page
// username) that FACEBOOK_PAGE_TOKEN can read, normally a Page you manage.
// Reading Pages you don't manage needs the "Page Public Content Access"
// feature (Meta app review).
import { MAX_RESULTS, missingEnv, requestJson, mapAll, redact } from "./http.js";

export const GRAPH_VERSION = "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const SUPPORTED_KINDS = ["profile"];
export const REQUIRED_ENV = ["FACEBOOK_PAGE_TOKEN"];

export function isConfigured(env = process.env) {
  return missingEnv(env, REQUIRED_ENV).length === 0;
}

// One Page post -> normaliser input. `from` is the Page itself.
export function mapItem(item) {
  const id = item?.id;
  const permalink = item?.permalink_url;
  if (!id || !permalink) return null;
  const fromId = item?.from?.id;
  return {
    platform: "facebook",
    external_id: String(id),
    permalink,
    author_name: item?.from?.name ?? null,
    author_handle: null,
    author_url: fromId ? `https://www.facebook.com/${encodeURIComponent(fromId)}` : null,
    text: item?.message ?? null,
    media_url: item?.full_picture ?? null,
    media_type: "image",
    posted_at: item?.created_time ?? null, // "2026-10-01T09:00:00+0000"
  };
}

export async function fetchPosts(query, env = process.env) {
  const token = env?.FACEBOOK_PAGE_TOKEN;
  try {
    if (!SUPPORTED_KINDS.includes(query?.kind)) {
      return { posts: [], error: `unsupported kind: ${query?.kind} (Facebook has no public post search)` };
    }
    if (!token) return { posts: [], error: "not configured: FACEBOOK_PAGE_TOKEN" };
    const page = String(query.value ?? "").trim();
    if (!/^[\w.-]{1,100}$/.test(page)) return { posts: [], error: "profile must be a Page id or username" };
    const params = new URLSearchParams({
      fields: "id,message,created_time,permalink_url,full_picture,from{id,name}",
      limit: String(MAX_RESULTS),
    });
    const { data, error } = await requestJson(`${GRAPH}/${encodeURIComponent(page)}/posts?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      secrets: [token],
    });
    if (error) return { posts: [], error };
    return { posts: mapAll(data?.data, mapItem), error: null };
  } catch (err) {
    return { posts: [], error: redact(`facebook connector failed: ${err?.message ?? err}`, [token]) };
  }
}
