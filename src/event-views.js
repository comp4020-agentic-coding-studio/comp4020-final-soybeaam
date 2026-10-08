// The event detail page: hero, details, map, announcements, attendees, chat.
//
// People here are publicUser() objects from social-db.js (no email, no
// token). The one exception is the legacy `attendees` list, which keeps its
// plain <li>email</li> rows because spec/events.test.ts checks for them.
// Everything that only lives in the browser (saved, follows, reactions, poll
// votes) is wired up by /client.js through the data-* hooks noted below.
import { escape, layout, avatar, formatDate, tabs, accordion, loadingButton, priceLabel } from "./views.js";
import { icon } from "./icons.js";

/* ------------------------------------------------------------------ */
/* Small formatting helpers                                            */
/* ------------------------------------------------------------------ */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const plural = (n, one, many = `${one}s`) => `${Number(n).toLocaleString("en-AU")} ${n === 1 ? one : many}`;

// "2026-10-08" to "Thu 8 Oct 2026". Built from the parts, so no time zone
// shift. Anything that isn't YYYY-MM-DD is shown as typed.
export function dayLabel(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!m) return date || "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// "20:00" to "8:00 pm".
export function timeLabel(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? "");
  if (!m) return "";
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "am" : "pm"}`;
}

function whenLabel(e) {
  const day = dayLabel(e.event_date) || "Date to be confirmed";
  const start = timeLabel(e.start_time);
  const end = timeLabel(e.end_time);
  return start ? `${day}, ${start}${end ? ` to ${end}` : ""}` : day;
}

// Hue for gradients. Legacy events have no cover_hue, so they get the brand orange.
export const hueOf = (e) => (Number.isFinite(e?.cover_hue) ? e.cover_hue : 18);

export const iso = (at) => (at ? escape(String(at).replace(" ", "T") + "Z") : "");

export const STATUS = {
  live: { label: "Live now", cls: "pill-live" },
  "selling-fast": { label: "Selling fast", cls: "pill-warning" },
  "sold-out": { label: "Sold out", cls: "pill-danger" },
  upcoming: { label: "Upcoming", cls: "pill-info" },
};

// "electronic-music" to "Electronic Music", for the community link.
const titleCase = (slug) =>
  String(slug)
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/* ------------------------------------------------------------------ */
/* Reusable pieces (phase B can import these)                          */
/* ------------------------------------------------------------------ */

// Avatar with an online/away dot. user is a publicUser.
export function presenceAvatar(user, size = "md") {
  return `<span class="avatar-wrap">${avatar(user, size)}<span class="online-dot${
    user?.online ? "" : " is-away"
  }" aria-hidden="true"></span></span>`;
}

// Overlapping row of avatars. users are publicUsers.
export function avatarStack(users, size = "sm") {
  if (!users.length) return "";
  return `<span class="avatar-stack" aria-hidden="true">${users.map((u) => avatar(u, size)).join("")}</span>`;
}

// chips(["Music", ...], {accent}): small pills for interests and tags.
export function chips(items, { accent = [] } = {}) {
  if (!items?.length) return "";
  return `<ul class="chips">${items
    .map((t) => `<li class="chip${accent.includes(t) ? " chip-accent" : ""}">${escape(t)}</li>`)
    .join("")}</ul>`;
}

// Fields for the mini profile popover. Picked one by one so nothing private
// can ride along.
function personData(p) {
  return escape(
    JSON.stringify({
      username: p.username,
      name: p.display_name,
      bio: p.bio,
      location: p.location,
      interests: p.interests ?? [],
      mutual: p.mutual_friends ?? 0,
      online: !!p.online,
    }),
  );
}

// Opens the mini profile when JS is on; a plain profile link without it.
// Falls back to plain text for people with no username.
export function personLink(p, inner, className = "") {
  if (!p.username) return `<span class="${className}">${inner}</span>`;
  return `<a class="${className}" href="/profile/${encodeURIComponent(p.username)}" data-person="${personData(p)}">${inner}</a>`;
}

