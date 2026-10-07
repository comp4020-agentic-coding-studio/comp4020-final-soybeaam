import { afterEach, describe, expect, it, vi } from "vitest";

// Paste-a-post-URL resolver (ADR 0003, Option C). No network and no DB:
// fetch is stubbed per test, and oembed.js imports nothing that opens SQLite.
// @ts-expect-error src/ is plain JS with no declaration files
const { detectProvider, canonicalise, resolvePastedUrl } = await import("../src/importers/social/oembed.js");

afterEach(() => {
  vi.unstubAllGlobals();
});

type Call = { url: string; init?: RequestInit };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const spy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return respond();
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

const canon = (s: string) => detectProvider(s)?.canonical;

describe("detectProvider", () => {
  it("accepts each provider's real URL shapes", () => {
    const cases: [string, string][] = [
      ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
      ["https://youtube.com/shorts/dQw4w9WgXcQ", "youtube"],
      ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
      ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
      ["https://x.com/jack/status/20", "x"],
      ["https://twitter.com/jack/status/20", "x"],
      ["https://mobile.twitter.com/jack/status/20", "x"],
      ["https://www.x.com/jack/status/20", "x"],
      ["https://www.reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama/", "reddit"],
      ["https://old.reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama/", "reddit"],
      ["https://reddit.com/r/IAmA/comments/z1c9z/", "reddit"],
      ["https://bsky.app/profile/bsky.app/post/3l6oveex3ii2l", "bluesky"],
      ["https://mastodon.social/@Mastodon/117156549508722805", "mastodon"],
      ["https://aus.social/@lucie@aus.social/117397486081510051", "mastodon"],
      ["https://aus.social/@lucie/117397486081510051/", "mastodon"],
      ["https://www.instagram.com/p/ABC123/", "instagram"],
      ["https://instagram.com/reel/VID123/", "instagram"],
      ["https://www.facebook.com/zuck/posts/10102577175875681", "facebook"],
      ["https://m.facebook.com/permalink.php?story_fbid=1&id=2", "facebook"],
    ];
    for (const [url, platform] of cases) {
      expect(detectProvider(url)?.platform, url).toBe(platform);
    }
  });

  it("builds each provider's oEmbed endpoint from the canonical URL", () => {
    const ep = (s: string) => detectProvider(s)?.endpoint;
    expect(ep("https://youtu.be/abc")).toBe(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://youtube.com/watch?v=abc")}`,
    );
    expect(ep("https://twitter.com/jack/status/20")).toBe(
      `https://publish.x.com/oembed?omit_script=false&url=${encodeURIComponent("https://x.com/jack/status/20")}`,
    );
    expect(ep("https://old.reddit.com/r/a/comments/b/")).toMatch(/^https:\/\/www\.reddit\.com\/oembed\?url=/);
    expect(ep("https://bsky.app/profile/a/post/b")).toMatch(/^https:\/\/embed\.bsky\.app\/oembed\?url=/);
    expect(ep("https://Aus.Social/@lucie/1")).toBe(
      `https://aus.social/api/oembed?url=${encodeURIComponent("https://aus.social/@lucie/1")}`,
    );
    expect(ep("https://instagram.com/p/X/")).toMatch(/^https:\/\/graph\.facebook\.com\/v[\d.]+\/instagram_oembed\?url=/);
    expect(ep("https://facebook.com/a/posts/1")).toMatch(/\/oembed_post\?url=/);
    expect(ep("https://facebook.com/a/videos/1")).toMatch(/\/oembed_video\?url=/);
  });

  it("rejects non-https, IP literals, local names, odd ports and credentials", () => {
    const bad = [
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)",
      "data:text/html,hi",
      "ftp://x.com/jack/status/20",
      "not a url",
      "",
      "https://127.0.0.1/@a/1",
      "https://10.0.0.5/@a/1",
      "https://169.254.169.254/@a/1",
      "https://2130706433/@a/1",
      "https://0x7f.1/@a/1",
      "https://[::1]/@a/1",
      "https://[fd00::1]/@a/1",
      "https://[::ffff:127.0.0.1]/@a/1",
      "https://localhost/@a/1",
      "https://localhost./@a/1",
      "https://foo.localhost/@a/1",
      "https://printer.local/@a/1",
      "https://printer.local./@a/1",
      "https://metadata.google.internal/@a/1",
      "https://intranet/@a/1",
      "https://mastodon.social:8443/@a/1",
      "https://x.com:444/jack/status/20",
      "https://user:pw@x.com/jack/status/20",
    ];
    for (const url of bad) expect(detectProvider(url), url).toBeNull();
  });

  it("only treats unknown hosts as Mastodon for status-shaped paths", () => {
    for (const url of [
      "https://example.com/foo",
      "https://mastodon.social/@Mastodon",
      "https://mastodon.social/@Mastodon/abc",
      "https://mastodon.social/users/Mastodon/statuses/1",
      "https://mastodon.social/@Mastodon/1/embed",
      "https://evil.example/@a/1/../../admin",
    ]) {
      expect(detectProvider(url), url).toBeNull();
    }
  });
});

