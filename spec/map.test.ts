import { expect, inject, it } from "vitest";

// Covers step 3 of the events-sources/map plan: the /map page, the
// /api/events/map JSON feed, and that a manually-hosted event with a known
// venue (geocoded in step 2) shows up on the map with coordinates.
const baseUrl = inject("baseUrl");

function uniqueEmail(): string {
  return `spec-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

// A minimal cookie jar: fetch() doesn't carry Set-Cookie forward on its own.
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

async function login(session: ReturnType<typeof jar>) {
  const email = uniqueEmail();
  const res = await session.fetch("/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `email=${encodeURIComponent(email)}`,
  });
  expect(res.status).toBe(302);
  return email;
}

it("GET /map renders the map container", async () => {
  const res = await fetch(new URL("/map", baseUrl));
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('id="map"');
});

it("GET /api/events/map returns a JSON array", async () => {
  const res = await fetch(new URL("/api/events/map", baseUrl));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

it("a newly hosted event with a known venue appears on the map with coordinates", async () => {
  const session = jar();
  await login(session);

  const title = `Spec map event ${Date.now()}`;
  const create = await session.fetch("/events", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `title=${encodeURIComponent(title)}&venue_name=${encodeURIComponent("Union Court")}`,
  });
  expect(create.status).toBe(302);
  const location = create.headers.get("location") ?? "";
  const slug = location.replace(/^\/events\//, "");

  const res = await fetch(new URL("/api/events/map", baseUrl));
  expect(res.status).toBe(200);
  const events = (await res.json()) as Array<{ slug: string; lat: number; lng: number }>;
  const mine = events.find((e) => e.slug === slug);
  expect(mine).toBeTruthy();
  expect(typeof mine?.lat).toBe("number");
  expect(typeof mine?.lng).toBe("number");
  // Robust against the exact seeded places values changing: just check we're
  // in the Canberra area, not asserting exact equality against the seed.
  expect(mine!.lat).toBeGreaterThan(-36);
  expect(mine!.lat).toBeLessThan(-35);
  expect(mine!.lng).toBeGreaterThan(148);
  expect(mine!.lng).toBeLessThan(150);
});
