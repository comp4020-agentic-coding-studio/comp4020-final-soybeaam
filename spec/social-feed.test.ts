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

it("an anonymous visitor can't hide a post", async () => {
  const res = await fetch(new URL("/social/1/hide", baseUrl), {
    method: "POST",
    redirect: "manual",
  });
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/login");
});
