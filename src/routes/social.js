// Social pages and actions: discover, my events, saved, map, communities,
// messages, notifications, tickets, announcements, activity, plus the maybe,
// chat and announcement posts. req.user comes from the onRequest hook in
// server.js. Saved events, follows, read notifications, reactions and poll
// votes live in the browser (localStorage), so they have no routes here.
import { readFileSync } from "node:fs";
import { CATEGORIES, getEvent, findUserByUsername } from "../db.js";
import {
  listSocialEvents,
  filterEvents,
  eventAttendees,
  publicUser,
  communities,
  community,
  myEvents,
  dmThreadsFor,
  notificationsFor,
  ticketsFor,
  allAnnouncements,
  activityFeed,
  isMaybe,
  setMaybe,
  postChat,
  postAnnouncement,
  getAnnouncement,
  togglePin,
  canManageEvent,
  CHAT_MAX,
} from "../social-db.js";
import { notFoundPage, forbiddenPage } from "../views.js";
import {
  discoverPage,
  myEventsPage,
  savedPage,
  mapPage,
  communitiesPage,
  communityPage,
  messagesPage,
  notificationsPage,
  ticketsPage,
  announcementsPage,
  activityPage,
  formErrorPage,
} from "../social-views.js";
import { html, field, backTo, wantsJson } from "./util.js";

const EVENT_NOT_FOUND = "There's no event at that address. It may have been removed.";
const COMMUNITY_NOT_FOUND = "There's no community at that address.";
const TITLE_MAX = 120;
const BODY_MAX = 2000;

// Pages that need an account send anonymous visitors to log in first, then
// back here. The path is a fixed string per route, not taken from the request.
function requireLogin(req, reply, path) {
  if (req.user) return true;
  reply.redirect(`/login?next=${encodeURIComponent(path)}`);
  return false;
}

// Same idea for form/JSON posts: JSON callers get a 401 they can handle,
// form posts are sent to log in and come back to `back`.
function requireLoginPost(req, reply, back) {
  if (req.user) return true;
  if (wantsJson(req)) reply.code(401).send({ error: "Log in first." });
  else reply.redirect(`/login?next=${encodeURIComponent(back)}`);
  return false;
}

function fail(req, reply, code, text, back) {
  if (wantsJson(req)) return reply.code(code).send({ error: text });
  html(reply, code, formErrorPage({ user: req.user, text, back }));
}

function queryString(req, key) {
  const v = req.query?.[key];
  return typeof v === "string" ? v.trim() : "";
}

// Up to three people (going first, then maybe) for each event card.
function withFaces(events) {
  return events.map((e) => {
    const { going, maybe } = eventAttendees(e.slug);
    return { ...e, faces: [...going, ...maybe].slice(0, 3) };
  });
}

const WITHIN_KM = ["5", "10", "25"];
const UNDER_PRICE_CENTS = 2000;

// Discover filters beyond what filterEvents() knows: a single date, a
// distance limit, "under $20" (free counts) and "friends going". Values are
// checked here so the view only ever sees known ones.
function discoverFilters(req) {
  const date = queryString(req, "date");
  const within = queryString(req, "within");
  const price = queryString(req, "price");
  const sort = queryString(req, "sort");
  return {
    q: queryString(req, "q").slice(0, 100),
    category: CATEGORIES.includes(queryString(req, "category")) ? queryString(req, "category") : "",
    when: ["today", "weekend", "week", "month"].includes(queryString(req, "when")) ? queryString(req, "when") : "",
    price: ["free", "paid", "under20"].includes(price) ? price : "",
    sort: ["popular", "rating", "distance"].includes(sort) ? sort : "",
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    within: WITHIN_KM.includes(within) ? within : "",
    friends: queryString(req, "friends") === "1" ? "1" : "",
  };
}

function applyDiscoverFilters(all, f) {
  let out = filterEvents(all, { q: f.q, category: f.category, when: f.when, price: f.price === "under20" ? "" : f.price, sort: f.sort });
  if (f.price === "under20") out = out.filter((e) => (e.price_cents ?? 0) < UNDER_PRICE_CENTS);
  if (f.date) out = out.filter((e) => e.event_date === f.date);
  if (f.within) out = out.filter((e) => e.distance_km != null && e.distance_km <= Number(f.within));
  if (f.friends) out = out.filter((e) => (Number(e.friends_going) || 0) > 0);
  return out;
}