const mutualLabel = (n) => (n > 0 ? plural(n, "mutual friend") : "No mutual friends");

// A compact event row with a gradient thumbnail. No host email, unlike eventCard().
function miniEventCard(e) {
  const bits = [dayLabel(e.event_date), e.location].filter(Boolean).join(" · ");
  return `<a class="mini-event" href="/events/${escape(e.slug)}" style="--hue:${hueOf(e)}">
    <span class="mini-event-cover" aria-hidden="true"></span>
    <span class="mini-event-text">
      <strong>${escape(e.title)}</strong>
      ${bits ? `<span class="mini-event-meta">${escape(bits)}</span>` : ""}
    </span>
  </a>`;
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function primaryAction({ user, event, checkedIn }) {
  const slug = escape(event.slug);
  if (!user) {
    return `<a class="button button-lg" href="/login?next=${encodeURIComponent(`/events/${event.slug}`)}">Log in to go</a>`;
  }
  if (checkedIn) return `<p class="confirmed">You're checked in.</p>`;
  if (event.status === "sold-out") {
    return `<span class="button button-lg" aria-disabled="true">Sold out</span>`;
  }
  const price = event.price_cents ?? 0;
  if (price > 0) {
    // Paid events keep the mocked checkout step, which then posts to /checkin.
    return `<a class="button button-lg" href="/events/${slug}/pay">${icon("ticket")}I'm Going, ${escape(priceLabel(price))}</a>`;
  }
  return `<form class="form-inline" method="post" action="/events/${slug}/checkin" data-loading>
    ${loadingButton("I'm Going", { className: "button-lg", loadingLabel: "Saving..." })}
  </form>`;
}

function heroActions({ user, event, checkedIn, maybe, chatCount }) {
  const slug = escape(event.slug);
  const maybeBtn =
    user && !checkedIn
      ? `<form class="form-inline" method="post" action="/events/${slug}/maybe" data-maybe-form>
          <button type="submit" class="button button-secondary" aria-pressed="${maybe ? "true" : "false"}" data-maybe>Maybe</button>
        </form>`
      : "";
  return `<div class="ev-actions">
    ${primaryAction({ user, event, checkedIn })}
    ${maybeBtn}
    <button type="button" class="button button-secondary js-only" data-save="${slug}" aria-pressed="false">${icon(
      "saved",
    )}<span data-save-label>Save</span></button>
    <button type="button" class="button button-secondary js-only" data-share="/events/${slug}">${icon("share")}Share</button>
    <a class="button button-secondary" href="#chat" data-chat-open>${icon("chat")}Chat${
      chatCount ? `<span class="ev-count">${chatCount}</span>` : ""
    }</a>
  </div>
  <p class="ev-share-status" data-share-status role="status" aria-live="polite"></p>`;
}

function hero({ user, event, people, checkedIn, maybe, chatCount }) {
  const status = STATUS[event.status];
  const top = [
    event.category ? `<span class="pill">${escape(event.category)}</span>` : "",
    status ? `<span class="pill ${status.cls}">${escape(status.label)}</span>` : "",
    event.is_today && event.status !== "live" ? `<span class="pill">Today</span>` : "",
    event.affiliation ? `<span class="pill">${escape(event.affiliation)}</span>` : "",
  ].join("");

  const host = event.host
    ? `<p class="ev-host">${avatar(event.host, "sm")}<span>Hosted by ${personLink(
        event.host,
        escape(event.host.display_name),
        "ev-host-link",
      )}</span></p>`
    : "";

  const where = event.location
    ? `${escape(event.location)}${
        event.distance_km != null ? ` <span class="ev-dim">${escape(event.distance_km)} km away</span>` : ""
      }`
    : "Location to be confirmed";
  const price = event.price_cents ?? 0;
  const priceText = price > 0 ? `${priceLabel(price)} per ticket` : "Free entry";

  const count = Number(event.attendee_count ?? 0);
  const cap = Number(event.capacity) || 0;
  const pct = cap ? Math.min(100, Math.round((count / cap) * 100)) : 0;
  const capacity = `<div class="ev-capacity">
    <p class="ev-capacity-row"><strong>${escape(plural(count, "person", "people"))} going</strong>${
      cap
        ? `<span>${
            event.spots_left > 0 ? `${escape(plural(event.spots_left, "spot"))} left of ${cap}` : `All ${cap} spots taken`
          }</span>`
        : ""
    }</p>
    ${cap ? `<div class="ev-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>` : ""}
  </div>`;

  const crowd = [...people.going, ...people.maybe].slice(0, 5);
  const friendsN = Number(event.friends_going) || 0;
  const friends =
    crowd.length || friendsN
      ? `<div class="ev-friends">${avatarStack(crowd)}<span>${
          friendsN ? `${escape(plural(friendsN, "friend"))} going` : `${escape(plural(crowd.length, "person", "people"))} from Quad`
        }</span></div>`
      : "";

  return `<section class="ev-hero" style="--hue:${hueOf(event)}" aria-labelledby="ev-title">
    <div class="ev-hero-art" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="ev-hero-inner">
      ${top ? `<div class="ev-pills">${top}</div>` : ""}
      <h1 id="ev-title">${escape(event.title)}</h1>
      ${host}
      <ul class="ev-facts">
        <li>${icon("calendar")}<span>${escape(whenLabel(event))}</span></li>
        <li>${icon("pin")}<span>${where}</span></li>
        <li>${icon("ticket")}<span>${escape(priceText)}</span></li>
      </ul>
      <div class="ev-attend">${capacity}${friends}</div>
      ${heroActions({ user, event, checkedIn, maybe, chatCount })}
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Main column sections                                                */
/* ------------------------------------------------------------------ */

function section(id, title, content, { extra = "", className = "" } = {}) {
  return `<section class="panel ev-section ${className}" aria-labelledby="${id}-title"${
    className.includes("ev-anchor") ? ` id="${id}"` : ""
  }>
    <div class="ev-section-head"><h2 class="panel-title" id="${id}-title">${escape(title)}</h2>${extra}</div>
    ${content}
  </section>`;
}

function about(event) {
  const stats = [
    event.rating != null ? `<li>${icon("star")}<strong>${escape(event.rating)}</strong> rating</li>` : "",
    event.interested_count ? `<li>${icon("users")}<strong>${escape(Number(event.interested_count).toLocaleString("en-AU"))}</strong> interested</li>` : "",
    event.maybe_count ? `<li><strong>${escape(event.maybe_count)}</strong> maybe</li>` : "",
  ].join("");
  const tagList = chips(event.tags);
  if (!event.description && !stats && !tagList) return "";
  return section(
    "about",
    "About this event",
    `${event.description ? `<p class="ev-desc">${escape(event.description)}</p>` : ""}
    ${stats ? `<ul class="ev-stats">${stats}</ul>` : ""}
    ${tagList}`,
  );
}

function details(event) {
  const d = event.details ?? {};
  const items = [];
  if (d.schedule?.length) {
    items.push({
      id: "ev-schedule",
      label: "Schedule",
      content: `<ol class="ev-schedule">${d.schedule
        .map((s) => `<li><time>${escape(timeLabel(s.time) || s.time)}</time><span>${escape(s.title)}</span></li>`)
        .join("")}</ol>`,
    });
  }
  if (d.lineup?.length) {
    items.push({
      id: "ev-lineup",
      label: event.category === "Technology" ? "Speakers" : "Lineup",
      content: `<ul class="ev-lineup">${d.lineup
        .map(
          (p) => `<li>${avatar({ name: p.name }, "lg")}<span><strong>${escape(p.name)}</strong>${
            p.role ? `<span class="meta">${escape(p.role)}</span>` : ""
          }</span></li>`,
        )
        .join("")}</ul>`,
    });
  }
  if (d.faqs?.length) {
    items.push({
      id: "ev-faqs",
      label: "FAQs",
      content: accordion(d.faqs.map((f, i) => ({ title: f.q, content: `<p>${escape(f.a)}</p>`, open: i === 0 }))),
    });
  }
  if (!items.length) return "";
  return `<section class="panel ev-section" aria-label="Event details">${tabs(items, { label: "Event details" })}</section>`;
}

// A drawn street map (no tiles): water, parks and roads as SVG shapes coloured
// by theme tokens, with the pin placed at details.map_x / map_y (0..100).
const MAP_SVG = `<svg class="map-art" viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <rect class="m-land" width="400" height="225"/>
  <path class="m-water" d="M0 150 C60 135 90 175 150 168 S250 120 300 150 S370 200 400 190 V225 H0z"/>
  <rect class="m-park" x="40" y="30" width="70" height="46" rx="8"/>
  <rect class="m-park" x="270" y="40" width="54" height="38" rx="8"/>
  <circle class="m-park" cx="200" cy="105" r="16"/>
  <path class="m-minor" d="M0 60H400M0 100H400M0 130H400M70 0V160M130 0V170M240 0V140M300 0V150M350 0V180"/>
  <path class="m-road" d="M0 85 C100 80 160 95 240 88 S360 70 400 75"/>
  <path class="m-road" d="M185 0 C190 60 175 120 200 225"/>
  <path class="m-road m-road-thin" d="M20 0 L120 160M400 20 L280 140"/>
</svg>`;

function mapTile(x, y, { label = "", className = "" } = {}) {
  return `<div class="map-tile ${className}" style="--x:${Number(x)}%;--y:${Number(y)}%">${MAP_SVG}<span class="map-pin-static" aria-hidden="true">${icon(
    "pin",
  )}</span>${label ? `<span class="visually-hidden">${escape(label)}</span>` : ""}</div>`;
}

// Link to the real map, only when the event has stored coordinates.
function osmLink(event) {
  if (event.lat == null || event.lng == null) return "";
  const lat = Number(event.lat).toFixed(6);
  const lng = Number(event.lng).toFixed(6);
  return ` <a href="https://www.openstreetmap.org/?mlat=${lat}&amp;mlon=${lng}#map=16/${lat}/${lng}" target="_blank" rel="noopener">Open in OpenStreetMap</a>`;
}

function hasCoords(event) {
  return event.lat != null && event.lng != null && Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lng));
}

