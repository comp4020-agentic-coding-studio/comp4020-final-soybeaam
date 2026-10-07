import { describe, expect, it } from "vitest";

// Rendering tests for one social card (ADR 0003 frontend rules). views.js has
// no DB import, so it loads directly with no isolated-DB setup.
// @ts-expect-error src/ is plain JS with no declaration files
import { socialCard } from "../src/views.js";

const full = {
  id: 7,
  platform: "mastodon",
  external_id: "109",
  permalink: "https://mastodon.social/@anu/109",
  author_name: "ANU Events",
  author_handle: "anu",
  author_url: "https://mastodon.social/@anu",
  text: "Mixer tonight\nUnion Court",
  media_url: "https://files.example.com/a.jpg",
  media_type: "image",
  posted_at: "2026-10-07T01:00:00.000Z",
};

const minimal = {
  id: 8,
  platform: "x",
  external_id: "1",
  permalink: "https://x.com/i/status/1",
};

describe("socialCard", () => {
  it("renders every part of a fully populated post", () => {
    const html = socialCard(full, { user: null });
    expect(html).toContain("Mastodon");
    expect(html).toContain('href="https://mastodon.social/@anu"');
    expect(html).toContain("ANU Events");
    expect(html).toContain("@anu");
    expect(html).toContain('<time datetime="2026-10-07T01:00:00.000Z">');
    expect(html).toContain("7 Oct 2026");
    expect(html).toContain('<img src="https://files.example.com/a.jpg"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('onerror="this.remove()"');
    expect(html).toContain("Mixer tonight\nUnion Court");
    expect(html).not.toContain("<br");
    expect(html).toContain('href="https://mastodon.social/@anu/109"');
    expect(html).toContain("View on Mastodon");
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("renders a minimal post with no empty or broken parts", () => {
    const html = socialCard(minimal, { user: null });
    expect(html).toContain(">X<");
    expect(html).toContain("Unknown author");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<time");
    expect(html).not.toContain("Invalid Date");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
    expect(html).toContain("View on X");
  });

  it("omits the time line for an unparseable posted_at", () => {
    const html = socialCard({ ...minimal, posted_at: "not a date" }, { user: null });
    expect(html).not.toContain("<time");
    expect(html).not.toContain("Invalid Date");
  });

  it("shows a Video label for a video thumbnail", () => {
    const html = socialCard({ ...full, media_type: "video" }, { user: null });
    expect(html).toContain("<img");
    expect(html).toContain("Video");
  });

  it("escapes hostile text, author and attribute values", () => {
    const html = socialCard(
      {
        ...full,
        text: "<script>alert(1)</script>",
        author_name: "<script>alert(2)</script>",
        permalink: 'https://e.com/a"onmouseover="alert(3)',
        media_url: "https://e.com/b'onerror='alert(4)",
      },
      { user: null },
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
    expect(html).not.toContain('"onmouseover=');
    expect(html).not.toContain("'onerror=");
    expect(html).toContain("&quot;onmouseover=&quot;");
  });

  it("shows the hide form only to a logged-in user", () => {
    expect(socialCard(full, { user: null })).not.toContain("/social/7/hide");
    const html = socialCard(full, { user: { email: "a@example.com" } });
    expect(html).toContain('<form class="social-hide" method="post" action="/social/7/hide">');
    expect(html).toContain("Hide");
  });
});
