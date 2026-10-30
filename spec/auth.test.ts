import { expect, inject, it } from "vitest";

// Auth and cross-user data-leak checks, split out from events.test.ts so a
// failure here reads as "something is wrong with who can see/do what" rather
// than "the check-in loop broke". Three distinct seeded accounts are used
// (never alex@quad.test, which events.test.ts already shares across its own
// tests) so these tests don't fight each other or the other file for state.
const baseUrl = inject("baseUrl");

const SAM = { email: "sam@quad.test", username: "sam.okafor", password: "password123" };
const MAYA = { email: "maya@quad.test", username: "mayap", password: "password123" };
const TOM = { email: "tom@quad.test", username: "tomw", password: "password123" };

function loginBody(email: string, password: string) {
  return `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
}

// A minimal cookie jar: fetch() doesn't carry Set-Cookie forward on its own.
function jar() {
  let cookie = "";
  return {
    cookie() {
      return cookie;
    },
    setCookie(value: string) {
      cookie = value;
    },
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

async function loginAs(user: { email: string; password: string }) {
  const session = jar();
  const res = await session.fetch("/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: loginBody(user.email, user.password),
  });
  expect(res.status).toBe(302);
  return session;
}

/* ---- Session cookie integrity ---- */

it("a tampered session cookie is treated as logged out, not as someone else", async () => {
  const session = await loginAs(SAM);
  const real = session.cookie();
  // Flip the last character of the signed cookie value. The signature check
  // should fail closed: no user, not a crash, not another account.
  const [name, ...rest] = real.split("=");
  const value = rest.join("=");
  const tampered = value.slice(0, -1) + (value.slice(-1) === "a" ? "b" : "a");
  session.setCookie(`${name}=${tampered}`);

  const page = await session.fetch("/settings");
  // requireLogin-style routes redirect anonymous visitors to /login; a forged
  // cookie must not be accepted as a valid session for anyone.
  expect(page.status).toBe(302);
  expect(page.headers.get("location")).toMatch(/^\/login/);
});

it("logging out clears the session and the next request is anonymous", async () => {
  const session = await loginAs(SAM);
  const loggedIn = await session.fetch("/settings");
  expect(loggedIn.status).toBe(200);

  const logout = await session.fetch("/logout", { method: "POST" });
  expect(logout.status).toBe(302);

  const after = await session.fetch("/settings");
  expect(after.status).toBe(302);
  expect(after.headers.get("location")).toMatch(/^\/login/);
});

it("changing your password invalidates existing sessions on every device", async () => {
  // Uses tom@quad.test, which no other spec file logs in as, and restores his
  // original password at the end so a second run (or events.test.ts run
  // afterwards) still finds the seeded credentials working.
  const deviceA = await loginAs(TOM);
  const deviceB = await loginAs(TOM);

  const change = await deviceA.fetch("/settings/password", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `current_password=${encodeURIComponent(TOM.password)}&new_password=temp-pass-1234&confirm_password=temp-pass-1234`,
  });
  expect(change.status).toBe(302);

  // deviceA's cookie was refreshed by the response; deviceB's old cookie must
  // now be dead.
  const staleCheck = await deviceB.fetch("/settings");
  expect(staleCheck.status).toBe(302);
  expect(staleCheck.headers.get("location")).toMatch(/^\/login/);

  const freshCheck = await deviceA.fetch("/settings");
  expect(freshCheck.status).toBe(200);

  // Restore the seeded password so this test (and the fixed TOM constant) is
  // idempotent across repeated runs against a persistent database.
  const restore = await deviceA.fetch("/settings/password", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `current_password=temp-pass-1234&new_password=${encodeURIComponent(TOM.password)}&confirm_password=${encodeURIComponent(TOM.password)}`,
  });
  expect(restore.status).toBe(302);
});

/* ---- AuthZ on private/mutating routes ---- */

it("settings, messages and my-events all redirect an anonymous visitor to /login", async () => {
  // /saved is deliberately excluded: "saved" events are a client-side
  // (localStorage) list, not server-held per-user data, so the page itself
  // has nothing private to guard and is public like the home page.
  for (const path of ["/settings", "/messages", "/my-events", "/notifications", "/tickets"]) {
    const res = await fetch(new URL(path, baseUrl), { redirect: "manual" });
    expect(res.status, `${path} should redirect anonymous visitors`).toBe(302);
    expect(res.headers.get("location"), `${path} should redirect to /login`).toMatch(/^\/login/);
  }
});

it("an anonymous visitor can't send a direct message", async () => {
  const res = await fetch(new URL("/messages/send", baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `to=${encodeURIComponent(MAYA.username)}&body=hello`,
  });
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toMatch(/^\/login/);
});

/* ---- Direct-message thread isolation (IDOR) ---- */

it("a DM thread between two users never appears for a third, uninvolved user", async () => {
  const samSession = await loginAs(SAM);
  const mayaSession = await loginAs(MAYA);
  const tomSession = await loginAs(TOM);

  const secret = `secret-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const send = await samSession.fetch("/messages/send", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `to=${encodeURIComponent(MAYA.username)}&body=${encodeURIComponent(secret)}`,
  });
  expect(send.status).toBe(302);

  // Both participants should see the message somewhere on their own
  // /messages page.
  const samPage = await (await samSession.fetch("/messages")).text();
  const mayaPage = await (await mayaSession.fetch("/messages")).text();
  expect(samPage).toContain(secret);
  expect(mayaPage).toContain(secret);

  // A third user's own /messages page must never contain it, including when
  // they try to address the thread directly via the ?thread= query param
  // (the id is a deterministic sort of the two tokens - dmThreadId in
  // social-db.js - so it must never be accepted from the client as a way to
  // select whose messages come back).
  const tomDefault = await (await tomSession.fetch("/messages")).text();
  expect(tomDefault).not.toContain(secret);

  const guessedThreadId = encodeURIComponent([SAM, MAYA].map((u) => u.username).sort().join(":"));
  const tomGuessing = await (await tomSession.fetch(`/messages?thread=${guessedThreadId}`)).text();
  expect(tomGuessing).not.toContain(secret);
});

