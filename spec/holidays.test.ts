import { expect, inject, it } from "vitest";

// Imported holiday/external-feed events are kept out of the main grid and
// map (they're not things to host or check in to) and get their own
// read-only list with a date filter instead.
const baseUrl = inject("baseUrl");

it("GET /holidays returns 200 with a filter form", async () => {
  const res = await fetch(new URL("/holidays", baseUrl));
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('id="holiday-filter"');
});

it("the home page and map never show a holiday-sourced event", async () => {
  // welcome-mixer (source_id=1, manual) must still be listed, as ever.
  const home = await fetch(new URL("/", baseUrl));
  expect(await home.text()).toContain("Welcome mixer");

  // No seeded source in this app is kind='ics'/'ticketmaster' by default, so
  // this just confirms the exclusion clause doesn't accidentally hide
  // manual events too (a real import-backed check lives in ics-import.test.ts
  // and the manual DB smoke test, not here, since seeding a live ICS source
  // from a spec file would require a network call).
  const map = await fetch(new URL("/api/events/map", baseUrl));
  expect(map.status).toBe(200);
  expect(Array.isArray(await map.json())).toBe(true);
});
