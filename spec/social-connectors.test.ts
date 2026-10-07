import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Platform connectors and the social import orchestrator (ADR 0003, step 2).
// No network: fetch is stubbed per test and routed by URL. Same isolated-DB
// pattern as spec/ticketmaster-import.test.ts: DATA_DIR points at a fresh
// temp dir BEFORE the dynamic import, since src/db.js opens its file at load.
const scratchDir = mkdtempSync(join(tmpdir(), "social-connectors-test-"));
process.env.DATA_DIR = scratchDir;

// @ts-expect-error src/ is plain JS with no declaration files
const db = await import("../src/db.js");
// @ts-expect-error src/ is plain JS with no declaration files
const { normalisePost } = await import("../src/importers/social/normalise.js");
// @ts-expect-error src/ is plain JS with no declaration files
const { runSocialImport } = await import("../src/importers/social/index.js");
// @ts-expect-error src/ is plain JS with no declaration files
const youtube = await import("../src/importers/social/youtube.js");
// @ts-expect-error src/ is plain JS with no declaration files
const reddit = await import("../src/importers/social/reddit.js");
// @ts-expect-error src/ is plain JS with no declaration files
const bluesky = await import("../src/importers/social/bluesky.js");
// @ts-expect-error src/ is plain JS with no declaration files
const mastodon = await import("../src/importers/social/mastodon.js");
// @ts-expect-error src/ is plain JS with no declaration files
const x = await import("../src/importers/social/x.js");
// @ts-expect-error src/ is plain JS with no declaration files
const instagram = await import("../src/importers/social/instagram.js");
// @ts-expect-error src/ is plain JS with no declaration files
const facebook = await import("../src/importers/social/facebook.js");

afterAll(() => {
  try {
    db.db.close();
  } catch {
    // already closed
  }
  try {
    rmSync(scratchDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  reddit.resetTokenCache();
  bluesky.resetSessionCache();
});

type Route = [match: string, respond: () => Response];
type Call = { url: string; init?: RequestInit };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Stubs fetch with the first route whose substring appears in the URL.
// Unmatched URLs get a 404 so a wrong URL fails loudly in the assertions.
function stubFetch(routes: Route[]) {
  const calls: Call[] = [];
  const spy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes.find(([match]) => url.includes(match));
    return route ? route[1]() : json({ error: "no route" }, 404);
  });
  vi.stubGlobal("fetch", spy);
  return { spy, calls };
}