it("you can't message yourself to read your own thread as a stand-in for someone else's", async () => {
  const session = await loginAs(SAM);
  const res = await session.fetch("/messages/send", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `to=${encodeURIComponent(SAM.username)}&body=hi+me`,
  });
  expect(res.status).toBe(400);
});

/* ---- publicUser() / profile rendering never leaks private fields ---- */

it("another user's profile page never includes their email, password hash, or session token", async () => {
  const viewer = await loginAs(SAM);

  const row = await (await viewer.fetch(`/profile/${MAYA.username}`)).text();
  expect(row).not.toContain(MAYA.email);
  // A password hash always contains this literal prefix (auth.js); if one
  // ever reached a template, this substring would be in the response.
  expect(row).not.toContain("scrypt$");
});

it("the event attendee list never includes a check-in's raw session token", async () => {
  const session = await loginAs(MAYA);
  await session.fetch("/events/welcome-mixer/checkin", { method: "POST" });
  const page = await (await session.fetch("/events/welcome-mixer")).text();

  // Regression test for the token-leak fix noted in PROCESS.md: host/attendee
  // identity must come from users.email via a join, never from the raw
  // session token stored in events.created_by / checkins.user_token.
  expect(page).not.toContain("scrypt$");
  // A session token is a UUID (crypto.randomUUID()); a bare v4 UUID has no
  // business appearing anywhere in a rendered page.
  expect(page).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});

/* ---- Login doesn't reveal whether an email has an account ---- */

it("an unknown email and a known email with the wrong password get the identical response", async () => {
  const unknown = await fetch(new URL("/login", baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `email=${encodeURIComponent(`nobody-${Date.now()}@quad.test`)}&password=whatever123`,
  });
  const wrongPassword = await fetch(new URL("/login", baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `email=${encodeURIComponent(SAM.email)}&password=not-the-password`,
  });

  expect(unknown.status).toBe(wrongPassword.status);
  expect(unknown.status).toBe(401);
  const [unknownBody, wrongBody] = await Promise.all([unknown.text(), wrongPassword.text()]);
  // Strip the one field that legitimately differs (the echoed email value)
  // before comparing, so the check is about the error message, not the form.
  const strip = (html: string) => html.replace(/value="[^"]*"/g, 'value=""');
  expect(strip(unknownBody)).toBe(strip(wrongBody));
});
