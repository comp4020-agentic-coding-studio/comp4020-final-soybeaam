import { expect, inject, it } from "vitest";

// Our own checks, on top of the two the starter ships (spec/README.md):
// protecting the one core loop this week's crit claims works — a stranger can
// log in, see events, check in, and have that check-in persist on return.
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

it("home page lists the seeded placeholder events", async () => {
  const res = await fetch(new URL("/", baseUrl));
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain("Welcome mixer");
});

it("a stranger can log in, check in to an event, and see it persist on return", async () => {
  const session = jar();
  const email = uniqueEmail();

  const login = await session.fetch("/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `email=${encodeURIComponent(email)}`,
  });
  expect(login.status).toBe(302);

  const checkin = await session.fetch("/events/welcome-mixer/checkin", { method: "POST" });
  expect(checkin.status).toBe(302);

  // "persists on return": a second, independent request with the same
  // session cookie should still see the check-in — not just the redirect
  // response from the action itself.
  const after = await session.fetch("/events/welcome-mixer");
  expect(after.status).toBe(200);
  const html = await after.text();
  expect(html).toContain(email);
  expect(html).toContain("You're checked in");
});

it("checking in twice doesn't duplicate the attendee", async () => {
  const session = jar();
  const email = uniqueEmail();

  await session.fetch("/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `email=${encodeURIComponent(email)}`,
  });
  await session.fetch("/events/welcome-mixer/checkin", { method: "POST" });
  await session.fetch("/events/welcome-mixer/checkin", { method: "POST" });

  const page = await session.fetch("/events/welcome-mixer");
  const html = await page.text();
  // The email also appears once in the nav bar for the logged-in viewer, so
  // check the attendee-list entry specifically rather than any occurrence.
  const occurrences = html.split(`<li>${email}</li>`).length - 1;
  expect(occurrences).toBe(1);
});

it("anyone can host an event once logged in", async () => {
  const session = jar();
  const email = uniqueEmail();
  await session.fetch("/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `email=${encodeURIComponent(email)}`,
  });

  const title = `Spec-created event ${Date.now()}`;
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

it("an anonymous visitor can't check in without logging in first", async () => {
  const res = await fetch(new URL("/events/welcome-mixer/checkin", baseUrl), {
    method: "POST",
    redirect: "manual",
  });
  // Redirected to /login rather than silently accepted or erroring.
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/login");
});

it("seeded dummy events and users carry a DEMO tag, real users don't", async () => {
  const home = await (await fetch(new URL("/", baseUrl))).text();
  expect(home).toMatch(/Welcome mixer<\/a> <span class="demo-tag"[^>]*>DEMO<\/span>/);

  // A real (non-seeded) attendee keeps plain markup; the demo attendee is tagged.
  const session = jar();
  const email = uniqueEmail();
  await session.fetch("/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `email=${encodeURIComponent(email)}`,
  });
  await session.fetch("/events/welcome-mixer/checkin", { method: "POST" });
  const page = await (await session.fetch("/events/welcome-mixer")).text();
  expect(page).toContain(`<li>${email}</li>`);
  expect(page).toMatch(/<li>priya\.demo@quad\.invalid <span class="demo-tag"/);
});
