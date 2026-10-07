import { expect, inject, it } from "vitest";

// Live-HTTP checks for the /social feed (ADR 0003, step 1). A fresh app has
// no posts until a connector runs, so card rendering is covered separately
// in spec/social-card.test.ts.
const baseUrl = inject("baseUrl");

it("/social renders with the platform filter form", async () => {
  const res = await fetch(new URL("/social", baseUrl));
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('action="/social"');
  expect(html).toContain('name="platform"');
  expect(html).toContain("All platforms");
});

it("an unknown platform filter is ignored rather than an error", async () => {
  const res = await fetch(new URL("/social?platform=nonsense", baseUrl));
  expect(res.status).toBe(200);
});

// --- Paste a post URL on an event page (ADR 0003, Option C). None of these
// reach a real provider: every URL posted here is rejected before any fetch.

function jar() {
  let cookie = "";
  return {
    async fetch(path: string, init: RequestInit = {}) {
      const res = await fetch(new URL(path, baseUrl), {
        ...init,
        redirect: "manual",
        headers: { ...(init.headers ?? {}), cookie },
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      return res;
    },
  };
}

const form = { "content-type": "application/x-www-form-urlencoded" };

async function loggedIn() {
  const session = jar();
  const email = `spec-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const login = await session.fetch("/login", { method: "POST", headers: form, body: `email=${encodeURIComponent(email)}` });
  expect(login.status).toBe(302);
  return session;
}

it("the event page has a From social media section", async () => {
  const res = await fetch(new URL("/events/welcome-mixer", baseUrl));
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain("From social media");
  expect(html).toContain("Log in to add a post");
});

it("an anonymous visitor can't paste a post", async () => {
  const res = await fetch(new URL("/events/welcome-mixer/social", baseUrl), {
    method: "POST",
    headers: form,
    body: `url=${encodeURIComponent("https://youtu.be/dQw4w9WgXcQ")}`,
    redirect: "manual",
  });
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/login");
});

it("an unsupported or unsafe link re-renders the event page with a 400", async () => {
  const session = await loggedIn();
  for (const url of ["http://127.0.0.1/x", "https://example.com/foo", "", "x".repeat(3000)]) {
    const res = await session.fetch("/events/welcome-mixer/social", {
      method: "POST",
      headers: form,
      body: `url=${encodeURIComponent(url)}`,
    });
    expect(res.status, url.slice(0, 40)).toBe(400);
    const html = await res.text();
    expect(html).toContain("That link isn't from a supported platform.");
    expect(html).toContain('action="/events/welcome-mixer/social"');
  }
});

it("pasting to a nonexistent event is a 404", async () => {
  const session = await loggedIn();
  const res = await session.fetch("/events/no-such-event-xyz/social", {
    method: "POST",
    headers: form,
    body: `url=${encodeURIComponent("https://example.com/foo")}`,
  });
  expect(res.status).toBe(404);
});

it("an anonymous visitor can't hide a post", async () => {
  const res = await fetch(new URL("/social/1/hide", baseUrl), {
    method: "POST",
    redirect: "manual",
  });
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/login");
});
