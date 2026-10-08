import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyFormbody from "@fastify/formbody";
import { readFileSync } from "node:fs";
import {
  findUserByEmail,
  userByToken,
  listEvents,
  getEvent,
  createEvent,
  checkIn,
  hasCheckedIn,
  attendees,
  CATEGORIES,
  stats,
} from "./db.js";
import { renderMarkdown } from "./markdown.js";
import { verifyPassword } from "./auth.js";
import { homePage, loginPage, newEventPage, payPage, readmePage, notFoundPage } from "./views.js";
import { eventPage } from "./event-views.js";
import {
  getEventFull,
  isMaybe,
  eventAttendees,
  chatFor,
  announcementsFor,
  canManageEvent,
  peopleToMeet,
  relatedEvents,
} from "./social-db.js";
import adminRoutes from "./routes/admin.js";
import accountRoutes from "./routes/account.js";
import socialRoutes from "./routes/social.js";
import { safeNext } from "./routes/util.js";

const app = Fastify({ logger: true });

// Cookie identity only, deliberately — see PROCESS.md for the trade-off this
// makes against real accounts/auth. SESSION_SECRET should be set in
// production; a dev fallback keeps `pnpm check` working without extra setup.
const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";

await app.register(fastifyCookie, { secret: SESSION_SECRET });
await app.register(fastifyFormbody);

app.addHook("onRequest", async (req) => {
  const token = req.cookies.session && req.unsignCookie(req.cookies.session);
  req.user = token?.valid ? userByToken(token.value) ?? null : null;
});

await app.register(adminRoutes);
await app.register(accountRoutes);
await app.register(socialRoutes);

app.get("/healthz", async () => "ok");

const EVENT_NOT_FOUND = "There's no event at that address. It may have been removed.";

// Today's date as YYYY-MM-DD in the server's local time zone (not UTC), so an
// event on today's date still counts as upcoming in the evening.
function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Events for the home carousel: the next dated events from today, soonest
// first. event_date is free text, so only strict YYYY-MM-DD values count.
// If nothing is upcoming (for example once the seed dates have passed) the
// carousel shows the most recently added events instead.
function featuredEvents(limit = 8) {
  const today = localToday();
  const upcoming = listEvents({ sort: "soonest" }).filter(
    (e) => /^\d{4}-\d{2}-\d{2}$/.test(e.event_date ?? "") && e.event_date >= today,
  );
  if (upcoming.length) return { heading: "Coming up", events: upcoming.slice(0, limit) };
  return { heading: "Recently added", events: listEvents({ sort: "latest" }).slice(0, limit) };
}

app.get("/", async (req, reply) => {
  const sort = typeof req.query.sort === "string" ? req.query.sort : undefined;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const featured = featuredEvents();
  reply.type("text/html").send(
    homePage({
      user: req.user,
      events: listEvents({ sort, category }),
      sort,
      category,
      categories: CATEGORIES,
      stats: stats(),
      featured: featured.events,
      featuredHeading: featured.heading,
      // homePage maps this to a fixed message and ignores unknown values.
      flash: typeof req.query.flash === "string" ? req.query.flash : "",
    }),
  );
});

app.get("/login", async (req, reply) => {
  const next = safeNext(req.query.next);
  if (req.user) {
    reply.redirect(next || "/");
    return;
  }
  reply.type("text/html").send(loginPage({ next }));
});

app.post("/login", async (req, reply) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const next = safeNext(req.body?.next);
  if (!email || !email.includes("@")) {
    reply
      .code(400)
      .type("text/html")
      .send(loginPage({ error: "Enter a valid email.", field: "email", email, next }));
    return;
  }
  // Unknown email, missing password, wrong password and accounts with no
  // password set all get the same message, so the form doesn't reveal which
  // emails have accounts.
  const user = findUserByEmail(email);
  if (!user || !password || !verifyPassword(password, user.password_hash)) {
    reply
      .code(401)
      .type("text/html")
      .send(loginPage({ error: "Email or password is incorrect.", field: "password", email, next }));
    return;
  }
  // The session is still the signed users.token cookie (docs/decisions/0001).
  reply.setCookie("session", user.token, { path: "/", httpOnly: true, signed: true, sameSite: "lax" });
  reply.redirect(next || "/");
});

