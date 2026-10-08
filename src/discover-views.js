// Event listing pages: Discover, Saved, My events, Tickets and the Event Map,
// plus the event card they share (socialEventCard).
//
// Events are listSocialEvents() objects. They include host_email from the
// query, so every field that reaches the page is picked one by one here and
// host_email is never read. People are publicUser() objects (no email/token).
import { escape, layout, avatar, pageHeader, emptyState, priceLabel, tabs } from "./views.js";
import { icon } from "./icons.js";
import { avatarStack, dayLabel, timeLabel, hueOf, STATUS, plural } from "./event-views.js";

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

// One colour per category, used for map pins, chips and dots.
const CATEGORY_HUE = {
  Music: 280,
  Technology: 212,
  Social: 28,
  Food: 352,
  Art: 172,
  Sport: 125,
  Party: 318,
  Workshop: 48,
  "Quiz/Trivia": 192,
  Other: 220,
};
const catHue = (c) => CATEGORY_HUE[c] ?? 220;

// "Today", "Tomorrow" or "Sat 10 Oct", then the start time.
function shortWhen(e) {
  const day = e.is_today ? "Today" : dayLabel(e.event_date).replace(/ \d{4}$/, "") || "Date to be confirmed";
  const t = timeLabel(e.start_time);
  return t ? `${day}, ${t}` : day;
}

// The card used on every listing page. The title link stretches over the
// whole card; the Save button sits above it. heading: "h2" or "h3".
export function socialEventCard(e, { heading = "h3" } = {}) {
  const status = STATUS[e.status];
  const price = e.price_cents ?? 0;
  const count = Number(e.attendee_count ?? 0);
  const friends = Number(e.friends_going) || 0;
  const faces = e.faces ?? [];
  const where = e.location
    ? `${escape(e.location)}${e.distance_km != null ? ` <span class="sx-km">${escape(e.distance_km)} km</span>` : ""}`
    : "Location to be confirmed";
  return `<article class="sx-card" style="--hue:${hueOf(e)}">
    <div class="sx-cover">
      ${e.category ? `<span class="sx-cat" style="--cat-hue:${catHue(e.category)}">${escape(e.category)}</span>` : ""}
      <span class="sx-price">${escape(priceLabel(price))}</span>
    </div>
    <div class="sx-body">
      ${status && e.status !== "upcoming" ? `<p class="sx-status"><span class="pill ${status.cls}">${escape(status.label)}</span></p>` : ""}
      <${heading} class="sx-title"><a class="sx-link" href="/events/${escape(e.slug)}">${escape(e.title)}</a></${heading}>
      <p class="sx-meta">${icon("calendar")}<span>${escape(shortWhen(e))}</span></p>
      <p class="sx-meta">${icon("pin")}<span>${where}</span></p>
      <div class="sx-foot">
        ${avatarStack(faces)}
        <span class="sx-going"><strong>${escape(count.toLocaleString("en-AU"))}</strong> going</span>
        ${friends ? `<span class="sx-friends">${icon("users")}${escape(plural(friends, "friend"))}</span>` : ""}
      </div>
    </div>
    <button type="button" class="sx-save js-only" data-save="${escape(e.slug)}" aria-pressed="false" aria-label="Save ${escape(
      e.title,
    )}" title="Save">${icon("saved")}</button>
  </article>`;
}

function cardGrid(events, attrs = () => "") {
  return `<ul class="sx-grid">${events
    .map((e) => `<li class="sx-item" data-event-slug="${escape(e.slug)}"${attrs(e)}>${socialEventCard(e)}</li>`)
    .join("")}</ul>`;
}

/* ------------------------------------------------------------------ */
/* Discover                                                            */
/* ------------------------------------------------------------------ */

const WHEN_OPTS = [
  ["", "Any time"],
  ["today", "Today"],
  ["weekend", "This weekend"],
  ["week", "This week"],
];
const PRICE_OPTS = [
  ["", "Any price"],
  ["free", "Free"],
  ["under20", "Under $20"],
  ["paid", "Paid"],
];
const WITHIN_OPTS = [
  ["", "Any distance"],
  ["5", "Near me (5 km)"],
  ["10", "Within 10 km"],
  ["25", "Within 25 km"],
];