// The drawn sketch is the fallback. With coordinates, maps.js swaps in a real
// map (data-realmap) once MapLibre has loaded. Events outside the sketch's box
// get a plain note as the fallback instead of a misplaced pin.
function location(event) {
  const d = event.details ?? {};
  const drawn = d.map_x != null && d.map_y != null;
  const real = hasCoords(event);
  if (!drawn && !real) return "";
  const where = event.location || "Event location";
  const realAttrs = real ? ` data-realmap="event" data-lat="${Number(event.lat)}" data-lng="${Number(event.lng)}" data-label="${escape(where)}"` : "";
  const fallback = drawn
    ? `<div class="ev-map-canvas">${MAP_SVG}</div>
      <button type="button" class="ev-map-pin" aria-describedby="ev-map-tip">${icon("pin")}<span class="visually-hidden">${escape(
        where,
      )}</span></button>
      <span class="ev-map-tip" id="ev-map-tip" role="tooltip"><strong>${escape(where)}</strong>${
        event.distance_km != null ? `<br />${escape(event.distance_km)} km from you` : ""
      }</span>`
    : `<p class="ev-map-none">Map preview unavailable here. Use the link below to see it on OpenStreetMap.</p>`;
  return section(
    "ev-map",
    "Location",
    `<div class="ev-map"${drawn ? ` data-map style="--x:${Number(d.map_x)}%;--y:${Number(d.map_y)}%;--z:1"` : ""}${realAttrs}>
      ${fallback}${real ? `<template data-realmap-icon>${icon("pin")}</template>` : ""}
    </div>
    <p class="meta ev-map-caption">${icon("pin")}${escape(where)}.${drawn ? `<span class="map-sketch-note"> Map is a sketch, not to scale.</span>` : ""}${osmLink(event)}</p>`,
    {
      className: "ev-anchor",
      extra: !drawn
        ? ""
        : `<div class="map-zoom js-only">
        <button type="button" class="icon-button" data-map-zoom="out" aria-label="Zoom out">${icon("minus")}</button>
        <button type="button" class="icon-button" data-map-zoom="in" aria-label="Zoom in">${icon("plus")}</button>
      </div>`,
    },
  );
}