app.post("/logout", async (req, reply) => {
  reply.clearCookie("session", { path: "/" });
  // A fixed flash key; homePage turns it into a "You're logged out." toast.
  reply.redirect("/?flash=logged-out");
});

app.get("/events/new", async (req, reply) => {
  if (!req.user) {
    reply.redirect("/login");
    return;
  }
  reply.type("text/html").send(newEventPage({ user: req.user, categories: CATEGORIES }));
});

app.post("/events", async (req, reply) => {
  if (!req.user) {
    reply.redirect("/login");
    return;
  }
  const { title, event_date, location, affiliation, category, price } = req.body ?? {};
  if (!title || !String(title).trim()) {
    reply.code(400).type("text/html").send(newEventPage({ user: req.user, categories: CATEGORIES }));
    return;
  }
  const slug = createEvent({
    title,
    event_date,
    location,
    affiliation,
    category,
    price_cents: Math.round((Number(price) || 0) * 100),
    created_by: req.user.token,
  });
  reply.redirect(`/events/${slug}`);
});

app.get("/events/:slug", async (req, reply) => {
  // getEventFull has every legacy column (minus created_by) plus the social
  // fields. eventPage is in event-views.js.
  const event = getEventFull(req.params.slug);
  if (!event) {
    reply.code(404).type("text/html").send(notFoundPage({ user: req.user, text: EVENT_NOT_FOUND }));
    return;
  }
  const token = req.user?.token ?? null;
  const checkedIn = token ? hasCheckedIn(event.slug, token) : false;
  reply.type("text/html").send(
    eventPage({
      user: req.user,
      event,
      // The legacy plain email list; the spec checks it, so it stays as is.
      attendees: attendees(event.slug),
      checkedIn,
      maybe: token ? isMaybe(event.slug, token) : false,
      people: eventAttendees(event.slug),
      chat: chatFor(`event:${event.slug}`, token),
      announcements: announcementsFor(event.slug),
      canManage: canManageEvent(req.user, event),
      peopleToMeet: peopleToMeet(req.user, event.slug),
      related: relatedEvents(event),
    }),
  );
});

app.get("/events/:slug/pay", async (req, reply) => {
  if (!req.user) {
    reply.redirect("/login");
    return;
  }
  const event = getEvent(req.params.slug);
  if (!event) {
    reply.code(404).type("text/html").send(notFoundPage({ user: req.user, text: EVENT_NOT_FOUND }));
    return;
  }
  if (!event.price_cents) {
    // Nothing to pay for — send them straight to the event page rather than
    // show a $0 mock checkout.
    reply.redirect(`/events/${event.slug}`);
    return;
  }
  reply.type("text/html").send(payPage({ user: req.user, event }));
});

app.post("/events/:slug/checkin", async (req, reply) => {
  if (!req.user) {
    reply.redirect("/login");
    return;
  }
  const event = getEvent(req.params.slug);
  if (!event) {
    reply.code(404).type("text/html").send(notFoundPage({ user: req.user, text: EVENT_NOT_FOUND }));
    return;
  }
  checkIn(event.slug, req.user.token);
  reply.redirect(`/events/${event.slug}`);
});

app.get("/readme/", async (req, reply) => {
  const md = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  reply.type("text/html").send(readmePage({ html: renderMarkdown(md), user: req.user }));
});

app.get("/style.css", async (req, reply) => {
  reply.type("text/css").send(readFileSync(new URL("./style.css", import.meta.url), "utf8"));
});

// Any URL no route matches. The root onRequest hook has already run, so the
// page still shows who is logged in.
app.setNotFoundHandler(async (req, reply) => {
  reply.code(404).type("text/html").send(notFoundPage({ user: req.user ?? null }));
});

const port = Number(process.env.PORT ?? 8080);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
