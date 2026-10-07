// Manual fallback for the social aggregator (ADR 0003, Option C): a
// logged-in user pastes a post URL on an event page, and the server resolves
// it through the platform's official oEmbed endpoint. No scraping: only the
// documented oEmbed endpoints below are ever called, and only for URLs on an
// explicit host allowlist (plus Mastodon status URLs, matched by path).
//
// resolvePastedUrl() never throws. A supported URL always yields a post: if
// oEmbed fails (or Meta's token isn't configured) it falls back to a
// link-only post, so a paste never silently disappears.

import { requestJson } from "./http.js";
import { GRAPH_VERSION } from "./instagram.js";

// host -> platform for the fixed providers. Anything else can only be a
// Mastodon instance, and only for a status-shaped path.
const HOSTS = {
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "m.youtube.com": "youtube",
  "youtu.be": "youtube",
  "x.com": "x",
  "www.x.com": "x",
  "mobile.x.com": "x",
  "twitter.com": "x",
  "www.twitter.com": "x",
  "mobile.twitter.com": "x",
  "reddit.com": "reddit",
  "www.reddit.com": "reddit",
  "old.reddit.com": "reddit",
  "m.reddit.com": "reddit",
  "bsky.app": "bluesky",
  "instagram.com": "instagram",
  "www.instagram.com": "instagram",
  "facebook.com": "facebook",
  "www.facebook.com": "facebook",
  "m.facebook.com": "facebook",
};

// The one host each fixed platform's canonical URL uses, so the same post
// pasted as twitter.com / mobile.x.com / x.com (etc.) gets one external_id.
const CANONICAL_HOST = {
  youtube: "youtube.com",
  x: "x.com",
  reddit: "reddit.com",
  bluesky: "bsky.app",
  instagram: "instagram.com",
  facebook: "facebook.com",
};

const MASTODON_PATH = /^\/@[A-Za-z0-9_]+(@[A-Za-z0-9.-]+)?\/\d+$/;

// Meta's oEmbed needs an app access token; without one we make no call.
const META_PLATFORMS = new Set(["instagram", "facebook"]);

// Query params that identify the post itself and must survive
// canonicalisation (everything else, e.g. tracking params, is dropped).
// Facebook's permalink.php / photo.php / watch URLs carry the post id in the
// query, so dropping it would merge different posts into one row.
const KEEP_PARAMS = {
  youtube: ["v"],
  facebook: ["fbid", "id", "story_fbid", "v"],
};

// Large enough for every provider's real embed (Mastodon's, the biggest
// seen, is ~3 KB); anything bigger is treated as no embed.
const EMBED_MAX = 50_000;

// SSRF guard. Runs on the WHATWG-parsed hostname, which has already turned
// decimal/hex/short IPv4 forms (https://2130706433/, https://0x7f.1/) into
// dotted quads. Rejects IP literals, local-only names, single-label hosts,
// explicit ports and credentials.
//
// Residual risk: there is deliberately no DNS resolution here, so a public
// hostname whose DNS points at a private address (or DNS rebinding) would
// still be fetched. That only matters for the Mastodon branch (the fixed
// providers are hard-coded hosts), the request is a GET to /api/oembed with
// redirects refused, and only JSON is read back, which limits what it could
// reach or reveal. Closing it fully needs resolve-then-pin, which Node's
// fetch doesn't expose without an extra dependency.
export function isSafeHost(url) {
  if (url.username || url.password) return false;
  if (url.port !== "") return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  if (host.includes("[") || host.includes(":")) return false; // IPv6 literal
  if (/^[\d.]+$/.test(host)) return false; // IPv4 literal
  if (!host.includes(".")) return false; // single-label (intranet) name
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  for (const suffix of [".local", ".internal", ".lan", ".home.arpa"]) {
    if (host.endsWith(suffix)) return false;
  }
  return true;
}

function trimPath(pathname) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "";
}

// Canonical URL for a post, built from its parts so userinfo, port, fragment
// and stray query params never survive. Fixed providers collapse to one host;
// a Mastodon instance keeps its own (lowercased) host, since that is the
// instance's identity.
export function canonicalise(url, platform) {
  const rawHost = url.hostname.toLowerCase().replace(/\.$/, "");
  const host = CANONICAL_HOST[platform] ?? rawHost;
  let path = trimPath(url.pathname);
  const params = new URLSearchParams();

  if (platform === "youtube" && rawHost === "youtu.be") {
    const id = path.split("/")[1];
    path = "/watch";
    if (id) params.set("v", id);
  } else {
    const keep = KEEP_PARAMS[platform] ?? [];
    // youtube keeps v only on /watch; facebook keeps its id params anywhere
    const applies = platform !== "youtube" || path === "/watch";
    if (applies) {
      for (const name of [...keep].sort()) {
        const value = url.searchParams.get(name);
        if (value) params.set(name, value);
      }
    }
  }

  const query = params.toString();
  return `https://${host}${path}${query ? `?${query}` : ""}`;
}