function announcementItem(a, canManage) {
  return `<li class="ann${a.pinned ? " is-pinned" : ""}" data-ann="${a.id}">
    <div class="ann-head">
      <span class="pill pill-accent" data-pin-badge${a.pinned ? "" : " hidden"}>Pinned</span>
      <h3 class="ann-title">${escape(a.title)}</h3>
    </div>
    ${a.body ? `<p class="ann-body">${escape(a.body)}</p>` : ""}
    <div class="ann-foot">
      <span class="meta small">${escape(a.author?.display_name ?? "The host")}, <time datetime="${iso(a.at)}">${escape(
        formatDate(a.at, { relative: true }),
      )}</time></span>
      ${
        canManage
          ? `<form class="form-inline" method="post" action="/announcements/${a.id}/pin" data-pin-form>
              <button type="submit" class="button button-ghost button-sm" aria-pressed="${a.pinned ? "true" : "false"}" data-pin>${
                a.pinned ? "Unpin" : "Pin"
              }</button>
            </form>`
          : ""
      }
    </div>
  </li>`;
}

function announcements(event, list, canManage) {
  if (!list.length && !canManage) return "";
  const form = canManage
    ? `<details class="ann-new">
        <summary class="button button-secondary button-sm">Post an announcement</summary>
        <form class="ann-form" method="post" action="/events/${escape(event.slug)}/announcements" data-loading>
          <div class="field"><label class="field-label" for="ann-title">Title</label>
            <input class="input" id="ann-title" name="title" required maxlength="120" /></div>
          <div class="field"><label class="field-label" for="ann-body">Message</label>
            <textarea class="input" id="ann-body" name="body" rows="3" maxlength="2000"></textarea></div>
          <label class="check"><input type="checkbox" name="pinned" value="1" /> Pin to the top</label>
          <div>${loadingButton("Post", { className: "button-sm", loadingLabel: "Posting..." })}</div>
        </form>
      </details>`
    : "";
  return section(
    "announcements",
    `Announcements${list.length ? ` (${list.length})` : ""}`,
    `${list.length ? `<ul class="ann-list">${list.map((a) => announcementItem(a, canManage)).join("")}</ul>` : `<p class="meta">No announcements yet.</p>`}
    ${form}`,
    { className: "ev-anchor" },
  );
}