function failingFetch() {
  const spy = vi.fn(async () => {
    throw new Error("fetch should not have been called");
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

type Raw = Record<string, unknown>;
const q = (platform: string, kind: string, value: string) => ({ id: 1, platform, kind, value, event_slug: null });

function byId(posts: Raw[], id: string) {
  const found = posts.find((p) => p.external_id === id);
  expect(found, `post ${id}`).toBeTruthy();
  return found as Raw;
}

// Partial items map to something the normaliser keeps, with NULLs for the
// missing optional fields.
function expectNullOptionals(raw: Raw, { author = true, date = true } = {}) {
  const post = normalisePost(raw);
  expect(post).toBeTruthy();
  expect(post.media_url).toBeNull();
  expect(post.media_type).toBeNull();
  if (author) {
    expect(post.author_name).toBeNull();
    expect(post.author_handle).toBeNull();
  }
  if (date) expect(post.posted_at).toBeNull();
  return post;
}

// ---------------------------------------------------------------- YouTube

const YT_KEY = "yt-secret-key-123";

function youtubeSearch() {
  return {
    kind: "youtube#searchListResponse",
    pageInfo: { totalResults: 3, resultsPerPage: 25 },
    items: [
      {
        kind: "youtube#searchResult",
        id: { kind: "youtube#video", videoId: "vid123" },
        snippet: {
          publishedAt: "2026-10-01T09:00:00Z",
          channelId: "UCabcdefghijklmnop",
          title: "O-Week at ANU &amp; friends",
          description: "Highlights from Union Court",
          thumbnails: {
            default: { url: "https://i.ytimg.com/vi/vid123/default.jpg", width: 120, height: 90 },
            medium: { url: "https://i.ytimg.com/vi/vid123/mqdefault.jpg", width: 320, height: 180 },
            high: { url: "https://i.ytimg.com/vi/vid123/hqdefault.jpg", width: 480, height: 360 },
          },
          channelTitle: "ANU TV",
          liveBroadcastContent: "none",
        },
      },
      { kind: "youtube#searchResult", id: { kind: "youtube#video", videoId: "vid456" }, snippet: {} },
      { kind: "youtube#searchResult", id: { kind: "youtube#channel", channelId: "UCzzz" }, snippet: { title: "a channel" } },
      null,
    ],
  };
}

describe("youtube connector", () => {
  const env = { YOUTUBE_API_KEY: YT_KEY };

  it("maps a full item, keeps a partial one, skips malformed ones", async () => {
    const { calls } = stubFetch([["/youtube/v3/search", () => json(youtubeSearch())]]);
    const { posts, error } = await youtube.fetchPosts(q("youtube", "hashtag", "#anuoweek"), env);
    expect(error).toBeNull();
    expect(posts).toHaveLength(2);

    const full = byId(posts, "vid123");
    expect(full.permalink).toBe("https://www.youtube.com/watch?v=vid123");
    expect(full.author_name).toBe("ANU TV");
    expect(full.author_url).toBe("https://www.youtube.com/channel/UCabcdefghijklmnop");
    expect(full.media_url).toBe("https://i.ytimg.com/vi/vid123/hqdefault.jpg");
    expect(full.media_type).toBe("video");
    const clean = normalisePost(full);
    expect(clean.text).toBe("O-Week at ANU & friends\n\nHighlights from Union Court");
    expect(clean.posted_at).toBe("2026-10-01T09:00:00.000Z");

    expectNullOptionals(byId(posts, "vid456"));

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("q")).toBe("#anuoweek");
    expect(url.searchParams.get("type")).toBe("video");
    expect(url.searchParams.get("maxResults")).toBe("25");
  });

  it("resolves an @handle for profile, and passes geo as location + radius", async () => {
    const { calls } = stubFetch([
      ["/youtube/v3/channels", () => json({ items: [{ kind: "youtube#channel", id: "UCresolved1234567" }] })],
      ["/youtube/v3/search", () => json({ items: [] })],
    ]);
    const profile = await youtube.fetchPosts(q("youtube", "profile", "@ANUTV"), env);
    expect(profile.error).toBeNull();
    expect(new URL(calls[0].url).searchParams.get("forHandle")).toBe("@ANUTV");
    expect(new URL(calls[1].url).searchParams.get("channelId")).toBe("UCresolved1234567");

    await youtube.fetchPosts(q("youtube", "geo", "-35.28,149.12,5km"), env);
    const geoUrl = new URL(calls[2].url);
    expect(geoUrl.searchParams.get("location")).toBe("-35.28,149.12");
    expect(geoUrl.searchParams.get("locationRadius")).toBe("5km");
  });

  it("rejects a badly formatted geo value without fetching", async () => {
    const spy = failingFetch();
    for (const bad of ["-35.28,149.12", "abc,149,5km", "-95,149,5km", "-35,149,2000km"]) {
      const result = await youtube.fetchPosts(q("youtube", "geo", bad), env);
      expect(result.posts).toEqual([]);
      expect(result.error).toMatch(/geo/);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns the status on 429 without leaking the key", async () => {
    stubFetch([["/youtube/v3/search", () => json({ error: { code: 429, message: `quota for ${YT_KEY}` } }, 429)]]);
    const result = await youtube.fetchPosts(q("youtube", "keyword", "canberra"), env);
    expect(result.posts).toEqual([]);
    expect(result.error).toContain("429");
    expect(result.error).not.toContain(YT_KEY);
  });

  it("isConfigured is false with no env; an unsupported kind makes no fetch", async () => {
    expect(youtube.isConfigured({})).toBe(false);
    expect(youtube.isConfigured(env)).toBe(true);
    const spy = failingFetch();
    const result = await youtube.fetchPosts(q("youtube", "nonsense", "x"), env);
    expect(result).toEqual({ posts: [], error: expect.stringContaining("unsupported kind") });
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- Reddit

const REDDIT_ENV = { REDDIT_CLIENT_ID: "reddit-client-id", REDDIT_CLIENT_SECRET: "reddit-secret-xyz" };
const REDDIT_TOKEN = "reddit-access-token-abc";

function redditToken() {
  return json({ access_token: REDDIT_TOKEN, token_type: "bearer", expires_in: 86400, scope: "*" });
}

function redditListing() {
  return {
    kind: "Listing",
    data: {
      after: null,
      children: [
        {
          kind: "t3",
          data: {
            name: "t3_abc",
            id: "abc",
            subreddit: "canberra",
            title: "Markets at Union Court",
            selftext: "This Saturday &amp; Sunday",
            author: "anu_student",
            permalink: "/r/canberra/comments/abc/markets_at_union_court/",
            created_utc: 1759309200,
            over_18: false,
            thumbnail: "https://b.thumbs.redditmedia.com/thumb.jpg",
            preview: {
              images: [
                {
                  source: { url: "https://preview.redd.it/img.jpg?width=640&amp;format=pjpg&amp;s=abc", width: 640, height: 480 },
                  resolutions: [],
                },
              ],
              enabled: true,
            },
            is_video: false,
          },
        },
        {
          kind: "t3",
          data: {
            name: "t3_def",
            title: "",
            selftext: "",
            permalink: "/r/canberra/comments/def/x/",
            thumbnail: "self",
            over_18: false,
          },
        },
        {
          kind: "t3",
          data: { name: "t3_ghi", title: "default thumb", permalink: "/r/canberra/comments/ghi/y/", thumbnail: "default", author: "a" },
        },
        {
          kind: "t3",
          data: { name: "t3_nsfw", title: "nsfw", permalink: "/r/x/comments/nsfw/z/", over_18: true, author: "b" },
        },
        { kind: "t3", data: { title: "no fullname or permalink" } },
      ],
    },
  };
}

describe("reddit connector", () => {
  it("maps a full item, unescapes &amp; in preview URLs, and skips NSFW and malformed items", async () => {
    const { calls } = stubFetch([
      ["/api/v1/access_token", redditToken],
      ["oauth.reddit.com/search", () => json(redditListing())],
    ]);
    const { posts, error } = await reddit.fetchPosts(q("reddit", "hashtag", "#canberra"), REDDIT_ENV);
    expect(error).toBeNull();
    expect(posts.map((p: Raw) => p.external_id)).toEqual(["t3_abc", "t3_def", "t3_ghi"]);

    const full = byId(posts, "t3_abc");
    expect(full.permalink).toBe("https://www.reddit.com/r/canberra/comments/abc/markets_at_union_court/");
    expect(full.author_handle).toBe("u/anu_student");
    expect(full.author_url).toBe("https://www.reddit.com/user/anu_student");
    expect(full.media_url).toBe("https://preview.redd.it/img.jpg?width=640&format=pjpg&s=abc");
    const clean = normalisePost(full);
    expect(clean.text).toBe("Markets at Union Court\n\nThis Saturday & Sunday");
    expect(clean.posted_at).toBe(new Date(1759309200 * 1000).toISOString());
    expect(clean.media_type).toBe("image");

    // "self" and "default" thumbnails are not media
    const partial = expectNullOptionals(byId(posts, "t3_def"));
    expect(partial.text).toBeNull();
    expect(normalisePost(byId(posts, "t3_ghi")).media_url).toBeNull();

    // token request: basic auth + form body; search: bearer, leading # stripped
    expect(calls[0].init?.method).toBe("POST");
    expect(String((calls[0].init?.headers as Record<string, string>).Authorization)).toMatch(/^Basic /);
    expect(calls[0].init?.body).toBe("grant_type=client_credentials");
    const search = new URL(calls[1].url);
    expect(search.searchParams.get("q")).toBe("canberra");
    expect(search.searchParams.get("sort")).toBe("new");
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe(`bearer ${REDDIT_TOKEN}`);
  });

  it("lists r/<name>/new and user/<name>/submitted, fetching the token once", async () => {
    const { calls } = stubFetch([
      ["/api/v1/access_token", redditToken],
      ["oauth.reddit.com/", () => json({ kind: "Listing", data: { children: [] } })],
    ]);
    await reddit.fetchPosts(q("reddit", "profile", "r/canberra"), REDDIT_ENV);
    await reddit.fetchPosts(q("reddit", "profile", "u/anu_student"), REDDIT_ENV);
    const urls = calls.map((c) => c.url);
    expect(urls.filter((u) => u.includes("access_token"))).toHaveLength(1);
    expect(urls.some((u) => u.startsWith("https://oauth.reddit.com/r/canberra/new?"))).toBe(true);
    expect(urls.some((u) => u.startsWith("https://oauth.reddit.com/user/anu_student/submitted?"))).toBe(true);

    const bad = await reddit.fetchPosts(q("reddit", "profile", "canberra"), REDDIT_ENV);
    expect(bad.error).toMatch(/r\/<subreddit>/);
  });

  it("returns the status on 429 without leaking credentials", async () => {
    stubFetch([
      ["/api/v1/access_token", redditToken],
      ["oauth.reddit.com/", () => new Response("Too Many Requests", { status: 429 })],
    ]);
    const result = await reddit.fetchPosts(q("reddit", "keyword", "canberra"), REDDIT_ENV);
    expect(result.posts).toEqual([]);
    expect(result.error).toContain("429");
    for (const secret of [REDDIT_ENV.REDDIT_CLIENT_ID, REDDIT_ENV.REDDIT_CLIENT_SECRET, REDDIT_TOKEN]) {
      expect(result.error).not.toContain(secret);
    }
  });

  it("isConfigured is false with no env; geo is unsupported and makes no fetch", async () => {
    expect(reddit.isConfigured({})).toBe(false);
    expect(reddit.isConfigured({ REDDIT_CLIENT_ID: "x" })).toBe(false);
    expect(reddit.isConfigured(REDDIT_ENV)).toBe(true);
    const spy = failingFetch();
    const result = await reddit.fetchPosts(q("reddit", "geo", "-35,149,5km"), REDDIT_ENV);
    expect(result.posts).toEqual([]);
    expect(result.error).toContain("unsupported kind");
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- Bluesky

const BSKY_ENV = { BLUESKY_HANDLE: "quad.bsky.social", BLUESKY_APP_PASSWORD: "abcd-efgh-ijkl-mnop" };
const BSKY_JWT = "bsky-access-jwt-123";

function bskyPost(overrides: Raw = {}) {
  return {
    uri: "at://did:plc:abc123/app.bsky.feed.post/3kxyzrkey",
    cid: "bafyreia",
    author: { did: "did:plc:abc123", handle: "anu.bsky.social", displayName: "ANU", labels: [] },
    record: { $type: "app.bsky.feed.post", text: "Union Court markets today", createdAt: "2026-10-01T09:00:00.000Z", langs: ["en"] },
    embed: {
      $type: "app.bsky.embed.images#view",
      images: [
        {
          thumb: "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:abc123/bafkreib@jpeg",
          fullsize: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:abc123/bafkreib@jpeg",
          alt: "",
        },
      ],
    },
    replyCount: 0,
    repostCount: 0,
    likeCount: 3,
    indexedAt: "2026-10-01T09:00:01.000Z",
    labels: [],
    ...overrides,
  };
}

function bskySearch() {
  return {
    posts: [
      bskyPost(),
      { uri: "at://did:plc:def456/app.bsky.feed.post/3kpartial", cid: "bafy2", author: { did: "did:plc:def456" }, record: {} },
      bskyPost({ uri: "at://did:plc:abc123/app.bsky.feed.post/3knsfw", labels: [{ val: "porn" }] }),
      { cid: "no uri" },
    ],
  };
}

describe("bluesky connector", () => {
  it("search logs in with the app password, then maps full, partial and malformed posts", async () => {
    const { calls } = stubFetch([
      ["com.atproto.server.createSession", () => json({ accessJwt: BSKY_JWT, refreshJwt: "r", handle: "quad.bsky.social", did: "did:plc:me" })],
      ["app.bsky.feed.searchPosts", () => json(bskySearch())],
    ]);
    const { posts, error } = await bluesky.fetchPosts(q("bluesky", "hashtag", "#canberra"), BSKY_ENV);
    expect(error).toBeNull();
    expect(posts).toHaveLength(2);

    const full = byId(posts, "at://did:plc:abc123/app.bsky.feed.post/3kxyzrkey");
    expect(full.permalink).toBe("https://bsky.app/profile/anu.bsky.social/post/3kxyzrkey");
    expect(full.author_name).toBe("ANU");
    expect(full.author_handle).toBe("@anu.bsky.social");
    expect(full.text).toBe("Union Court markets today");
    expect(full.media_url).toBe("https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:abc123/bafkreib@jpeg");
    expect(full.media_type).toBe("image");
    expect(normalisePost(full).posted_at).toBe("2026-10-01T09:00:00.000Z");

    // no handle: permalink falls back to the DID
    const partial = byId(posts, "at://did:plc:def456/app.bsky.feed.post/3kpartial");
    expect(partial.permalink).toBe("https://bsky.app/profile/did%3Aplc%3Adef456/post/3kpartial");
    expectNullOptionals(partial);

    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ identifier: "quad.bsky.social", password: BSKY_ENV.BLUESKY_APP_PASSWORD });
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${BSKY_JWT}`);
    expect(new URL(calls[1].url).searchParams.get("q")).toBe("#canberra");
  });

  it("profile uses the public getAuthorFeed with no credentials and unwraps feed items", async () => {
    const { calls } = stubFetch([
      [
        "public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed",
        () => json({ feed: [{ post: bskyPost({ embed: { $type: "app.bsky.embed.video#view", cid: "c", playlist: "https://video.bsky.app/p.m3u8", thumbnail: "https://video.bsky.app/thumb.jpg" } }) }] }),
      ],
    ]);
    const { posts, error } = await bluesky.fetchPosts(q("bluesky", "profile", "@anu.bsky.social"), {});
    expect(error).toBeNull();
    expect(posts).toHaveLength(1);
    expect(posts[0].media_url).toBe("https://video.bsky.app/thumb.jpg");
    expect(posts[0].media_type).toBe("video");
    expect(new URL(calls[0].url).searchParams.get("actor")).toBe("anu.bsky.social");
    expect(calls[0].init?.headers).not.toHaveProperty("Authorization");
  });

  it("returns the status on 429 (or the CDN's HTML 403) without leaking the password", async () => {
    stubFetch([["getAuthorFeed", () => new Response("<html>403 Forbidden</html>", { status: 403 })]]);
    const forbidden = await bluesky.fetchPosts(q("bluesky", "profile", "anu.bsky.social"), {});
    expect(forbidden.error).toContain("403");

    stubFetch([
      ["createSession", () => json({ accessJwt: BSKY_JWT })],
      ["searchPosts", () => json({ error: "RateLimitExceeded" }, 429)],
    ]);
    const result = await bluesky.fetchPosts(q("bluesky", "keyword", "canberra"), BSKY_ENV);
    expect(result.posts).toEqual([]);
    expect(result.error).toContain("429");
    expect(result.error).not.toContain(BSKY_ENV.BLUESKY_APP_PASSWORD);
    expect(result.error).not.toContain(BSKY_JWT);
  });

  it("search kinds need credentials (no fetch without them); unsupported kind makes no fetch", async () => {
    expect(bluesky.isConfigured({}, "hashtag")).toBe(false);
    expect(bluesky.isConfigured({}, "keyword")).toBe(false);
    expect(bluesky.isConfigured({}, "profile")).toBe(true);
    expect(bluesky.isConfigured(BSKY_ENV, "hashtag")).toBe(true);
    const spy = failingFetch();
    const noCreds = await bluesky.fetchPosts(q("bluesky", "hashtag", "canberra"), {});
    expect(noCreds.error).toContain("BLUESKY_APP_PASSWORD");
    const geo = await bluesky.fetchPosts(q("bluesky", "geo", "-35,149,5km"), BSKY_ENV);
    expect(geo.error).toContain("unsupported kind");
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- Mastodon

function mastoStatus(overrides: Raw = {}) {
  return {
    id: "117397486236965675",
    created_at: "2026-10-01T09:00:00.000Z",
    sensitive: false,
    spoiler_text: "",
    visibility: "public",
    uri: "https://aus.social/users/lucie/statuses/117397486081510051",
    url: "https://aus.social/@lucie/117397486081510051",
    content: '<p>Markets at Union Court</p><p><a href="https://aus.social/tags/Canberra" class="mention hashtag">#<span>Canberra</span></a></p>',
    reblog: null,
    account: {
      id: "109264725246380581",
      username: "lucie",
      acct: "lucie@aus.social",
      display_name: "Lucie",
      url: "https://aus.social/@lucie",
    },
    media_attachments: [
      {
        id: "1",
        type: "image",
        url: "https://files.mastodon.social/media_attachments/files/original/a.jpg",
        preview_url: "https://files.mastodon.social/media_attachments/files/small/a.jpg",
      },
    ],
    ...overrides,
  };
}

function mastoTimeline() {
  return [
    mastoStatus(),
    // a boost: the outer status wraps the original
    mastoStatus({
      id: "200",
      uri: "https://mastodon.social/users/booster/statuses/200/activity",
      url: null,
      content: "",
      account: { acct: "booster", display_name: "Booster", url: "https://mastodon.social/@booster" },
      media_attachments: [],
      reblog: mastoStatus({
        id: "201",
        uri: "https://other.example/users/orig/statuses/201",
        url: "https://other.example/@orig/201",
        content: "<p>Original post</p>",
        account: { acct: "orig@other.example", display_name: "Original", url: "https://other.example/@orig" },
        media_attachments: [{ type: "video", url: "https://files.example/v.mp4", preview_url: "https://files.example/v-preview.jpg" }],
      }),
    }),
    mastoStatus({ id: "300", uri: "https://aus.social/users/x/statuses/300", sensitive: true, spoiler_text: "cw" }),
    { id: "400", uri: "https://mastodon.social/users/y/statuses/400", url: null, content: "", media_attachments: [] },
    { id: "500" },
  ];
}

describe("mastodon connector", () => {
  it("maps a full status, unwraps a boost, skips sensitive and malformed ones", async () => {
    const { calls } = stubFetch([["mastodon.social/api/v1/timelines/tag/canberra", () => json(mastoTimeline())]]);
    const { posts, error } = await mastodon.fetchPosts(q("mastodon", "hashtag", "#canberra"), {});
    expect(error).toBeNull();
    expect(posts.map((p: Raw) => p.external_id)).toEqual([
      "https://aus.social/users/lucie/statuses/117397486081510051",
      "https://other.example/users/orig/statuses/201",
      "https://mastodon.social/users/y/statuses/400",
    ]);
    expect(new URL(calls[0].url).searchParams.get("limit")).toBe("25");

    const full = posts[0];
    expect(full.permalink).toBe("https://aus.social/@lucie/117397486081510051");
    expect(full.author_name).toBe("Lucie");
    expect(full.author_handle).toBe("@lucie@aus.social");
    expect(full.author_url).toBe("https://aus.social/@lucie");
    expect(full.media_url).toBe("https://files.mastodon.social/media_attachments/files/small/a.jpg");
    const clean = normalisePost(full);
    expect(clean.text).toBe("Markets at Union Court\n#Canberra");
    expect(clean.posted_at).toBe("2026-10-01T09:00:00.000Z");
    expect(clean.media_type).toBe("image");

    const boost = posts[1];
    expect(boost.permalink).toBe("https://other.example/@orig/201");
    expect(boost.author_name).toBe("Original");
    expect(boost.media_url).toBe("https://files.example/v-preview.jpg");
    expect(boost.media_type).toBe("video");

    // no url: permalink falls back to uri
    const partial = expectNullOptionals(posts[2]);
    expect(partial.permalink).toBe("https://mastodon.social/users/y/statuses/400");
    expect(partial.text).toBeNull();
  });

  it("profile looks up the account and lists its statuses without replies", async () => {
    const { calls } = stubFetch([
      ["/api/v1/accounts/lookup", () => json({ id: "109264725246380581", acct: "lucie@aus.social" })],
      ["/api/v1/accounts/109264725246380581/statuses", () => json([mastoStatus()])],
    ]);
    const { posts, error } = await mastodon.fetchPosts(q("mastodon", "profile", "@lucie@aus.social"), { MASTODON_INSTANCE: "aus.social" });
    expect(error).toBeNull();
    expect(posts).toHaveLength(1);
    expect(calls[0].url).toBe("https://aus.social/api/v1/accounts/lookup?acct=lucie%40aus.social");
    expect(new URL(calls[1].url).searchParams.get("exclude_replies")).toBe("true");
  });

  it("keyword needs MASTODON_TOKEN; an invalid instance is rejected; neither fetches", async () => {
    const spy = failingFetch();
    const keyword = await mastodon.fetchPosts(q("mastodon", "keyword", "canberra"), {});
    expect(keyword.error).toContain("unsupported without MASTODON_TOKEN");
    for (const bad of ["https://mastodon.social", "mastodon.social/path", "evil.com:8080", "user@host.com"]) {
      const result = await mastodon.fetchPosts(q("mastodon", "hashtag", "canberra"), { MASTODON_INSTANCE: bad });
      expect(result.error).toContain("bare hostname");
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("keyword with a token uses v2 search; 429 returns the status without leaking the token", async () => {
    const token = "masto-token-secret";
    const { calls } = stubFetch([["/api/v2/search", () => json({ accounts: [], statuses: [mastoStatus()], hashtags: [] })]]);
    const ok = await mastodon.fetchPosts(q("mastodon", "keyword", "union court"), { MASTODON_TOKEN: token });
    expect(ok.posts).toHaveLength(1);
    expect(new URL(calls[0].url).searchParams.get("type")).toBe("statuses");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);

    stubFetch([["/api/v1/timelines/tag/", () => json({ error: "Too many requests" }, 429)]]);
    const limited = await mastodon.fetchPosts(q("mastodon", "hashtag", "canberra"), { MASTODON_TOKEN: token });
    expect(limited.posts).toEqual([]);
    expect(limited.error).toContain("429");
    expect(limited.error).not.toContain(token);
  });

  it("isConfigured is always true (no credentials needed); geo is unsupported and makes no fetch", async () => {
    expect(mastodon.isConfigured({})).toBe(true);
    const spy = failingFetch();
    const result = await mastodon.fetchPosts(q("mastodon", "geo", "-35,149,5km"), {});
    expect(result.error).toContain("unsupported kind");
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- X

const X_TOKEN = "x-bearer-token-secret";

function xSearch() {
  return {
    data: [
      {
        id: "1840000000000000001",
        text: "Union Court markets #canberra",
        author_id: "42",
        created_at: "2026-10-01T09:00:00.000Z",
        attachments: { media_keys: ["3_1"] },
        edit_history_tweet_ids: ["1840000000000000001"],
      },
      {
        id: "1840000000000000002",
        text: "Video from the gig",
        author_id: "43",
        created_at: "2026-10-01T10:00:00.000Z",
        attachments: { media_keys: ["7_2"] },
      },
      { id: "1840000000000000003", text: "" },
      { text: "no id" },
    ],
    includes: {
      users: [
        { id: "42", name: "ANU Union", username: "ANUunion" },
        { id: "43", name: "Gig Guide", username: "giggude" },
      ],
      media: [
        { media_key: "3_1", type: "photo", url: "https://pbs.twimg.com/media/a.jpg" },
        { media_key: "7_2", type: "video", preview_image_url: "https://pbs.twimg.com/ext_tw_video_thumb/b.jpg" },
      ],
    },
    meta: { result_count: 4, newest_id: "1840000000000000003", oldest_id: "1840000000000000001" },
  };
}

describe("x connector", () => {
  const env = { X_BEARER_TOKEN: X_TOKEN };

  it("joins users and media from includes, keeps partial posts, skips malformed ones", async () => {
    const { calls } = stubFetch([["api.x.com/2/tweets/search/recent", () => json(xSearch())]]);
    const { posts, error } = await x.fetchPosts(q("x", "hashtag", "canberra"), env);
    expect(error).toBeNull();
    expect(posts).toHaveLength(3);

    const full = byId(posts, "1840000000000000001");
    expect(full.permalink).toBe("https://x.com/ANUunion/status/1840000000000000001");
    expect(full.author_name).toBe("ANU Union");
    expect(full.author_handle).toBe("@ANUunion");
    expect(full.author_url).toBe("https://x.com/ANUunion");
    expect(full.text).toBe("Union Court markets #canberra");
    expect(full.media_url).toBe("https://pbs.twimg.com/media/a.jpg");
    expect(full.media_type).toBe("image");
    expect(normalisePost(full).posted_at).toBe("2026-10-01T09:00:00.000Z");

    const video = byId(posts, "1840000000000000002");
    expect(video.author_handle).toBe("@giggude");
    expect(video.media_url).toBe("https://pbs.twimg.com/ext_tw_video_thumb/b.jpg");
    expect(video.media_type).toBe("video");

    const partial = byId(posts, "1840000000000000003");
    expect(partial.permalink).toBe("https://x.com/i/status/1840000000000000003");
    expectNullOptionals(partial);

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("query")).toBe("#canberra -is:retweet");
    expect(url.searchParams.get("expansions")).toBe("author_id,attachments.media_keys");
    expect(Number(url.searchParams.get("max_results"))).toBeGreaterThanOrEqual(10);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${X_TOKEN}`);
    expect(calls[0].url).not.toContain(X_TOKEN);
  });

  it("builds from: queries for profile and surfaces a 200 that only has errors", async () => {
    const { calls } = stubFetch([
      ["api.x.com", () => json({ errors: [{ title: "Invalid Request", detail: "One or more parameters to your request was invalid." }] })],
    ]);
    const result = await x.fetchPosts(q("x", "profile", "@ANUunion"), env);
    expect(new URL(calls[0].url).searchParams.get("query")).toBe("from:ANUunion -is:retweet");
    expect(result.posts).toEqual([]);
    expect(result.error).toContain("invalid");

    stubFetch([["api.x.com", () => json({ meta: { result_count: 0 } })]]);
    const empty = await x.fetchPosts(q("x", "keyword", "nothing matches"), env);
    expect(empty).toEqual({ posts: [], error: null });
  });

  it("returns the status on 429 without leaking the token", async () => {
    stubFetch([["api.x.com", () => json({ title: "Too Many Requests", detail: X_TOKEN }, 429)]]);
    const result = await x.fetchPosts(q("x", "keyword", "canberra"), env);
    expect(result.posts).toEqual([]);
    expect(result.error).toContain("429");
    expect(result.error).not.toContain(X_TOKEN);
  });

  it("isConfigured is false with no env; geo is unsupported and makes no fetch", async () => {
    expect(x.isConfigured({})).toBe(false);
    expect(x.isConfigured(env)).toBe(true);
    const spy = failingFetch();
    const result = await x.fetchPosts(q("x", "geo", "-35,149,5km"), env);
    expect(result.error).toContain("unsupported kind");
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- Instagram

const IG_ENV = { INSTAGRAM_ACCESS_TOKEN: "ig-token-secret", INSTAGRAM_BUSINESS_ID: "17841405822304914" };

function igRecentMedia() {
  return {
    data: [
      {
        id: "18000000000000001",
        caption: "Markets at Union Court #canberra",
        media_type: "IMAGE",
        media_url: "https://scontent.cdninstagram.com/v/a.jpg",
        permalink: "https://www.instagram.com/p/ABC123/",
        timestamp: "2026-10-01T09:00:00+0000",
      },
      {
        id: "18000000000000002",
        caption: "Carousel",
        media_type: "CAROUSEL_ALBUM",
        permalink: "https://www.instagram.com/p/CAR123/",
        timestamp: "2026-10-01T10:00:00+0000",
        children: { data: [{ id: "c1", media_type: "IMAGE", media_url: "https://scontent.cdninstagram.com/v/c1.jpg" }] },
      },
      {
        id: "18000000000000003",
        media_type: "VIDEO",
        media_url: "https://scontent.cdninstagram.com/v/video.mp4",
        permalink: "https://www.instagram.com/reel/VID123/",
      },
      { id: "18000000000000004" },
    ],
    paging: { cursors: { after: "abc" } },
  };
}

describe("instagram connector", () => {
  it("hashtag: looks up the hashtag id, maps full/carousel items, never uses a video file as an image", async () => {
    const { calls } = stubFetch([
      ["/ig_hashtag_search", () => json({ data: [{ id: "17843857450040591" }] })],
      ["/17843857450040591/recent_media", () => json(igRecentMedia())],
    ]);
    const { posts, error } = await instagram.fetchPosts(q("instagram", "hashtag", "#canberra"), IG_ENV);
    expect(error).toBeNull();
    expect(posts).toHaveLength(3);

    const full = byId(posts, "18000000000000001");
    expect(full.permalink).toBe("https://www.instagram.com/p/ABC123/");
    expect(full.text).toBe("Markets at Union Court #canberra");
    expect(full.media_url).toBe("https://scontent.cdninstagram.com/v/a.jpg");
    expect(full.media_type).toBe("image");
    expect(normalisePost(full).posted_at).toBe("2026-10-01T09:00:00.000Z");

    expect(byId(posts, "18000000000000002").media_url).toBe("https://scontent.cdninstagram.com/v/c1.jpg");
    // hashtag results have no thumbnail_url and no username
    expectNullOptionals(byId(posts, "18000000000000003"));

    expect(calls[0].url).toContain(`/${instagram.GRAPH_VERSION}/ig_hashtag_search?`);
    expect(new URL(calls[0].url).searchParams.get("user_id")).toBe(IG_ENV.INSTAGRAM_BUSINESS_ID);
    expect(new URL(calls[1].url).searchParams.get("user_id")).toBe(IG_ENV.INSTAGRAM_BUSINESS_ID);
    for (const c of calls) expect(c.url).not.toContain(IG_ENV.INSTAGRAM_ACCESS_TOKEN);
  });

  it("profile reads only the connected account's media, with username and video thumbnail", async () => {
    const { calls } = stubFetch([
      [
        `/${IG_ENV.INSTAGRAM_BUSINESS_ID}/media`,
        () =>
          json({
            data: [
              {
                id: "18000000000000010",
                media_type: "VIDEO",
                media_url: "https://scontent.cdninstagram.com/v/v.mp4",
                thumbnail_url: "https://scontent.cdninstagram.com/v/v-thumb.jpg",
                permalink: "https://www.instagram.com/reel/OWN123/",
                timestamp: "2026-10-01T09:00:00+0000",
                username: "anu_union",
              },
            ],
          }),
      ],
    ]);
    const { posts, error } = await instagram.fetchPosts(q("instagram", "profile", "@anu_union"), IG_ENV);
    expect(error).toBeNull();
    expect(posts[0].author_handle).toBe("@anu_union");
    expect(posts[0].author_url).toBe("https://www.instagram.com/anu_union/");
    expect(posts[0].media_url).toBe("https://scontent.cdninstagram.com/v/v-thumb.jpg");
    expect(posts[0].media_type).toBe("video");
    expect(calls).toHaveLength(1);

    const spy = failingFetch();
    const other = await instagram.fetchPosts(q("instagram", "profile", "99999"), IG_ENV);
    expect(other.error).toContain("connected account");
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns the status on 429 without leaking the token", async () => {
    stubFetch([["graph.facebook.com", () => json({ error: { message: "rate", code: 4 } }, 429)]]);
    const result = await instagram.fetchPosts(q("instagram", "profile", "me"), IG_ENV);
    expect(result.posts).toEqual([]);
    expect(result.error).toContain("429");
    expect(result.error).not.toContain(IG_ENV.INSTAGRAM_ACCESS_TOKEN);
  });

  it("isConfigured is false with no env; keyword is unsupported and makes no fetch", async () => {
    expect(instagram.isConfigured({})).toBe(false);
    expect(instagram.isConfigured({ INSTAGRAM_ACCESS_TOKEN: "x" })).toBe(false);
    expect(instagram.isConfigured(IG_ENV)).toBe(true);
    const spy = failingFetch();
    const result = await instagram.fetchPosts(q("instagram", "keyword", "canberra"), IG_ENV);
    expect(result.error).toContain("unsupported kind");
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- Facebook

const FB_ENV = { FACEBOOK_PAGE_TOKEN: "fb-page-token-secret" };

describe("facebook connector", () => {
  it("maps Page posts: full, partial, malformed", async () => {
    const { calls } = stubFetch([
      [
        "/123456789/posts",
        () =>
          json({
            data: [
              {
                id: "123456789_111",
                message: "Open day this Saturday",
                created_time: "2026-10-01T09:00:00+0000",
                permalink_url: "https://www.facebook.com/123456789/posts/111",
                full_picture: "https://scontent.xx.fbcdn.net/v/a.jpg",
                from: { id: "123456789", name: "ANU Union" },
              },
              { id: "123456789_222", permalink_url: "https://www.facebook.com/123456789/posts/222" },
              { message: "no id or permalink" },
            ],
            paging: { cursors: { before: "a", after: "b" } },
          }),
      ],
    ]);
    const { posts, error } = await facebook.fetchPosts(q("facebook", "profile", "123456789"), FB_ENV);
    expect(error).toBeNull();
    expect(posts).toHaveLength(2);

    const full = byId(posts, "123456789_111");
    expect(full.permalink).toBe("https://www.facebook.com/123456789/posts/111");
    expect(full.author_name).toBe("ANU Union");
    expect(full.author_url).toBe("https://www.facebook.com/123456789");
    expect(full.text).toBe("Open day this Saturday");
    expect(full.media_url).toBe("https://scontent.xx.fbcdn.net/v/a.jpg");
    expect(normalisePost(full).posted_at).toBe("2026-10-01T09:00:00.000Z");

    expectNullOptionals(byId(posts, "123456789_222"));
    expect(calls[0].url).toContain(`graph.facebook.com/${facebook.GRAPH_VERSION}/123456789/posts?`);
    expect(calls[0].url).not.toContain(FB_ENV.FACEBOOK_PAGE_TOKEN);
  });

  it("returns the status on 429 without leaking the token", async () => {
    stubFetch([["graph.facebook.com", () => json({ error: { message: "limit" } }, 429)]]);
    const result = await facebook.fetchPosts(q("facebook", "profile", "123456789"), FB_ENV);
    expect(result.posts).toEqual([]);
    expect(result.error).toContain("429");
    expect(result.error).not.toContain(FB_ENV.FACEBOOK_PAGE_TOKEN);
  });

  it("isConfigured is false with no env; hashtag is unsupported and makes no fetch", async () => {
    expect(facebook.isConfigured({})).toBe(false);
    expect(facebook.isConfigured(FB_ENV)).toBe(true);
    const spy = failingFetch();
    const result = await facebook.fetchPosts(q("facebook", "hashtag", "canberra"), FB_ENV);
    expect(result.error).toContain("unsupported kind");
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- runSocialImport

describe("runSocialImport", () => {
  const quiet = () => {};

  beforeEach(() => {
    db.db.prepare("DELETE FROM social_posts").run();
    db.db.prepare("DELETE FROM social_queries").run();
  });

  function queryRow(id: number) {
    return db.db.prepare("SELECT * FROM social_queries WHERE id = ?").get(id);
  }

  it("skips an unconfigured platform without fetching and records last_error", async () => {
    const query = db.addSocialQuery({ platform: "youtube", kind: "keyword", value: "canberra" });
    const spy = failingFetch();
    const lines: string[] = [];
    const summary = await runSocialImport({ env: {}, log: (l: string) => lines.push(l) });
    expect(spy).not.toHaveBeenCalled();
    expect(summary[0].error).toBe("not configured: YOUTUBE_API_KEY");
    const row = queryRow(query.id);
    expect(row.last_error).toBe("not configured: YOUTUBE_API_KEY");
    expect(row.last_run_at).toBeTruthy();
    expect(lines.some((l) => l.includes("youtube") && l.includes("not configured"))).toBe(true);
  });

  it("stores posts from a configured connector, and a rerun does not duplicate them", async () => {
    const query = db.addSocialQuery({ platform: "mastodon", kind: "hashtag", value: "canberra" });
    stubFetch([["/api/v1/timelines/tag/canberra", () => json(mastoTimeline())]]);
    const lines: string[] = [];
    const first = await runSocialImport({ env: {}, log: (l: string) => lines.push(l) });
    expect(first[0]).toMatchObject({ stored: 3, error: null });
    expect(lines).toContain('[social] mastodon hashtag "canberra": stored 3, skipped 0');

    const stored = db.listSocialPosts({ platform: "mastodon" });
    expect(stored).toHaveLength(3);
    expect(stored.every((p: Raw) => p.query_id === query.id)).toBe(true);
    const full = stored.find((p: Raw) => p.external_id === "https://aus.social/users/lucie/statuses/117397486081510051");
    expect(full.text).toBe("Markets at Union Court\n#Canberra");
    expect(full.posted_at).toBe("2026-10-01T09:00:00.000Z");
    expect(queryRow(query.id).last_error).toBeNull();

    await runSocialImport({ env: {}, log: quiet });
    expect(db.listSocialPosts({ platform: "mastodon" })).toHaveLength(3);
  });

  it("counts posts the normaliser rejects as skipped", async () => {
    db.addSocialQuery({ platform: "mastodon", kind: "hashtag", value: "canberra" });
    // a javascript: permalink passes the connector but not the normaliser
    stubFetch([["/tag/canberra", () => json([mastoStatus(), mastoStatus({ uri: "tag:bad", url: "javascript:alert(1)" })])]]);
    const [result] = await runSocialImport({ env: {}, log: quiet });
    expect(result).toMatchObject({ stored: 1, skipped: 1 });
  });

  it("tags stored posts with the query's event_slug", async () => {
    db.addSocialQuery({ platform: "mastodon", kind: "hashtag", value: "welcome", event_slug: "welcome-mixer" });
    stubFetch([["/tag/welcome", () => json([mastoStatus()])]]);
    await runSocialImport({ env: {}, log: quiet });
    const posts = db.listSocialPosts({ eventSlug: "welcome-mixer" });
    expect(posts).toHaveLength(1);
    expect(posts[0].event_slug).toBe("welcome-mixer");
  });

  it("one failing query doesn't stop the next; errors never contain secrets", async () => {
    const failing = db.addSocialQuery({ platform: "reddit", kind: "keyword", value: "canberra" });
    const ok = db.addSocialQuery({ platform: "mastodon", kind: "hashtag", value: "canberra" });
    stubFetch([
      ["reddit.com", () => new Response("upstream error", { status: 500 })],
      ["/tag/canberra", () => json([mastoStatus()])],
    ]);
    const summary = await runSocialImport({ env: REDDIT_ENV, log: quiet });
    expect(summary).toHaveLength(2);
    const failRow = queryRow(failing.id);
    expect(failRow.last_error).toContain("500");
    expect(failRow.last_error).not.toContain(REDDIT_ENV.REDDIT_CLIENT_SECRET);
    expect(queryRow(ok.id).last_error).toBeNull();
    expect(db.listSocialPosts({ platform: "mastodon" })).toHaveLength(1);
  });

  it("records unknown platforms and unsupported kinds without fetching", async () => {
    db.db.prepare("INSERT INTO social_queries (platform, kind, value) VALUES ('myspace', 'keyword', 'x')").run();
    const fb = db.addSocialQuery({ platform: "facebook", kind: "hashtag", value: "canberra" });
    const spy = failingFetch();
    const summary = await runSocialImport({ env: FB_ENV, log: quiet });
    expect(spy).not.toHaveBeenCalled();
    expect(summary.map((s: Raw) => s.error)).toEqual(["unknown platform: myspace", "unsupported kind: hashtag"]);
    expect(queryRow(fb.id).last_error).toBe("unsupported kind: hashtag");
  });
});