// A radio styled as a chip. The input is visually hidden, not removed, so
// arrow keys and focus still work.
function radioChip(name, value, label, current, { hue } = {}) {
  const on = (current ?? "") === value;
  return `<label class="fchip"${hue != null ? ` style="--cat-hue:${hue}"` : ""}><input class="visually-hidden" type="radio" name="${escape(
    name,
  )}" value="${escape(value)}"${on ? " checked" : ""} />${hue != null ? `<span class="fchip-dot" aria-hidden="true"></span>` : ""}${escape(label)}</label>`;
}

function checkChip(name, value, label, on, iconName) {
  return `<label class="fchip fchip-toggle"><input class="visually-hidden" type="checkbox" name="${escape(name)}" value="${escape(
    value,
  )}"${on ? " checked" : ""} />${icon(iconName)}${escape(label)}</label>`;
}

// Everything the client needs to filter one card, as data attributes. Built
// from the same values the route filters on, so both agree.
function discoverAttrs(e, visible, index) {
  const when = [e.is_today && "today", e.is_this_weekend && "weekend", e.in_week && "week", e.in_month && "month"].filter(Boolean);
  const search = [e.title, e.description, e.location, e.category, ...(e.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
  return ` data-search="${escape(search)}" data-category="${escape(e.category ?? "")}" data-when="${when.join(" ")}" data-date="${escape(
    e.event_date ?? "",
  )}" data-km="${e.distance_km != null ? Number(e.distance_km) : ""}" data-price="${Number(e.price_cents ?? 0)}" data-pop="${Number(
    e.attendee_count ?? 0,
  )}" data-interest="${Number(e.interested_count ?? 0)}" data-rating="${Number(e.rating ?? 0)}" data-friends="${
    Number(e.friends_going) || 0
  }" data-soon="${index}"${visible ? "" : " hidden"}`;
}

function communityStrip(list) {
  if (!list.length) return "";
  const top = [...list].sort((a, b) => b.member_count - a.member_count).slice(0, 6);
  return `<section class="section disc-communities" aria-labelledby="disc-cm-title">
    <div class="disc-section-head">
      <h2 id="disc-cm-title">${icon("trending")}Trending communities</h2>
      <a href="/communities">See all</a>
    </div>
    <ul class="cm-strip">${top
      .map(
        (c) => `<li><a class="cm-chip" href="/communities/${escape(c.slug)}" style="--hue:${Number(c.cover_hue) || 18}">
          <span class="cm-chip-mark" aria-hidden="true">${escape(c.name.charAt(0))}</span>
          <span class="cm-chip-text"><strong>${escape(c.name)}</strong><span>${escape(
            Number(c.member_count).toLocaleString("en-AU"),
          )} members, ${escape(plural(c.upcoming_count, "event"))} soon</span></span>
        </a></li>`,
      )
      .join("")}</ul>
  </section>`;
}

// discoverPage({user, events, all, filters, categories, communities})
//   events: the ones matching filters, in the route's sort order
//   all: every upcoming event (with in_week / in_month flags), soonest first.
//        Non-matching ones are rendered hidden so client-side filtering can
//        widen the results without a reload.
//   filters: {q, category, when, price, sort, date, within, friends}
export function discoverPage({ user, events, all = events, filters = {}, categories = [], communities = [] }) {
  const f = filters;
  const shown = new Set(events.map((e) => e.slug));
  const soonIndex = new Map(all.map((e, i) => [e.slug, i]));
  // Matching events first, in the route's order; the rest follow, hidden.
  const ordered = [...events, ...all.filter((e) => !shown.has(e.slug))];
  const present = new Set(all.map((e) => e.category));
  const cats = categories.filter((c) => present.has(c) || c === f.category);
  const active = ["q", "category", "when", "price", "date", "within", "friends"].some((k) => f[k]) || f.sort === "popular";
  const n = events.length;

  return layout({
    title: "Discover",
    user,
    active: "discover",
    bodyClass: "page-discover",
    scripts: ["/pages.js"],
    body: `<form class="disc" method="get" action="/discover" role="search" aria-label="Find events" data-discover data-initial-sort="${escape(
      f.sort ?? "",
    )}">
      <section class="disc-hero" style="--hue:18">
        <div class="ev-hero-art" aria-hidden="true"><span></span><span></span><span></span></div>
        <p class="disc-eyebrow">Discover</p>
        <h1>What's on around Sydney</h1>
        <p class="disc-sub">${escape(plural(all.length, "upcoming event"))}. Search by name, place or tag, then narrow it down.</p>
        <div class="disc-search">
          ${icon("search")}
          <label class="visually-hidden" for="disc-q">Search events</label>
          <input id="disc-q" type="search" name="q" value="${escape(f.q ?? "")}" placeholder="Try rooftop, tech or Bondi" autocomplete="off" />
          <button type="submit" class="button">Search</button>
        </div>
      </section>

      <div class="disc-filters">
        <fieldset class="fgroup fgroup-cats">
          <legend class="visually-hidden">Category</legend>
          <div class="fchips-row">
            ${radioChip("category", "", "All", f.category)}
            ${cats.map((c) => radioChip("category", c, c, f.category, { hue: catHue(c) })).join("")}
          </div>
        </fieldset>
        <div class="disc-filter-grid">
          <fieldset class="fgroup">
            <legend class="flabel">When</legend>
            <div class="fchips-wrap">
              ${WHEN_OPTS.map(([v, l]) => radioChip("when", v, l, f.date ? "x" : f.when)).join("")}
              <label class="fdate"><span class="visually-hidden">Pick a date</span><input type="date" name="date" value="${escape(
                f.date ?? "",
              )}" aria-label="Pick a date" /></label>
            </div>
          </fieldset>
          <fieldset class="fgroup">
            <legend class="flabel">Price</legend>
            <div class="fchips-wrap">${PRICE_OPTS.map(([v, l]) => radioChip("price", v, l, f.price)).join("")}</div>
          </fieldset>
          <div class="fgroup">
            <label class="flabel" for="disc-within">Distance</label>
            <select id="disc-within" class="input fselect" name="within">${WITHIN_OPTS.map(
              ([v, l]) => `<option value="${v}"${String(f.within ?? "") === v ? " selected" : ""}>${escape(l)}</option>`,
            ).join("")}</select>
          </div>
          <fieldset class="fgroup">
            <legend class="flabel">Show</legend>
            <div class="fchips-wrap">
              ${checkChip("sort", "popular", "Popular", f.sort === "popular", "trending")}
              ${checkChip("friends", "1", "Friends going", f.friends === "1", "users")}
            </div>
          </fieldset>
        </div>
        <button type="submit" class="button button-secondary nojs-only">Apply filters</button>
      </div>

      <section class="disc-results" aria-labelledby="disc-results-title">
        <div class="disc-section-head">
          <h2 id="disc-results-title">Events</h2>
          <p class="disc-count" data-disc-count role="status" aria-live="polite">${escape(
            n === all.length ? plural(n, "event") : `${n} of ${plural(all.length, "event")}`,
          )}</p>
          <a class="button button-ghost button-sm disc-clear" href="/discover" data-disc-clear${active ? "" : " hidden"}>Clear filters</a>
        </div>
        <ul class="sx-grid" data-disc-grid>${ordered
          .map(
            (e) =>
              `<li class="sx-item" data-event-slug="${escape(e.slug)}"${discoverAttrs(e, shown.has(e.slug), soonIndex.get(e.slug) ?? 0)}>${socialEventCard(
                e,
              )}</li>`,
          )
          .join("")}</ul>
        <div data-disc-empty${n ? " hidden" : ""}>${emptyState({
          title: "No events match",
          text: "Try a wider date range or a different category.",
          action: `<a class="button" href="/discover" data-disc-clear>Clear filters</a>`,
        })}</div>
      </section>
    </form>
    ${communityStrip(communities)}`,
  });
}

/* ------------------------------------------------------------------ */
/* Saved                                                               */
/* ------------------------------------------------------------------ */

// savedPage({user, events}): every upcoming event, all hidden. pages.js shows
// the ones in localStorage (quad:saved) and keeps the list in step with the
// Save buttons.
export function savedPage({ user, events = [] }) {
  return layout({
    title: "Saved",
    user,
    active: "saved",
    scripts: ["/pages.js"],
    body: `${pageHeader({
      title: "Saved events",
      subtitle: "Events you saved on this device. Tap the bookmark on any event card to add or remove it.",
      actions: `<span class="pill" data-saved-count hidden></span>`,
    })}
      <div data-saved-list>
        ${cardGrid(events, () => " hidden")}
        <div data-saved-empty>${emptyState({
          title: "Nothing saved yet",
          text: "Save events you're thinking about and they'll show up here.",
          action: { href: "/discover", label: "Browse events" },
        })}</div>
        <p class="meta small nojs-only">Saved events are kept in your browser, so this page needs JavaScript.</p>
      </div>`,
  });
}

/* ------------------------------------------------------------------ */
/* My events                                                           */
/* ------------------------------------------------------------------ */

// myEventsPage({user, going, maybe, hosted}): event arrays.
export function myEventsPage({ user, going = [], maybe = [], hosted = [] }) {
  const panel = (list, empty) => (list.length ? cardGrid(list) : emptyState(empty));
  const stat = (n, label) => `<li><strong>${n}</strong><span>${escape(label)}</span></li>`;
  return layout({
    title: "My events",
    user,
    active: "my-events",
    body: `${pageHeader({
      title: "My events",
      subtitle: "Events you're going to, thinking about, or running yourself.",
      actions: `<a class="button" href="/events/new">${icon("host")}Host an event</a>`,
    })}
      <ul class="my-stats">${stat(going.length, "Going")}${stat(maybe.length, "Maybe")}${stat(hosted.length, "Hosting")}</ul>
      ${tabs(
        [
          {
            id: "my-going",
            label: `Going (${going.length})`,
            content: panel(going, { title: "You haven't said you're going to anything", text: "Find something on this week.", action: { href: "/discover", label: "Find events" } }),
          },
          {
            id: "my-maybe",
            label: `Maybe (${maybe.length})`,
            content: panel(maybe, { title: "No maybes", text: "Tap Maybe on an event page to keep it here." }),
          },
          {
            id: "my-hosted",
            label: `Hosting (${hosted.length})`,
            content: panel(hosted, { title: "You aren't hosting anything yet", action: { href: "/events/new", label: "Host an event" } }),
          },
        ],
        { label: "My events" },
      )}`,
  });
}

/* ------------------------------------------------------------------ */
/* Tickets                                                             */
/* ------------------------------------------------------------------ */

// A QR-looking pattern drawn from the ticket code. Decorative only: it isn't
// a real QR code and nothing scans it.
function qrPattern(code) {
  const N = 21;
  let h = 2166136261;
  for (const ch of String(code)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    return h / 4294967296;
  };
  const inFinder = (x, y) => [[0, 0], [N - 7, 0], [0, N - 7]].some(([fx, fy]) => x >= fx - 1 && x < fx + 8 && y >= fy - 1 && y < fy + 8);
  let d = "";
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!inFinder(x, y) && rnd() > 0.52) d += `M${x + 2} ${y + 2}h1v1h-1z`;
  const finder = ([fx, fy]) =>
    `<rect x="${fx + 2.5}" y="${fy + 2.5}" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1"/><rect x="${fx + 4}" y="${fy + 4}" width="3" height="3"/>`;
  return `<svg class="tk-qr" viewBox="0 0 25 25" role="img" aria-label="Ticket pattern for ${escape(code)} (placeholder, not scannable)">
    <rect width="25" height="25" class="tk-qr-bg"/><g fill="currentColor"><path d="${d}"/>${[[0, 0], [N - 7, 0], [0, N - 7]].map(finder).join("")}</g>
  </svg>`;
}

// ticketsPage({user, tickets}): [{code, event, holder, price_cents, is_free}].
export function ticketsPage({ user, tickets = [] }) {
  const list = tickets
    .map((t) => {
      const e = t.event;
      return `<li class="tk" style="--hue:${hueOf(e)}">
        <div class="tk-main">
          <p class="tk-kicker">${escape(e.category ?? "Event")} ticket</p>
          <h2 class="tk-title"><a href="/events/${escape(e.slug)}">${escape(e.title)}</a></h2>
          <p class="tk-line">${icon("calendar")}<span>${escape(shortWhen(e))}</span></p>
          <p class="tk-line">${icon("pin")}<span>${escape(e.location ?? "Location to be confirmed")}</span></p>
          <dl class="tk-facts">
            <div><dt>Holder</dt><dd>${avatar(t.holder, "sm")}${escape(t.holder?.display_name ?? "You")}</dd></div>
            <div><dt>Price</dt><dd><span class="pill ${t.is_free ? "pill-success" : "pill-accent"}">${escape(
              t.is_free ? "Free" : `Paid, ${priceLabel(t.price_cents)}`,
            )}</span></dd></div>
          </dl>
        </div>
        <div class="tk-stub">
          ${qrPattern(t.code)}
          <p class="tk-code"><span class="visually-hidden">Ticket code </span><code>${escape(t.code)}</code></p>
          <p class="tk-hint">Show this at the door</p>
        </div>
      </li>`;
    })
    .join("");
  return layout({
    title: "Tickets",
    user,
    active: "tickets",
    body: `${pageHeader({
      title: "Tickets",
      subtitle: tickets.length ? `${plural(tickets.length, "ticket")} for events you're going to.` : "",
    })}
      ${
        tickets.length
          ? `<ul class="tk-list">${list}</ul>`
          : emptyState({ title: "No tickets yet", text: "When you say you're going to an event, its ticket shows up here.", action: { href: "/discover", label: "Find events" } })
      }`,
  });
}

/* ------------------------------------------------------------------ */
/* Event map                                                           */
/* ------------------------------------------------------------------ */

// A drawn sketch of inner Sydney, 1000 x 625 (16:10). Event map_x/map_y
// (0..100) are percentages of this box. Harbour along the top with Darling
// Harbour cutting south, the ocean on the right, parks as green blobs.
const CITY_SVG = `<svg class="map-art emap-art" viewBox="0 0 1000 625" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <rect class="m-land" width="1000" height="625"/>
  <path class="m-water" d="M0 0H1000V90C930 120 900 70 840 110S720 150 660 140 600 175 560 160 520 140 500 165 470 150 440 170 405 165 395 240 380 290 360 280 365 220 350 180 300 150 250 160 120 140 0 150Z"/>
  <path class="m-water" d="M930 625C925 560 960 500 940 440S960 330 1000 300V625Z"/>
  <path class="m-park" d="M545 250h50v70h-50z"/>
  <path class="m-park" d="M560 195c30-10 60 0 70 25s-10 40-40 40-45-45-30-65z"/>
  <path class="m-park" d="M590 420c40-15 90-5 100 30s-30 60-70 55-55-70-30-85z"/>
  <path class="m-park" d="M700 400c50-20 110 0 115 40s-50 70-95 60-60-80-20-100z"/>
  <path class="m-park" d="M280 490c40-10 80 10 75 45s-60 45-85 25-20-60 10-70z"/>
  <path class="m-minor" d="M0 260H1000M0 340H1000M0 420H1000M0 500H1000M200 150V625M300 160V625M450 170V625M520 160V625M650 140V625M760 120V625M860 110V625"/>
  <path class="m-road" d="M0 330C150 320 300 350 470 330S760 300 1000 340"/>
  <path class="m-road" d="M480 170C470 280 500 420 470 625"/>
  <path class="m-road m-road-thin" d="M120 625L400 360M560 330L900 620M600 300C700 260 820 280 940 250"/>
  <g class="emap-labels">
    <text x="470" y="215">CBD</text><text x="300" y="300">Pyrmont</text><text x="395" y="390">Ultimo</text>
    <text x="545" y="380">Surry Hills</text><text x="620" y="265">Kings Cross</text><text x="660" y="350">Paddington</text>
    <text x="270" y="430">Glebe</text><text x="240" y="470">Newtown</text><text x="845" y="390">Bondi</text>
    <text x="180" y="560">Marrickville</text><text x="440" y="520">Redfern</text><text x="200" y="345">Leichhardt</text>
    <text class="emap-water-label" x="610" y="60">Sydney Harbour</text><text class="emap-water-label" x="925" y="580">Tasman Sea</text>
  </g>
</svg>`;

// mapPage({user, events}): events carry details.map_x / details.map_y (0..100, or null).
export function mapPage({ user, events = [] }) {
  const placed = events.filter((e) => e.details?.map_x != null && e.details?.map_y != null);
  const present = [...new Set(placed.map((e) => e.category).filter(Boolean))];
  const pin = (e) => {
    const x = Number(e.details.map_x);
    const y = Number(e.details.map_y);
    return `<a class="emap-pin" href="/events/${escape(e.slug)}" style="--x:${x}%;--y:${y}%;--cat-hue:${catHue(e.category)}" data-emap-pin="${escape(
      e.slug,
    )}" data-category="${escape(e.category ?? "")}" aria-label="${escape(`${e.title}, ${e.category ?? "event"}, ${shortWhen(e)}`)}">${icon(
      "pin",
    )}</a>`;
  };
  const card = (e) => `<template data-emap-card="${escape(e.slug)}">
      <div class="emap-card" style="--hue:${hueOf(e)}">
        <span class="emap-card-cover" aria-hidden="true"></span>
        <div class="emap-card-body">
          <p class="emap-card-cat" style="--cat-hue:${catHue(e.category)}"><span class="fchip-dot" aria-hidden="true"></span>${escape(
            e.category ?? "Event",
          )} · ${escape(priceLabel(e.price_cents ?? 0))}</p>
          <h3 class="emap-card-title">${escape(e.title)}</h3>
          <p class="emap-card-meta">${escape(shortWhen(e))}</p>
          <p class="emap-card-meta">${escape(e.location ?? "")}${e.distance_km != null ? `, ${escape(e.distance_km)} km` : ""}</p>
          <a class="button button-sm" href="/events/${escape(e.slug)}">View event</a>
        </div>
      </div>
    </template>`;
  const listItem = (e) => `<li class="emap-item" data-emap-item="${escape(e.slug)}" data-category="${escape(e.category ?? "")}">
      <span class="emap-dot" style="--cat-hue:${catHue(e.category)}" aria-hidden="true"></span>
      <a class="emap-item-link" href="/events/${escape(e.slug)}"><strong>${escape(e.title)}</strong><span>${escape(shortWhen(e))}${
        e.location ? `, ${escape(e.location.split(",").pop().trim())}` : ""
      }</span></a>
      <button type="button" class="icon-button js-only" data-emap-show="${escape(e.slug)}" aria-label="Show ${escape(e.title)} on the map">${icon(
        "pin",
      )}</button>
    </li>`;

  return layout({
    title: "Event Map",
    user,
    active: "map",
    bodyClass: "page-map",
    scripts: ["/pages.js"],
    body: `${pageHeader({ title: "Event Map", subtitle: `${plural(placed.length, "upcoming event")} around inner Sydney. Pick a pin to see what's on.` })}
      <div class="emap" data-emap>
        <section class="panel emap-stage" aria-labelledby="emap-title">
          <h2 class="visually-hidden" id="emap-title">Map</h2>
          <div class="emap-bar">
            <div class="fchips-row js-only" role="group" aria-label="Filter by category">
              <button type="button" class="fchip" data-emap-cat="" aria-pressed="true">All</button>
              ${present
                .map(
                  (c) => `<button type="button" class="fchip" data-emap-cat="${escape(c)}" aria-pressed="false" style="--cat-hue:${catHue(c)}"><span class="fchip-dot" aria-hidden="true"></span>${escape(
                    c,
                  )}</button>`,
                )
                .join("")}
            </div>
            <div class="map-zoom js-only">
              <button type="button" class="icon-button" data-map-zoom="out" aria-label="Zoom out" disabled>${icon("minus")}</button>
              <button type="button" class="icon-button" data-map-zoom="in" aria-label="Zoom in">${icon("plus")}</button>
            </div>
          </div>
          <div class="emap-viewport" data-map style="--z:1">
            <div class="emap-canvas">
              ${CITY_SVG}
              ${placed.map(pin).join("")}
              <div class="emap-pop" data-emap-pop role="dialog" aria-label="Event details" hidden>
                <button type="button" class="icon-button emap-pop-close" data-emap-close aria-label="Close">${icon("close")}</button>
                <div data-emap-pop-body></div>
              </div>
            </div>
          </div>
          <p class="meta small emap-caption">A sketch of the area, not to scale.</p>
          ${placed.map(card).join("")}
        </section>
        <section class="panel emap-list" aria-labelledby="emap-list-title">
          <h2 class="panel-title" id="emap-list-title">On the map <span class="meta" data-emap-count>(${placed.length})</span></h2>
          ${placed.length ? `<ul class="emap-items">${placed.map(listItem).join("")}</ul>` : `<p class="meta">No events have a location yet.</p>`}
        </section>
      </div>`,
  });
}