function personCard(p) {
  const going = p.status === "going";
  const inner = `${presenceAvatar(p, "lg")}
    <span class="person-text">
      <strong class="person-name">${escape(p.display_name)}</strong>
      <span class="person-meta">${escape(mutualLabel(p.mutual_friends))}</span>
    </span>
    <span class="pill ${going ? "pill-success" : "pill-warning"} person-status">${going ? "Going" : "Maybe"}</span>`;
  return `<li class="person-card">
    ${personLink(p, inner, "person-main")}
    ${chips((p.interests ?? []).slice(0, 3))}
  </li>`;
}

function attendeesSection(event, people) {
  const list = (arr, empty) =>
    arr.length ? `<ul class="person-grid">${arr.map(personCard).join("")}</ul>` : `<p class="meta">${empty}</p>`;
  const onQuad = people.going.length + people.maybe.length;
  return section(
    "attendees",
    "Attendees",
    `<p class="meta small ev-section-sub">${escape(plural(Number(event.attendee_count ?? 0), "person", "people"))} going in total. ${
      onQuad ? `${escape(plural(onQuad, "person", "people"))} from Quad shown here.` : ""
    }</p>
    ${tabs(
      [
        { id: "att-going", label: `Going (${people.going.length})`, content: list(people.going, "Nobody from Quad has said they're going yet.") },
        { id: "att-maybe", label: `Maybe (${people.maybe.length})`, content: list(people.maybe, "No maybes yet.") },
      ],
      { label: "Attendees" },
    )}`,
    { className: "ev-anchor" },
  );
}

