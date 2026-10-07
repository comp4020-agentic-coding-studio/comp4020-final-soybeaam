import { describe, expect, it } from "vitest";

// Pure unit tests for the social post normaliser (ADR 0003, "Parsing and
// missing data"). No DB, no server: normalise.js never touches either.
// @ts-expect-error src/ is plain JS with no declaration files
import { normalisePost, PLATFORMS } from "../src/importers/social/normalise.js";

const base = {
  platform: "bluesky",
  external_id: "abc123",
  permalink: "https://bsky.app/profile/someone/post/abc123",
};

describe("required fields", () => {
  it("accepts a minimal valid post", () => {
    const post = normalisePost(base);
    expect(post).not.toBeNull();
    expect(post.platform).toBe("bluesky");
    expect(post.external_id).toBe("abc123");
    expect(post.permalink).toBe(base.permalink);
  });

  it("exports the seven platforms", () => {
    expect(PLATFORMS).toEqual(["youtube", "reddit", "bluesky", "mastodon", "instagram", "facebook", "x"]);
  });

  it.each([
    ["missing platform", { ...base, platform: undefined }],
    ["unknown platform", { ...base, platform: "myspace" }],
    ["missing external_id", { ...base, external_id: undefined }],
    ["whitespace external_id", { ...base, external_id: "   " }],
    ["'undefined' external_id", { ...base, external_id: "undefined" }],
    ["missing permalink", { ...base, permalink: undefined }],
    ["garbage permalink", { ...base, permalink: "not a url" }],
    ["javascript: permalink", { ...base, permalink: "javascript:alert(1)" }],
  ])("rejects %s", (_label, raw) => {
    expect(normalisePost(raw)).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(normalisePost(null)).toBeNull();
    expect(normalisePost(undefined)).toBeNull();
    expect(normalisePost("post")).toBeNull();
  });
});

describe("optional fields", () => {
  it("turns empty, whitespace, 'undefined' and 'null' into null, never ''", () => {
    const post = normalisePost({
      ...base,
      author_name: "",
      author_handle: "   ",
      author_url: "undefined",
      text: "null",
      media_url: undefined,
      media_type: "image",
      posted_at: "",
      event_slug: " ",
      query_id: null,
      embed_html: "",
    });
    expect(post.author_name).toBeNull();
    expect(post.author_handle).toBeNull();
    expect(post.author_url).toBeNull();
    expect(post.text).toBeNull();
    expect(post.media_url).toBeNull();
    expect(post.media_type).toBeNull();
    expect(post.posted_at).toBeNull();
    expect(post.event_slug).toBeNull();
    expect(post.query_id).toBeNull();
    expect(post.embed_html).toBeNull();
    expect(Object.values(post)).not.toContain("");
  });

  it("strips HTML, decodes entities and collapses whitespace", () => {
    const post = normalisePost({
      ...base,
      text: "<p>Hello   <b>world</b> &amp; friends</p><p>Tom &lt;3 &quot;quad&quot; &#39;26&nbsp;!</p>",
      author_name: "  <i>Jane</i>\n  Doe  ",
    });
    expect(post.text).toBe(`Hello world & friends\nTom <3 "quad" '26 !`);
    expect(post.author_name).toBe("Jane Doe");
  });

  it("decodes &amp; last, so double-encoded text stays literal", () => {
    expect(normalisePost({ ...base, text: "&amp;lt;tag&amp;gt;" }).text).toBe("&lt;tag&gt;");
  });

  it("treats text that is only tags as missing", () => {
    expect(normalisePost({ ...base, text: "<p> </p><br>" }).text).toBeNull();
  });

  it("truncates text to 2000 characters including the ellipsis", () => {
    const post = normalisePost({ ...base, text: "a".repeat(2500) });
    expect(post.text).toHaveLength(2000);
    expect(post.text.endsWith("…")).toBe(true);
    // exactly 2000 is left alone
    expect(normalisePost({ ...base, text: "b".repeat(2000) }).text).toBe("b".repeat(2000));
  });

  it("drops a non-https media_url, and media_type with it", () => {
    const post = normalisePost({ ...base, media_url: "http://example.com/a.jpg", media_type: "image" });
    expect(post.media_url).toBeNull();
    expect(post.media_type).toBeNull();
  });

  it("keeps an https media_url with a valid media_type, and drops an unknown type", () => {
    const ok = normalisePost({ ...base, media_url: "https://example.com/a.jpg", media_type: "video" });
    expect(ok.media_url).toBe("https://example.com/a.jpg");
    expect(ok.media_type).toBe("video");
    const odd = normalisePost({ ...base, media_url: "https://example.com/a.jpg", media_type: "gif" });
    expect(odd.media_type).toBeNull();
  });

  it("drops an author_url that isn't http(s)", () => {
    expect(normalisePost({ ...base, author_url: "javascript:alert(1)" }).author_url).toBeNull();
    expect(normalisePost({ ...base, author_url: "https://bsky.app/profile/x" }).author_url).toBe(
      "https://bsky.app/profile/x",
    );
  });

  it("passes embed_html through unchanged", () => {
    const html = '<blockquote class="x">hi</blockquote>';
    expect(normalisePost({ ...base, embed_html: html }).embed_html).toBe(html);
  });
});

describe("posted_at", () => {
  const iso = "2026-10-07T01:02:03.000Z";
  const ms = Date.parse(iso);

  it.each([
    ["ISO string", "2026-10-07T12:02:03+11:00"],
    ["epoch seconds", ms / 1000],
    ["epoch milliseconds", ms],
    ["numeric string (seconds)", String(ms / 1000)],
    ["numeric string (ms)", String(ms)],
    ["Date", new Date(ms)],
  ])("parses %s to ISO UTC", (_label, value) => {
    expect(normalisePost({ ...base, posted_at: value }).posted_at).toBe(iso);
  });

  it.each([
    ["garbage", "next tuesday-ish"],
    // V8 would parse these loose strings into real dates; they must not be guessed.
    ["loose text with a number", "Posted 3"],
    ["loose text with a day", "event on 12"],
    ["invalid Date", new Date("nope")],
    ["object", {}],
  ])(
    "%s becomes null",
    (_label, value) => {
      expect(normalisePost({ ...base, posted_at: value }).posted_at).toBeNull();
    },
  );
});