describe("canonicalisation", () => {
  it("collapses host variants so the same post dedupes", () => {
    const x = "https://x.com/jack/status/20";
    for (const v of [
      "https://twitter.com/jack/status/20",
      "https://www.twitter.com/jack/status/20",
      "https://mobile.twitter.com/jack/status/20?s=20&t=abc",
      "https://mobile.x.com/jack/status/20/",
      "https://X.COM/jack/status/20#frag",
    ]) {
      expect(canon(v), v).toBe(x);
    }
    const r = "https://reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama";
    expect(canon("https://old.reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama/")).toBe(r);
    expect(canon("https://www.reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama/?utm_source=share")).toBe(r);
    expect(canon("https://m.reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama")).toBe(r);
    expect(canon("https://www.instagram.com/p/ABC123/?igsh=xyz")).toBe("https://instagram.com/p/ABC123");
  });

  it("keeps YouTube's v (and maps youtu.be to it), dropping everything else", () => {
    const y = "https://youtube.com/watch?v=dQw4w9WgXcQ";
    expect(canon("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&si=abc#t=1")).toBe(y);
    expect(canon("https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ")).toBe(y);
    expect(canon("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe(y);
    expect(canon("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share")).toBe("https://youtube.com/shorts/dQw4w9WgXcQ");
  });

  it("keeps Facebook's id params so different posts don't merge", () => {
    const a = canon("https://www.facebook.com/permalink.php?story_fbid=111&id=222&ref=share");
    const b = canon("https://m.facebook.com/permalink.php?id=222&story_fbid=333");
    expect(a).toBe("https://facebook.com/permalink.php?id=222&story_fbid=111");
    expect(b).toBe("https://facebook.com/permalink.php?id=222&story_fbid=333");
    expect(a).not.toBe(b);
  });

  it("keeps a Mastodon instance's own host (lowercased) and strips the trailing slash", () => {
    expect(canon("https://Mastodon.Social/@Mastodon/117156549508722805/?x=1")).toBe(
      "https://mastodon.social/@Mastodon/117156549508722805",
    );
    expect(canon("https://m.example.org/@a/1")).toBe("https://m.example.org/@a/1");
  });

  it("canonicalise is usable directly", () => {
    expect(canonicalise(new URL("https://twitter.com/a/status/1/"), "x")).toBe("https://x.com/a/status/1");
  });
});

// Fixtures trimmed from real responses (probed 2026-10-07).
const FIXTURES: Record<string, { url: string; body: Record<string, unknown> }> = {
  youtube: {
    url: "https://youtu.be/dQw4w9WgXcQ",
    body: {
      title: "Rick Astley - Never Gonna Give You Up",
      author_name: "Rick Astley",
      author_url: "https://www.youtube.com/@RickAstleyYT",
      type: "video",
      thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      html: '<iframe width="200" height="113" src="https://www.youtube.com/embed/dQw4w9WgXcQ?feature=oembed"></iframe>',
    },
  },
  x: {
    url: "https://twitter.com/jack/status/20",
    body: {
      url: "https://x.com/jack/status/20",
      author_name: "jack",
      author_url: "https://x.com/jack",
      type: "rich",
      html: '<blockquote class="twitter-tweet"><p>just setting up my twttr</p></blockquote><script async src="https://platform.x.com/widgets.js"></script>',
    },
  },
  reddit: {
    url: "https://www.reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama_president_of_the_united_states/",
    body: {
      author_name: "PresidentObama",
      title: "I am Barack Obama, President of the United States -- AMA",
      type: "rich",
      html: '<blockquote class="reddit-embed-bq"><a href="https://www.reddit.com/r/IAmA/comments/z1c9z/">AMA</a></blockquote>',
    },
  },
  bluesky: {
    url: "https://bsky.app/profile/bsky.app/post/3l6oveex3ii2l",
    body: {
      type: "rich",
      author_name: "Bluesky (@bsky.app)",
      author_url: "https://bsky.app/profile/bsky.app",
      html: '<blockquote class="bluesky-embed"><p>hello</p></blockquote><script async src="https://embed.bsky.app/static/embed.js"></script>',
    },
  },
  mastodon: {
    url: "https://mastodon.social/@Mastodon/117156549508722805",
    body: {
      type: "rich",
      author_name: "Mastodon",
      author_url: "https://mastodon.social/@Mastodon",
      html: '<blockquote class="mastodon-embed"><a href="https://mastodon.social/@Mastodon/117156549508722805">post</a></blockquote>',
    },
  },
};

describe("resolvePastedUrl", () => {
  it("maps each provider's oEmbed response", async () => {
    for (const [platform, { url, body }] of Object.entries(FIXTURES)) {
      const { calls } = stubFetch(() => json(body));
      const { post, error } = await resolvePastedUrl(url, {});
      expect(error, platform).toBeNull();
      expect(calls).toHaveLength(1);
      const canonical = canon(url);
      expect(post).toMatchObject({
        platform,
        external_id: canonical,
        permalink: canonical,
        author_name: body.author_name,
        author_url: body.author_url ?? null,
        embed_html: body.html,
      });
      if (platform === "youtube") {
        expect(post.text).toBe(body.title);
        expect(post.media_url).toBe(body.thumbnail_url);
        expect(post.media_type).toBe("video");
      } else if (platform === "reddit") {
        expect(post.text).toBe(body.title);
        expect(post.media_url).toBeNull();
      } else {
        expect(post.text).toBeNull();
      }
    }
  });

  it("refuses redirects and sends the Quad User-Agent", async () => {
    const { calls } = stubFetch(() => json(FIXTURES.youtube.body));
    await resolvePastedUrl(FIXTURES.youtube.url, {});
    expect(calls[0].init?.redirect).toBe("error");
    expect((calls[0].init?.headers as Record<string, string>)["User-Agent"]).toMatch(/^Quad\//);
  });

  it("makes no fetch for an unsupported or unsafe URL", async () => {
    const spy = failingFetch();
    for (const url of ["https://example.com/foo", "http://127.0.0.1/x", "javascript:alert(1)", ""]) {
      expect(await resolvePastedUrl(url, {})).toEqual({ post: null, error: "unsupported URL" });
    }
    expect(await resolvePastedUrl(undefined as unknown as string, {})).toEqual({ post: null, error: "unsupported URL" });
    expect(spy).not.toHaveBeenCalled();
  });

  function expectLinkOnly(result: { post: Record<string, unknown>; error: string }, platform: string, canonical: string) {
    expect(result.error).toBeTruthy();
    expect(result.post).toEqual({
      platform,
      external_id: canonical,
      permalink: canonical,
      author_name: null,
      author_url: null,
      text: null,
      media_url: null,
      media_type: null,
      embed_html: null,
    });
  }

  it("falls back to a link-only post when oEmbed fails", async () => {
    const url = "https://x.com/jack/status/20";
    const responders: [string, () => Response | Promise<Response>, RegExp][] = [
      ["404", () => new Response("not found", { status: 404 }), /404/],
      ["500", () => new Response("oops", { status: 500 }), /500/],
      ["bad JSON", () => new Response("<html>nope</html>", { status: 200 }), /malformed JSON/],
      ["no html", () => json({ type: "rich", author_name: "jack" }), /no embeddable html/],
      ["html not a string", () => json({ type: "rich", html: { evil: true } }), /no embeddable html/],
      ["type link", () => json({ type: "link", html: "<p>x</p>" }), /no embeddable html/],
      ["array", () => json([1, 2]), /unexpected response/],
      [
        "timeout",
        () => {
          const err = new Error("The operation was aborted due to timeout");
          err.name = "TimeoutError";
          throw err;
        },
        /timed out/,
      ],
      [
        "redirect refused",
        () => {
          throw new TypeError("fetch failed");
        },
        /network error/,
      ],
    ];
    for (const [label, respond, reason] of responders) {
      stubFetch(respond);
      const result = await resolvePastedUrl(url, {});
      expectLinkOnly(result, "x", url);
      expect(result.error, label).toMatch(reason);
    }
  });

  it("Instagram/Facebook without META_OEMBED_TOKEN make no fetch and store link-only", async () => {
    const spy = failingFetch();
    const ig = await resolvePastedUrl("https://www.instagram.com/p/ABC123/?igsh=1", {});
    expectLinkOnly(ig, "instagram", "https://instagram.com/p/ABC123");
    expect(ig.error).toContain("META_OEMBED_TOKEN");
    const fb = await resolvePastedUrl("https://www.facebook.com/zuck/posts/1", { META_OEMBED_TOKEN: "  " });
    expectLinkOnly(fb, "facebook", "https://facebook.com/zuck/posts/1");
    expect(spy).not.toHaveBeenCalled();
  });

  it("with META_OEMBED_TOKEN sends it as a header, never in the URL or error", async () => {
    const token = "123456|client-token-secret";
    const { calls } = stubFetch(() => json({ error: { message: `bad token ${token}` } }, 400));
    const result = await resolvePastedUrl("https://www.instagram.com/p/ABC123/", { META_OEMBED_TOKEN: token });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).not.toContain(token);
    expect(calls[0].url).not.toContain(encodeURIComponent(token));
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
    expect(result.error).not.toContain(token);
    expectLinkOnly(result, "instagram", "https://instagram.com/p/ABC123");
  });
});