/* ------------------------------------------------------------------ */
/* Side column                                                         */
/* ------------------------------------------------------------------ */

function peopleToMeetSection(list) {
  if (!list?.length) return "";
  return section(
    "meet",
    "People you may want to meet",
    `<ul class="meet-list">${list
      .map(
        (p) => `<li class="meet">
          ${presenceAvatar(p, "md")}
          <div class="meet-text">
            ${personLink(p, escape(p.display_name), "meet-name")}
            ${p.reason ? `<span class="meta small">${escape(p.reason)}</span>` : ""}
            ${chips(p.shared_interests, { accent: p.shared_interests })}
          </div>
          ${
            p.username
              ? `<button type="button" class="button button-secondary button-sm js-only" data-follow="${escape(
                  p.username,
                )}" aria-pressed="false">Follow</button>`
              : ""
          }
        </li>`,
      )
      .join("")}</ul>`,
  );
}

function communityLink(event) {
  if (!event.community) return "";
  const name = titleCase(event.community);
  return `<a class="panel ev-community" href="/communities/${escape(event.community)}">
    ${icon("communities")}
    <span><strong>Join the discussion</strong><span class="meta small">Talk about this event in the ${escape(name)} community.</span></span>
  </a>`;
}

// The original check-in list. The plain <li>email</li> rows are what
// spec/events.test.ts counts, so they must stay bare and appear only here.
function checkedInList(attendees) {
  return section(
    "checked-in",
    `Checked in on Quad (${attendees.length})`,
    attendees.length
      ? `<ul class="attendees attendees-compact">${attendees.map((a) => `<li>${escape(a.email)}</li>`).join("\n")}</ul>`
      : `<p class="meta">Nobody yet. Be the first to check in.</p>`,
  );
}

function relatedSection(related) {
  if (!related?.length) return "";
  return section(
    "related",
    "More like this",
    `<ul class="mini-events">${related.map((e) => `<li>${miniEventCard(e)}</li>`).join("")}</ul>`,
  );
}

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

// Reaction set. Base counts are made up per message (there is no reactions
// table); the viewer's own reaction is kept in localStorage by client.js.
const REACTIONS = [
  { key: "like", emoji: "&#x1F44D;", label: "thumbs up" },
  { key: "fire", emoji: "&#x1F525;", label: "fire" },
  { key: "party", emoji: "&#x1F389;", label: "party" },
  { key: "heart", emoji: "&#x2764;&#xFE0F;", label: "heart" },
];

function reactions(id) {
  return REACTIONS.map((r, i) => {
    const n = (id * (i + 3) + i) % 5 === 0 ? (id * 7 + i * 5) % 9 : 0;
    return `<button type="button" class="react${n ? "" : " is-zero"}" data-react="${r.key}" data-count="${n}" aria-pressed="false" aria-label="React with ${
      r.label
    }"><span aria-hidden="true">${r.emoji}</span><span class="react-n">${n || ""}</span></button>`;
  }).join("");
}

function pollBody(m) {
  const opts = m.meta?.options ?? [];
  const total = opts.reduce((s, o) => s + (Number(o.votes) || 0), 0);
  return `<div class="poll" data-poll="${m.id}">
    <p class="poll-q">${escape(m.meta?.question || m.body)}</p>
    <ul class="poll-opts">${opts
      .map((o, i) => {
        const pct = total ? Math.round(((Number(o.votes) || 0) / total) * 100) : 0;
        return `<li><button type="button" class="poll-opt" data-poll-option="${i}" data-votes="${Number(o.votes) || 0}" aria-pressed="false">
          <span class="poll-bar" style="width:${pct}%"></span>
          <span class="poll-label">${escape(o.label)}</span>
          <span class="poll-pct">${pct}%</span>
        </button></li>`;
      })
      .join("")}</ul>
    <p class="poll-total"><span data-poll-total>${total}</span> votes</p>
  </div>`;
}