function oembedEndpoint(platform, canonical, host) {
  const u = encodeURIComponent(canonical);
  switch (platform) {
    case "youtube":
      return `https://www.youtube.com/oembed?format=json&url=${u}`;
    case "x":
      // publish.twitter.com now 301s here; with redirects refused we must
      // call the final host directly.
      return `https://publish.x.com/oembed?omit_script=false&url=${u}`;
    case "reddit":
      return `https://www.reddit.com/oembed?url=${u}`;
    case "bluesky":
      return `https://embed.bsky.app/oembed?url=${u}`;
    case "mastodon":
      return `https://${host}/api/oembed?url=${u}`;
    case "instagram":
      return `https://graph.facebook.com/${GRAPH_VERSION}/instagram_oembed?url=${u}`;
    case "facebook": {
      const isVideo = /\/videos\/|^https:\/\/facebook\.com\/watch\b/.test(canonical);
      return `https://graph.facebook.com/${GRAPH_VERSION}/${isVideo ? "oembed_video" : "oembed_post"}?url=${u}`;
    }
    default:
      return null;
  }
}

// { platform, endpoint, canonical } for a supported, safe post URL, else null.
export function detectProvider(urlString) {
  let url;
  try {
    url = new URL(String(urlString ?? "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!isSafeHost(url)) return null;

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  let platform = HOSTS[host] ?? null;
  if (!platform) {
    if (!MASTODON_PATH.test(trimPath(url.pathname))) return null;
    platform = "mastodon";
  }

  const canonical = canonicalise(url, platform);
  const endpoint = oembedEndpoint(platform, canonical, host);
  return endpoint ? { platform, endpoint, canonical } : null;
}

function str(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function linkOnly(platform, canonical, reason) {
  return {
    post: {
      platform,
      external_id: canonical,
      permalink: canonical,
      author_name: null,
      author_url: null,
      text: null,
      media_url: null,
      media_type: null,
      embed_html: null,
    },
    error: reason,
  };
}

// { post, error }: post is in normalisePost() input shape, or null for an
// unsupported/unsafe URL (in which case no network call is made). Never throws.
export async function resolvePastedUrl(urlString, env = process.env) {
  let provider;
  try {
    provider = detectProvider(urlString);
  } catch {
    provider = null;
  }
  if (!provider) return { post: null, error: "unsupported URL" };

  const { platform, endpoint, canonical } = provider;
  try {
    const headers = {};
    const secrets = [];
    if (META_PLATFORMS.has(platform)) {
      const token = typeof env?.META_OEMBED_TOKEN === "string" ? env.META_OEMBED_TOKEN.trim() : "";
      if (!token) return linkOnly(platform, canonical, "not configured: META_OEMBED_TOKEN");
      // Header, not query string, so the token never lands in a URL or log.
      headers.Authorization = `Bearer ${token}`;
      secrets.push(token);
    }

    const { data, error } = await requestJson(endpoint, { headers, secrets, redirect: "error" });
    if (error) return linkOnly(platform, canonical, `oEmbed failed: ${error}`);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return linkOnly(platform, canonical, "oEmbed failed: unexpected response");
    }

    const html = str(data.html);
    const embeddable = (data.type === "rich" || data.type === "video") && html && html.length <= EMBED_MAX;
    if (!embeddable) return linkOnly(platform, canonical, "oEmbed failed: no embeddable html");

    const thumbnail = str(data.thumbnail_url);
    return {
      post: {
        platform,
        external_id: canonical,
        permalink: canonical,
        author_name: str(data.author_name),
        author_url: str(data.author_url),
        text: platform === "youtube" || platform === "reddit" ? str(data.title) : null,
        media_url: thumbnail,
        media_type: thumbnail ? (platform === "youtube" ? "video" : "image") : null,
        embed_html: html,
      },
      error: null,
    };
  } catch (err) {
    return linkOnly(platform, canonical, `oEmbed failed: ${err?.message ?? String(err)}`);
  }
}
