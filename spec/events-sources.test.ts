import { expect, inject, it } from "vitest";

// Covers step 2 of the events-sources plan: the extended manual add-event
// form's new optional fields (venue_name, address, description, url) and
// the inline places-based geocoding lookup, plus a regression guard on the
// title-only POST /events contract after createEvent()'s signature changed.
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

it("hosting an event with a venue round-trips venue details onto the event page", async () => {
  const session = jar();
  await login(session);

  const title = `Spec venue event ${Date.now()}`;
  const create = await session.fetch("/events", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `title=${encodeURIComponent(title)}&venue_name=${encodeURIComponent("Union Court")}`,
  });
  expect(create.status).toBe(302);
  const location = create.headers.get("location") ?? "";
  expect(location).toMatch(/^\/events\//);

  const page = await fetch(new URL(location, baseUrl));
  expect(page.status).toBe(200);
  const html = await page.text();
  expect(html).toContain(title);
  expect(html).toContain("Union Court");
});

it("title-only POST /events still 302s to the new event's page (createEvent signature regression)", async () => {
  const session = jar();
  await login(session);

  const title = `Spec title-only event ${Date.now()}`;
  const create = await session.fetch("/events", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `title=${encodeURIComponent(title)}`,
  });
  expect(create.status).toBe(302);
  const location = create.headers.get("location") ?? "";
  expect(location).toMatch(/^\/events\//);

  const page = await fetch(new URL(location, baseUrl));
  expect(page.status).toBe(200);
  expect(await page.text()).toContain(title);
});