function messageBody(m) {
  const text = m.body ? `<p class="msg-body">${escape(m.body)}</p>` : "";
  const meta = m.meta ?? {};
  switch (m.kind) {
    case "image":
      return `${text}<div class="msg-media" style="--hue:${Number(meta.hue) || 200}" role="img" aria-label="Photo: ${escape(
        meta.label || "shared image",
      )}"><span class="msg-media-label">${escape(meta.label || "Photo")}</span></div>`;
    case "gif":
      return `${text}<div class="msg-media msg-gif" role="img" aria-label="GIF: ${escape(meta.label || "animated GIF")}"><span class="gif-badge">GIF</span><span class="msg-media-label">${escape(
        meta.label || "",
      )}</span></div>`;
    case "poll":
      return pollBody(m);
    case "location":
      return `${text}${mapTile(meta.map_x ?? 50, meta.map_y ?? 50, { label: meta.label, className: "msg-map" })}${
        meta.label ? `<p class="msg-map-label">${icon("pin")}${escape(meta.label)}</p>` : ""
      }`;
    default:
      return text;
  }
}

export function chatMessage(m, { canPost = false } = {}) {
  const name = escape(m.author?.display_name ?? "Someone");
  return `<li class="msg msg-${escape(m.kind)}${m.is_mine ? " is-mine" : ""}" id="msg-${m.id}" data-msg="${m.id}">
    ${presenceAvatar(m.author ?? {}, "md")}
    <div class="msg-main">
      <p class="msg-head"><strong class="msg-name">${name}</strong>${
        m.from_host ? `<span class="pill pill-accent msg-host">Host</span>` : ""
      }<time class="msg-time" datetime="${iso(m.at)}">${escape(formatDate(m.at, { relative: true }))}</time></p>
      ${
        m.reply
          ? `<p class="msg-quote"><span class="msg-quote-name">${escape(m.reply.author_name)}</span> ${escape(m.reply.body)}</p>`
          : ""
      }
      ${m.kind === "question" ? `<p class="msg-flag">${icon("question")}Question for the organiser</p>` : ""}
      ${messageBody(m)}
      <div class="msg-actions">
        ${reactions(m.id)}
        ${
          canPost
            ? `<button type="button" class="msg-reply" data-reply="${m.id}" data-reply-name="${name}">${icon("reply")}Reply</button>`
            : ""
        }
      </div>
    </div>
  </li>`;
}

