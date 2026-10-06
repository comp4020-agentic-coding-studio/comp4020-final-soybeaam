import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyFormbody from "@fastify/formbody";
import { readFileSync } from "node:fs";
import {
  findOrCreateUser,
  userByToken,
  listEvents,
  getEvent,
  createEvent,
  checkIn,
  hasCheckedIn,
  attendees,
  CATEGORIES,
} from "./db.js";
import { renderMarkdown } from "./markdown.js";
import { homePage, loginPage, newEventPage, eventPage, payPage, readmePage } from "./views.js";

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

app.get("/healthz", async () => "ok");

app.get("/", async (req, reply) => {
  const sort = typeof req.query.sort === "string" ? req.query.sort : undefined;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  reply.type("text/html").send(
    homePage({
      user: req.user,
      events: listEvents({ sort, category }),
      sort,
      category,
      categories: CATEGORIES,
    }),
  );
});

app.get("/login", async (req, reply) => {
  reply.type("text/html").send(loginPage());
});

app.post("/login", async (req, reply) => {
  const email = (req.body?.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    reply.code(400).type("text/html").send(loginPage({ error: "Enter a valid email." }));
    return;
  }
  const user = findOrCreateUser(email);
  reply.setCookie("session", user.token, { path: "/", httpOnly: true, signed: true });
  reply.redirect("/");
});

app.post("/logout", async (req, reply) => {
  reply.clearCookie("session", { path: "/" });
  reply.redirect("/");
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
  const event = getEvent(req.params.slug);
  if (!event) {
    reply.code(404).type("text/html").send("<h1>Not found</h1>");
    return;
  }
  const checkedIn = req.user ? hasCheckedIn(event.slug, req.user.token) : false;
  reply
    .type("text/html")
    .send(eventPage({ user: req.user, event, attendees: attendees(event.slug), checkedIn }));
});

app.get("/events/:slug/pay", async (req, reply) => {
  if (!req.user) {
    reply.redirect("/login");
    return;
  }
  const event = getEvent(req.params.slug);
  if (!event) {
    reply.code(404).type("text/html").send("<h1>Not found</h1>");
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
    reply.code(404).type("text/html").send("<h1>Not found</h1>");
    return;
  }
  checkIn(event.slug, req.user.token);
  reply.redirect(`/events/${event.slug}`);
});

app.get("/readme/", async (req, reply) => {
  const md = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  reply.type("text/html").send(readmePage({ html: renderMarkdown(md) }));
});

app.get("/style.css", async (req, reply) => {
  reply.type("text/css").send(readFileSync(new URL("./style.css", import.meta.url), "utf8"));
});

const port = Number(process.env.PORT ?? 8080);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
