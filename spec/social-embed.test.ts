import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

// Rendering of pasted oEmbed posts (ADR 0003, Option C) and the event page's
// "From social media" section. views.js has no DB import, so it loads directly.
// @ts-expect-error src/ is plain JS with no declaration files
import { socialCard, socialEmbedCard, socialPage, eventPage } from "../src/views.js";

const hostileHtml = '<blockquote class="x">"quoted" & \'single\'</blockquote><script>parent.document.cookie</script>';

const embedPost = {
  id: 11,
  platform: "x",
  external_id: "https://x.com/jack/status/20",
  permalink: "https://x.com/jack/status/20",
  author_name: "jack",
  author_url: "https://x.com/jack",
  text: "should not show",
  media_url: "https://pbs.twimg.com/a.jpg",
  media_type: "image",
  embed_html: hostileHtml,
};

const linkOnly = {
  id: 12,
  platform: "instagram",
  external_id: "https://instagram.com/p/ABC",
  permalink: "https://instagram.com/p/ABC",
};

const event = { slug: "welcome-mixer", title: "Welcome mixer", event_date: "2026-10-10", location: "Union Court", price_cents: 0 };

function iframeOf(html: string) {
  const doc = new JSDOM(html).window.document;
  return doc.querySelector("iframe");
}

describe("socialEmbedCard", () => {
  it("renders a sandboxed iframe without allow-same-origin, keeping badge, author and View on", () => {
    const html = socialEmbedCard(embedPost, { user: { email: "a@example.com" } });
    const frame = iframeOf(html);
    expect(frame).toBeTruthy();
    const sandbox = frame!.getAttribute("sandbox")!;
    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");
    expect(frame!.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame!.getAttribute("loading")).toBe("lazy");
    expect(frame!.classList.contains("social-embed")).toBe(true);
    expect(html).toContain('<span class="platform-badge">X</span>');
    expect(html).toContain('href="https://x.com/jack"');
    expect(html).toContain("View on X");
    expect(html).toContain("/social/11/hide");
    // the embed replaces the text/media body
    expect(html).not.toContain("should not show");
    expect(html).not.toContain("<img");
  });

  it("attribute-escapes srcdoc so provider html can't break out", () => {
    const html = socialEmbedCard(embedPost, { user: null });
    // nothing from the provider html appears raw in the outer page
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('"quoted"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;quoted&quot;");
    // a real parser sees exactly one iframe, whose srcdoc round-trips to the full doc
    const doc = new JSDOM(html).window.document;
    expect(doc.querySelectorAll("iframe")).toHaveLength(1);
    expect(doc.querySelectorAll("script")).toHaveLength(0);
    const srcdoc = doc.querySelector("iframe")!.getAttribute("srcdoc")!;
    expect(srcdoc.startsWith("<!doctype html><meta charset=utf-8><base target=_blank>")).toBe(true);
    expect(srcdoc.endsWith(hostileHtml)).toBe(true);
  });

  it("gives YouTube the 16:9 video frame", () => {
    const frame = iframeOf(
      socialEmbedCard({ ...embedPost, platform: "youtube", embed_html: '<iframe src="https://www.youtube.com/embed/x"></iframe>' }),
    );
    expect(frame!.classList.contains("social-embed--video")).toBe(true);
  });

  it("renders a link-only post as a normal card", () => {
    const html = socialEmbedCard(linkOnly, { user: null });
    expect(html).toBe(socialCard(linkOnly, { user: null }));
    expect(html).not.toContain("<iframe");
    expect(html).toContain("View on Instagram");
  });

  it("socialCard and the /social feed never render embed_html", () => {
    expect(socialCard(embedPost, { user: null })).not.toContain("<iframe");
    const page = socialPage({ user: null, posts: [embedPost], platform: undefined, platforms: ["x"] });
    expect(page).not.toContain("<iframe");
    expect(page).not.toContain("srcdoc");
    expect(page).not.toContain("twitter-tweet");
  });
});

describe("eventPage social section", () => {
  it("still renders without socialPosts/error (back-compat), with a login prompt when logged out", () => {
    const html = eventPage({ user: null, event, attendees: [], checkedIn: false });
    expect(html).toContain("From social media");
    expect(html).toContain("Log in to add a post");
    expect(html).not.toContain('action="/events/welcome-mixer/social"');
    expect(html).not.toContain("undefined");
  });

  it("shows the paste form to a logged-in user, plus posts and an error when given", () => {
    const html = eventPage({
      user: { email: "a@example.com" },
      event,
      attendees: [],
      checkedIn: false,
      socialPosts: [embedPost, linkOnly],
      error: "That link isn't from a supported platform.",
    });
    const doc = new JSDOM(html).window.document;
    const form = doc.querySelector('form[action="/events/welcome-mixer/social"]');
    expect(form).toBeTruthy();
    expect(form!.getAttribute("method")).toBe("post");
    const input = form!.querySelector('input[name="url"]')!;
    expect(input.getAttribute("type")).toBe("url");
    expect(input.hasAttribute("required")).toBe(true);
    expect(doc.querySelector(".event-social .error")?.textContent).toBe("That link isn't from a supported platform.");
    expect(doc.querySelectorAll(".event-social iframe.social-embed")).toHaveLength(1);
    expect(doc.querySelectorAll(".event-social .social-card")).toHaveLength(2);
    expect(html).not.toContain("Log in to add a post");
  });
});