// chatRoom(props): the chat panel shared by event and community pages.
//   user       the viewer (or null); only logged-in viewers get a composer
//   action     POST URL for new messages (JSON-aware, see routes/social.js)
//   back       page path, for the "Log in" link
//   title      heading, e.g. "Event Chat"
//   sub        short line under the heading, e.g. "312 people here"
//   messages   chatFor() output
//   online     publicUsers for the small avatar stack in the header
//   placeholder  textarea placeholder
//   ask        show the "Ask organiser" checkbox
//   inline     true: a normal panel in the page; false: a drawer (client.js)
// The <template data-react-tpl> holds a fresh set of reaction buttons so
// client.js can give a newly posted message reactions even in an empty room.
export function chatRoom({
  user,
  action,
  back,
  title = "Chat",
  sub = "",
  messages = [],
  online = [],
  placeholder = "Write a message",
  ask = false,
  inline = false,
}) {
  const canPost = !!user;
  const composer = canPost
    ? `<form class="chat-compose" method="post" action="${escape(action)}" data-chat-form>
        <div class="chat-replying" data-reply-chip hidden>
          ${icon("reply")}<span>Replying to <strong data-reply-name></strong></span>
          <button type="button" class="icon-button" data-reply-cancel aria-label="Cancel reply">${icon("close")}</button>
        </div>
        <input type="hidden" name="reply_to" value="" data-reply-input />
        <div class="chat-row">
          <label class="visually-hidden" for="chat-body">Message</label>
          <textarea id="chat-body" name="body" rows="1" maxlength="1000" required placeholder="${escape(placeholder)}"></textarea>
          <button type="submit" class="button chat-send" aria-label="Send">${icon("send")}</button>
        </div>
        <div class="chat-tools">
          ${ask ? `<label class="check chat-ask"><input type="checkbox" name="kind" value="question" data-ask /> Ask organiser</label>` : ""}
          <p class="chat-error" data-chat-error role="alert" hidden></p>
        </div>
      </form>`
    : `<div class="chat-login"><p>Log in to join the conversation.</p><a class="button button-block" href="/login?next=${encodeURIComponent(
        back,
      )}">Log in</a></div>`;

  return `<section class="chat${inline ? " is-inline" : ""}" id="chat" aria-labelledby="chat-title" data-chat${
    inline ? " data-chat-inline" : ""
  }${canPost ? ` data-can-post` : ""}>
    <header class="chat-head">
      <div class="chat-title-wrap">
        <h2 id="chat-title">${escape(title)}</h2>
        ${sub ? `<p class="chat-sub"><span class="live-dot" aria-hidden="true"></span>${escape(sub)}</p>` : ""}
      </div>
      ${avatarStack(online)}
      ${inline ? "" : `<button type="button" class="icon-button chat-close js-only" data-chat-close aria-label="Close chat">${icon("close")}</button>`}
    </header>
    <ol class="chat-log" data-chat-log aria-label="Messages">
      ${messages.length ? messages.map((m) => chatMessage(m, { canPost })).join("") : `<li class="chat-empty" data-chat-empty>No messages yet. Say hello.</li>`}
    </ol>
    ${composer}
    <template data-react-tpl>${reactions(0)}</template>
  </section>
  ${inline ? "" : `<div class="chat-scrim" data-chat-scrim hidden></div>`}`;
}

function chatPanel({ user, event, chat, people }) {
  const here = Number(event.attendee_count ?? 0);
  return chatRoom({
    user,
    action: `/events/${event.slug}/chat`,
    back: `/events/${event.slug}`,
    title: "Event Chat",
    sub: `${plural(here, "person", "people")} here`,
    messages: chat,
    online: [...people.going, ...people.maybe].filter((p) => p.online).slice(0, 4),
    placeholder: "Message the event",
    ask: true,
  });
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

// eventPage(props): see server.js GET /events/:slug for the shape. Sections
// with nothing to show (a title-only event, say) are left out.
export function eventPage({
  user,
  event,
  attendees = [],
  checkedIn = false,
  maybe = false,
  people = { going: [], maybe: [] },
  chat = [],
  announcements: annList = [],
  canManage = false,
  peopleToMeet = [],
  related = [],
}) {
  return layout({
    title: event.title,
    user,
    active: "home",
    bodyClass: "page-event",
    scripts: hasCoords(event) ? ["/maps.js"] : [],
    body: `
      <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Events</a><span aria-hidden="true">/</span><span>${escape(
        event.title,
      )}</span></nav>
      ${hero({ user, event, people, checkedIn, maybe, chatCount: chat.length })}
      <div class="ev-layout">
        <div class="ev-main">
          ${about(event)}
          ${details(event)}
          ${announcements(event, annList, canManage)}
          ${location(event)}
          ${attendeesSection(event, people)}
        </div>
        <aside class="ev-side" aria-label="More about this event">
          ${communityLink(event)}
          ${peopleToMeetSection(peopleToMeet)}
          ${checkedInList(attendees)}
          ${relatedSection(related)}
        </aside>
      </div>
      ${chatPanel({ user, event, chat, people })}
    `,
  });
}