export default async function socialRoutes(app) {
  app.get("/client.js", async (req, reply) => {
    reply
      .type("application/javascript; charset=utf-8")
      .send(readFileSync(new URL("../client.js", import.meta.url), "utf8"));
  });

  // Page-specific browser code (discover filters, map, saved, communities,
  // activity, notifications, messages). Only loaded by pages that need it.
  app.get("/pages.js", async (req, reply) => {
    reply
      .type("application/javascript; charset=utf-8")
      .send(readFileSync(new URL("../pages.js", import.meta.url), "utf8"));
  });

  // Real maps (MapLibre + OpenFreeMap) for the event page and /map.
  app.get("/maps.js", async (req, reply) => {
    reply
      .type("application/javascript; charset=utf-8")
      .send(readFileSync(new URL("../maps.js", import.meta.url), "utf8"));
  });

  // Filters run here so the page works without JS. Every upcoming event is
  // also sent (non-matching ones hidden) so pages.js can filter instantly.
  app.get("/discover", async (req, reply) => {
    const filters = discoverFilters(req);
    const upcoming = listSocialEvents().filter((e) => !e.is_past);
    const inWeek = new Set(filterEvents(upcoming, { when: "week" }).map((e) => e.slug));
    const inMonth = new Set(filterEvents(upcoming, { when: "month" }).map((e) => e.slug));
    const all = withFaces(upcoming).map((e) => ({ ...e, in_week: inWeek.has(e.slug), in_month: inMonth.has(e.slug) }));
    html(
      reply,
      200,
      discoverPage({
        user: req.user,
        events: applyDiscoverFilters(all, filters),
        all,
        filters,
        categories: CATEGORIES,
        communities: communities(),
      }),
    );
  });

  app.get("/my-events", async (req, reply) => {
    if (!requireLogin(req, reply, "/my-events")) return;
    const mine = myEvents(req.user);
    html(
      reply,
      200,
      myEventsPage({ user: req.user, going: withFaces(mine.going), maybe: withFaces(mine.maybe), hosted: withFaces(mine.hosted) }),
    );
  });

  // Which events are saved is only known in the browser, so every upcoming
  // event is rendered and client.js hides the unsaved ones.
  app.get("/saved", async (req, reply) => {
    html(reply, 200, savedPage({ user: req.user, events: withFaces(listSocialEvents().filter((e) => !e.is_past)) }));
  });

  app.get("/map", async (req, reply) => {
    const events = listSocialEvents().filter((e) => !e.is_past);
    html(reply, 200, mapPage({ user: req.user, events }));
  });

  app.get("/communities", async (req, reply) => {
    html(reply, 200, communitiesPage({ user: req.user, communities: communities() }));
  });

  app.get("/communities/:slug", async (req, reply) => {
    const c = community(req.params.slug, req.user?.token ?? null);
    if (!c) return html(reply, 404, notFoundPage({ user: req.user, text: COMMUNITY_NOT_FOUND }));
    html(reply, 200, communityPage({ user: req.user, community: { ...c, events: withFaces(c.events) } }));
  });

  app.get("/messages", async (req, reply) => {
    if (!requireLogin(req, reply, "/messages")) return;
    // ?to=<username> opens or starts a thread with that person. Only the
    // publicUser() shape reaches the view; unknown names and yourself are ignored.
    const toName = queryString(req, "to");
    const row = toName ? findUserByUsername(toName) : null;
    const to = row && row.token !== req.user.token ? publicUser(row) : null;
    html(
      reply,
      200,
      messagesPage({ user: req.user, threads: dmThreadsFor(req.user), to, active: queryString(req, "thread").slice(0, 80) }),
    );
  });

  app.get("/notifications", async (req, reply) => {
    if (!requireLogin(req, reply, "/notifications")) return;
    html(reply, 200, notificationsPage({ user: req.user, notifications: notificationsFor(req.user) }));
  });

  app.get("/tickets", async (req, reply) => {
    if (!requireLogin(req, reply, "/tickets")) return;
    html(reply, 200, ticketsPage({ user: req.user, tickets: ticketsFor(req.user) }));
  });

  app.get("/announcements", async (req, reply) => {
    html(
      reply,
      200,
      announcementsPage({
        user: req.user,
        // can_manage decides whether the Pin button shows. The pin route
        // checks the same rule again on every post.
        announcements: allAnnouncements().map((a) => ({
          ...a,
          can_manage: a.event ? canManageEvent(req.user, a.event) : req.user?.role === "admin",
        })),
        canPostGlobal: req.user?.role === "admin",
      }),
    );
  });

  app.get("/activity", async (req, reply) => {
    html(reply, 200, activityPage({ user: req.user, items: activityFeed(40) }));
  });

  /* ---- Actions ---- */

  // Toggles "maybe" for the logged-in user. JSON: {maybe: boolean}.
  app.post("/events/:slug/maybe", async (req, reply) => {
    const event = getEvent(req.params.slug);
    if (!event) {
      if (wantsJson(req)) return reply.code(404).send({ error: EVENT_NOT_FOUND });
      return html(reply, 404, notFoundPage({ user: req.user, text: EVENT_NOT_FOUND }));
    }
    const eventPath = `/events/${event.slug}`;
    if (!requireLoginPost(req, reply, eventPath)) return;
    const on = !isMaybe(event.slug, req.user.token);
    setMaybe(event.slug, req.user.token, on);
    if (wantsJson(req)) return reply.send({ maybe: on });
    reply.redirect(backTo(req, eventPath));
  });

  // Shared by event and community chat. Body fields: body (required,
  // 1..CHAT_MAX characters), kind ('text' | 'question'), reply_to (message id).
  function chatHandler(room, back, req, reply) {
    if (!requireLoginPost(req, reply, back)) return;
    const body = field(req.body, "body");
    if (!body) return fail(req, reply, 400, "Write a message first.", back);
    if (body.length > CHAT_MAX) return fail(req, reply, 400, `Keep messages to ${CHAT_MAX} characters or fewer.`, back);
    const message = postChat(room, req.user.token, body, {
      kind: field(req.body, "kind") || "text",
      reply_to: field(req.body, "reply_to") || null,
    });
    if (wantsJson(req)) return reply.code(201).send(message);
    reply.redirect(`${back}#chat`);
  }

  app.post("/events/:slug/chat", async (req, reply) => {
    const event = getEvent(req.params.slug);
    if (!event) return fail(req, reply, 404, EVENT_NOT_FOUND, "/discover");
    chatHandler(`event:${event.slug}`, `/events/${event.slug}`, req, reply);
  });

  app.post("/communities/:slug/chat", async (req, reply) => {
    const c = community(req.params.slug);
    if (!c) return fail(req, reply, 404, COMMUNITY_NOT_FOUND, "/communities");
    chatHandler(`community:${c.slug}`, `/communities/${c.slug}`, req, reply);
  });

  // Title 1..TITLE_MAX, body 0..BODY_MAX, pinned "1"/"on" for pinned.
  // Returns the values, or null after sending the error response.
  function readAnnouncement(req, reply, back) {
    const title = field(req.body, "title");
    const body = field(req.body, "body");
    let problem = "";
    if (!title) problem = "Give the announcement a title.";
    else if (title.length > TITLE_MAX) problem = `Keep the title to ${TITLE_MAX} characters or fewer.`;
    else if (body.length > BODY_MAX) problem = `Keep the message to ${BODY_MAX} characters or fewer.`;
    if (problem) {
      fail(req, reply, 400, problem, back);
      return null;
    }
    const pinned = ["1", "on", "true"].includes(field(req.body, "pinned"));
    return { title, body, pinned };
  }

  app.post("/events/:slug/announcements", async (req, reply) => {
    const event = getEvent(req.params.slug);
    if (!event) return fail(req, reply, 404, EVENT_NOT_FOUND, "/discover");
    const back = `/events/${event.slug}`;
    if (!requireLoginPost(req, reply, back)) return;
    if (!canManageEvent(req.user, event)) {
      if (wantsJson(req)) return reply.code(403).send({ error: "Only the host or an admin can post here." });
      return html(reply, 403, forbiddenPage({ user: req.user }));
    }
    const values = readAnnouncement(req, reply, back);
    if (!values) return;
    const announcement = postAnnouncement({ event_slug: event.slug, token: req.user.token, ...values });
    if (wantsJson(req)) return reply.code(201).send(announcement);
    reply.redirect(backTo(req, back));
  });

  // Global announcement, admins only.
  app.post("/announcements", async (req, reply) => {
    if (!requireLoginPost(req, reply, "/announcements")) return;
    if (req.user.role !== "admin") {
      if (wantsJson(req)) return reply.code(403).send({ error: "Admins only." });
      return html(reply, 403, forbiddenPage({ user: req.user }));
    }
    const values = readAnnouncement(req, reply, "/announcements");
    if (!values) return;
    const announcement = postAnnouncement({ event_slug: null, token: req.user.token, ...values });
    if (wantsJson(req)) return reply.code(201).send(announcement);
    reply.redirect(backTo(req, "/announcements"));
  });

  // Toggle pinned. The event's host or an admin; global ones admin only.
  // JSON: {id, pinned}.
  app.post("/announcements/:id/pin", async (req, reply) => {
    const id = Number(req.params.id);
    const ann = Number.isInteger(id) && id > 0 ? getAnnouncement(id) : null;
    if (!ann) return fail(req, reply, 404, "There's no announcement with that id.", "/announcements");
    const back = ann.event_slug ? `/events/${ann.event_slug}` : "/announcements";
    if (!requireLoginPost(req, reply, back)) return;
    const allowed = ann.event_slug ? canManageEvent(req.user, { slug: ann.event_slug }) : req.user.role === "admin";
    if (!allowed) {
      if (wantsJson(req)) return reply.code(403).send({ error: "Only the host or an admin can pin this." });
      return html(reply, 403, forbiddenPage({ user: req.user }));
    }
    const pinned = togglePin(id);
    if (wantsJson(req)) return reply.send({ id, pinned });
    reply.redirect(backTo(req, back));
  });
}
