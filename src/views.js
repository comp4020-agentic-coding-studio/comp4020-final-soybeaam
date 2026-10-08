import { icon } from "./icons.js";

// Escapes text for HTML bodies AND attribute values (quotes included).
export const escape = (s = "") =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const THEMES = new Set(["light", "dark", "system"]);

// Best human label for a user: name, then username, then the email's local part.
export function displayName(user) {
  if (!user) return "";
  return user.name || user.username || String(user.email || "").split("@")[0] || "Account";
}

function initials(user) {
  const name = String(user?.name || "").trim();
  if (name) {
    const parts = name.split(/\s+/);
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  return String(user?.username || user?.email || "?").charAt(0).toUpperCase();
}

// Stable hue per person so avatars are told apart at a glance.
function hueFor(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

const SAFE_IMG = /^(https?:\/\/|\/(?!\/)|data:image\/)/i;

// avatar(user, size): round initials badge, or the user's avatar_url image. size: "sm" | "md" | "lg" | "xl".
export function avatar(user, size = "md") {
  const u = typeof user === "string" ? { email: user } : user || {};
  const cls = `avatar avatar-${escape(size)}`;
  if (u.avatar_url && SAFE_IMG.test(u.avatar_url)) {
    return `<img class="${cls}" src="${escape(u.avatar_url)}" alt="" loading="lazy" />`;
  }
  const hue = hueFor(u.email || u.username || u.name || "");
  return `<span class="${cls}" style="--avatar-hue:${hue}" aria-hidden="true">${escape(initials(u))}</span>`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// formatDate(s, {relative}): s is a SQLite datetime('now') value, UTC with no
// zone marker ("2026-10-08 03:15:00"). Plain style is "8 Oct 2026". relative
// gives "just now", "5 min ago", "3 h ago", "yesterday", "2 days ago", then
// the plain date after a week. Unparseable input gives "".
export function formatDate(s, { relative = false } = {}) {
  if (!s) return "";
  const d = new Date(String(s).replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "";
  if (relative) {
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return days === 1 ? "yesterday" : `${days} days ago`;
  }
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// flashToast(map, key): map is {key: {text, kind}}. Only own keys of map
// count, so nothing from the query string is echoed and "__proto__" etc. are
// ignored. Anything else (missing, arrays, unknown keys) renders nothing.
export function flashToast(map, key) {
  if (typeof key !== "string" || !Object.hasOwn(map, key)) return "";
  return toast(map[key].text, map[key].kind);
}

// toast(message, kind): server-rendered flash. kind: "info" | "success" | "error". Errors stay until closed.
export function toast(message, kind = "info") {
  if (!message) return "";
  const k = ["info", "success", "error"].includes(kind) ? kind : "info";
  const ms = k === "error" ? 0 : 5000;
  return `<div class="toast toast-${k}" role="${k === "error" ? "alert" : "status"}" aria-live="${
    k === "error" ? "assertive" : "polite"
  }" data-toast="${ms}">
    <p class="toast-text">${escape(message)}</p>
    <button type="button" class="toast-close" data-toast-close aria-label="Dismiss">&times;</button>
  </div>`;
}

// modal({id, title, body, footer}): a native <dialog>. Open it with any element carrying data-modal-open="id".
export function modal({ id, title, body = "", footer = "" }) {
  const tid = `${escape(id)}-title`;
  return `<dialog class="modal" id="${escape(id)}" aria-labelledby="${tid}">
    <div class="modal-card">
      <div class="modal-head">
        <h2 class="modal-title" id="${tid}">${escape(title)}</h2>
        <button type="button" class="modal-close" data-modal-close aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
    </div>
  </dialog>`;
}

// tabs(items, {label}): items = [{id, label, content}]. Without JS every panel shows and the tabs are jump links.
export function tabs(items, { label = "Sections" } = {}) {
  const list = items
    .map(
      (t, i) =>
        `<a class="tab" role="tab" id="tab-${escape(t.id)}" href="#${escape(t.id)}" aria-controls="${escape(
          t.id,
        )}" aria-selected="${i === 0 ? "true" : "false"}">${escape(t.label)}</a>`,
    )
    .join("");
  const panels = items
    .map(
      (t) =>
        `<section class="tab-panel" role="tabpanel" id="${escape(t.id)}" aria-labelledby="tab-${escape(
          t.id,
        )}" tabindex="0">${t.content}</section>`,
    )
    .join("");
  return `<div class="tabs" data-tabs>
    <div class="tab-list" role="tablist" aria-label="${escape(label)}">${list}</div>
    ${panels}
  </div>`;
}

// accordion(items): items = [{title, content, open}]. Built on <details>, so it needs no JS.
export function accordion(items) {
  return `<div class="accordion">${items
    .map(
      (it) => `<details class="accordion-item"${it.open ? " open" : ""}>
      <summary class="accordion-summary">${escape(it.title)}</summary>
      <div class="accordion-body">${it.content}</div>
    </details>`,
    )
    .join("")}</div>`;
}

// action: either a raw HTML string or {href, label} (rendered as a button link).
function renderAction(action, variant = "") {
  if (!action) return "";
  if (typeof action === "string") return action;
  return `<a class="button ${variant}" href="${escape(action.href)}">${escape(action.label)}</a>`;
}

// emptyState({title, text, action}): friendly "nothing here yet" block.
export function emptyState({ title, text = "", action } = {}) {
  return `<div class="state state-empty">
    <div class="state-icon" aria-hidden="true"></div>
    <h2 class="state-title">${escape(title)}</h2>
    ${text ? `<p class="state-text">${escape(text)}</p>` : ""}
    ${action ? `<div class="state-actions">${renderAction(action)}</div>` : ""}
  </div>`;
}

// errorState({title, text, action}): same shape as emptyState, styled and announced as an error.
export function errorState({ title = "Something went wrong", text = "", action } = {}) {
  return `<div class="state state-error" role="alert">
    <div class="state-icon" aria-hidden="true"></div>
    <h2 class="state-title">${escape(title)}</h2>
    ${text ? `<p class="state-text">${escape(text)}</p>` : ""}
    ${action ? `<div class="state-actions">${renderAction(action, "button-secondary")}</div>` : ""}
  </div>`;
}

// loadingButton(label, {loadingLabel, className}): submit button for a <form data-loading>; it disables and spins on submit.
export function loadingButton(label, { loadingLabel = "", className = "" } = {}) {
  return `<button type="submit" class="button ${escape(className)}"${
    loadingLabel ? ` data-loading-label="${escape(loadingLabel)}"` : ""
  }>${escape(label)}</button>`;
}

// pageHeader({title, subtitle, actions, eyebrow}): page title row. actions is raw HTML.
export function pageHeader({ title, subtitle = "", actions = "", eyebrow = "" }) {
  return `<div class="page-header">
    <div class="page-header-text">
      ${eyebrow ? `<p class="eyebrow">${escape(eyebrow)}</p>` : ""}
      <h1>${escape(title)}</h1>
      ${subtitle ? `<p class="page-subtitle">${escape(subtitle)}</p>` : ""}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ""}
  </div>`;
}

// card({title, body, footer, className}): a bordered surface (.panel). body/footer are raw HTML.
export function card({ title = "", body = "", footer = "", className = "" } = {}) {
  return `<section class="panel ${escape(className)}">
    ${title ? `<h2 class="panel-title">${escape(title)}</h2>` : ""}
    <div class="panel-body">${body}</div>
    ${footer ? `<div class="panel-foot">${footer}</div>` : ""}
  </section>`;
}

// statCard({label, value, hint}): one number with a label, for dashboards.
export function statCard({ label, value, hint = "" }) {
  return `<div class="stat">
    <p class="stat-label">${escape(label)}</p>
    <p class="stat-value">${escape(value)}</p>
    ${hint ? `<p class="stat-hint">${escape(hint)}</p>` : ""}
  </div>`;
}

// formField({label, name, type, value, error, hint, options, ...}): labelled input with inline error.
// type may be any input type, "textarea" or "select" (options = [{value, label}] or strings).
export function formField({
  label,
  name,
  type = "text",
  value = "",
  error = "",
  hint = "",
  id,
  required = false,
  placeholder = "",
  options = [],
  attrs = "",
  rows = 4,
}) {
  const fid = escape(id || `f-${name}`);
  const described = [hint ? `${fid}-hint` : "", error ? `${fid}-error` : ""].filter(Boolean).join(" ");
  const common = `id="${fid}" name="${escape(name)}"${required ? " required" : ""}${
    placeholder ? ` placeholder="${escape(placeholder)}"` : ""
  }${error ? ` aria-invalid="true"` : ""}${described ? ` aria-describedby="${described}"` : ""} ${attrs}`;

  let control;
  if (type === "textarea") {
    control = `<textarea class="input" rows="${Number(rows) || 4}" ${common}>${escape(value)}</textarea>`;
  } else if (type === "select") {
    control = `<select class="input" ${common}>${options
      .map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return `<option value="${escape(v)}"${String(v) === String(value) ? " selected" : ""}>${escape(l)}</option>`;
      })
      .join("")}</select>`;
  } else {
    control = `<input class="input" type="${escape(type)}" value="${escape(value)}" ${common} />`;
  }

  return `<div class="field${error ? " has-error" : ""}">
    <label class="field-label" for="${fid}">${escape(label)}${
      required ? ` <span class="field-required" aria-hidden="true">*</span>` : ""
    }</label>
    ${control}
    ${hint ? `<p class="field-hint" id="${fid}-hint">${escape(hint)}</p>` : ""}
    ${error ? `<p class="field-error" id="${fid}-error">${escape(error)}</p>` : ""}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

// One script for every page. Each block checks its elements exist first, so a
// page without tabs/modals/etc. runs nothing and throws nothing.
const CLIENT_SCRIPT = `
(function () {
  var d = document;

  // The sidebar drawer (Menu button, scrim, Esc) lives in /client.js.

  d.addEventListener("click", function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;

    var opener = t.closest("[data-modal-open]");
    if (opener) {
      var dlg = d.getElementById(opener.getAttribute("data-modal-open"));
      if (dlg && typeof dlg.showModal === "function") { e.preventDefault(); dlg.showModal(); }
      return;
    }
    var closer = t.closest("[data-modal-close]");
    if (closer) { var parent = closer.closest("dialog"); if (parent) parent.close(); return; }
    if (t.tagName === "DIALOG" && t.open) t.close();
  });

  d.querySelectorAll("[data-tabs]").forEach(function (root) {
    var list = Array.prototype.slice.call(root.querySelectorAll("[role=tab]"));
    if (!list.length) return;
    function select(tab, focus) {
      list.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        var p = d.getElementById(t.getAttribute("aria-controls"));
        if (p) p.hidden = !on;
      });
      if (focus) tab.focus();
    }
    list.forEach(function (t, i) {
      t.addEventListener("click", function (e) { e.preventDefault(); select(t, false); });
      t.addEventListener("keydown", function (e) {
        var n = null;
        if (e.key === "ArrowRight") n = list[(i + 1) % list.length];
        else if (e.key === "ArrowLeft") n = list[(i - 1 + list.length) % list.length];
        else if (e.key === "Home") n = list[0];
        else if (e.key === "End") n = list[list.length - 1];
        if (n) { e.preventDefault(); select(n, true); }
      });
    });
    var start = list.filter(function (t) { return location.hash && t.getAttribute("href") === location.hash; })[0];
    root.classList.add("is-enhanced");
    select(start || list[0], false);
  });

  d.querySelectorAll("[data-toast]").forEach(function (t) {
    function dismiss() {
      t.classList.add("is-leaving");
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
    }
    var c = t.querySelector("[data-toast-close]");
    if (c) c.addEventListener("click", dismiss);
    var ms = Number(t.getAttribute("data-toast")) || 0;
    if (ms > 0) {
      var timer = setTimeout(dismiss, ms);
      var hold = function () { clearTimeout(timer); };
      t.addEventListener("mouseenter", hold);
      t.addEventListener("focusin", hold);
    }
  });

  d.addEventListener("submit", function (e) {
    var f = e.target;
    if (e.defaultPrevented || !(f instanceof HTMLFormElement) || !f.hasAttribute("data-loading")) return;
    if (f.getAttribute("aria-busy") === "true") { e.preventDefault(); return; }
    f.setAttribute("aria-busy", "true");
    var b = e.submitter || f.querySelector("[type=submit]");
    if (!b) return;
    b.classList.add("is-loading");
    var label = b.getAttribute("data-loading-label");
    if (label) { b.setAttribute("data-idle-label", b.textContent); b.textContent = label; }
    // Disable after the browser has collected the form data, so a named
    // submit button still sends its value.
    setTimeout(function () { b.disabled = true; }, 0);
  });

  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    d.querySelectorAll("form[aria-busy=true]").forEach(function (f) {
      f.removeAttribute("aria-busy");
      f.querySelectorAll(".is-loading").forEach(function (b) {
        b.classList.remove("is-loading");
        b.disabled = false;
        var idle = b.getAttribute("data-idle-label");
        if (idle) b.textContent = idle;
      });
    });
  });
})();
`;

// Sidebar navigation, in two groups. auth: only shown when logged in (those
// pages redirect to /login anyway). admin: only for admins.
const NAV_GROUPS = [
  {
    label: "Explore",
    links: [
      { key: "home", href: "/", label: "Home" },
      { key: "discover", href: "/discover", label: "Discover" },
      { key: "map", href: "/map", label: "Event Map" },
      { key: "communities", href: "/communities", label: "Communities" },
      { key: "announcements", href: "/announcements", label: "Announcements" },
      { key: "activity", href: "/activity", label: "Activity" },
    ],
  },
  {
    label: "You",
    links: [
      { key: "my-events", href: "/my-events", label: "My Events", auth: true },
      { key: "saved", href: "/saved", label: "Saved" },
      { key: "tickets", href: "/tickets", label: "Tickets", auth: true },
      { key: "messages", href: "/messages", label: "Messages", auth: true },
      { key: "notifications", href: "/notifications", label: "Notifications", auth: true, badge: true },
      { key: "settings", href: "/settings", label: "Settings", auth: true },
      { key: "admin", href: "/admin", label: "Admin", auth: true, admin: true },
    ],
  },
];

function sidebarNav(user, active) {
  return NAV_GROUPS.map((g) => {
    const links = g.links
      .filter((l) => (!l.auth || user) && (!l.admin || user?.role === "admin"))
      .map((l) => {
        const on = active === l.key;
        return `<li><a class="sb-link${on ? " is-active" : ""}" href="${l.href}"${on ? ` aria-current="page"` : ""}>${icon(
          l.key,
          "icon sb-icon",
        )}<span class="sb-label">${escape(l.label)}</span>${
          l.badge ? `<span class="sb-badge" data-notif-badge hidden></span>` : ""
        }</a></li>`;
      })
      .join("");
    return `<p class="sb-group" aria-hidden="true">${escape(g.label)}</p><ul class="sb-nav">${links}</ul>`;
  }).join("");
}

// Sidebar footer: who is logged in, a link to their profile and a log out
// button. Only public fields are used, so no email shows here.
function sidebarUser(user, active) {
  if (!user) {
    return `<div class="sb-foot sb-foot-guest">
      <p class="sb-guest-text">Log in to check in, chat and host.</p>
      <a class="button button-block" href="/login">Log in</a>
    </div>`;
  }
  const name = displayName(user);
  const face = { username: user.username, name: user.name, avatar_url: user.avatar_url, email: user.email };
  return `<div class="sb-foot">
    <a class="sb-user${active === "profile" ? " is-active" : ""}" href="/profile"${
      active === "profile" ? ` aria-current="page"` : ""
    } title="Your profile">
      <span class="avatar-wrap">${avatar(face, "md")}<span class="online-dot" aria-hidden="true"></span></span>
      <span class="sb-user-text">
        <strong class="sb-user-name">${escape(name)}</strong>
        ${user.username ? `<span class="sb-user-handle">@${escape(user.username)}</span>` : ""}
      </span>
      <span class="visually-hidden">(online, view your profile)</span>
    </a>
    <form class="form-inline" method="post" action="/logout">
      <button type="submit" class="icon-button" aria-label="Log out" title="Log out">${icon("logout")}</button>
    </form>
  </div>`;
}

function siteFooter(user) {
  return `<footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">Q</span>Quad</a>
        <p class="footer-note">Events from any campus, club or community. Anyone can host, anyone can check in.</p>
      </div>
      <nav class="footer-cols" aria-label="Footer">
        <div class="footer-col">
          <h2 class="footer-heading">Explore</h2>
          <a href="/">All events</a>
          <a href="${user ? "/events/new" : "/login"}">Host an event</a>
        </div>
        <div class="footer-col">
          <h2 class="footer-heading">Account</h2>
          ${
            user
              ? `<a href="/profile">Profile</a><a href="/settings">Settings</a>`
              : `<a href="/login">Log in</a>`
          }
        </div>
        <div class="footer-col">
          <h2 class="footer-heading">About</h2>
          <a href="/readme/">About this app</a>
        </div>
      </nav>
    </div>
  </footer>`;
}

// The mini profile dialog. Any link built by personLink() (event-views.js)
// carries data-person, and client.js fills this dialog from it. layout()
// renders it once on every page so those links work everywhere.
function personModal() {
  return modal({
    id: "person-modal",
    title: "Profile",
    body: `<div class="pm" data-pm>
      <div class="pm-head"><span class="pm-avatar" data-pm-avatar></span>
        <div><p class="pm-status" data-pm-status></p><p class="pm-meta" data-pm-meta></p></div>
      </div>
      <p class="pm-bio" data-pm-bio></p>
      <div data-pm-interests></div>
    </div>`,
    footer: `<button type="button" class="button" data-follow="" data-pm-follow aria-pressed="false">Follow</button>
      <a class="button button-secondary" href="/messages" data-pm-message>Message</a>
      <a class="button button-ghost" href="/profile" data-pm-profile>View profile</a>`,
  });
}

// Extra page scripts. Only these fixed paths can be added, so a view can't
// load anything else by mistake.
const PAGE_SCRIPTS = new Set(["/pages.js"]);

// layout({title, user, body, active, bodyClass, scripts}): full page shell with
// the app sidebar. active is a sidebar key: "home" | "discover" | "my-events" |
// "saved" | "map" | "communities" | "messages" | "notifications" | "tickets" |
// "announcements" | "activity" | "settings" | "host" | "admin" | "profile".
// "events" is the older name for "home" and still works. scripts: extra
// deferred scripts loaded after /client.js (see PAGE_SCRIPTS).
export function layout({ title = "Quad", user = null, body = "", active = "", bodyClass = "", scripts = [] }) {
  const theme = user && THEMES.has(user.theme) ? user.theme : "system";
  const fullTitle = /^quad\b/i.test(title) || /\bquad$/i.test(title) ? title : `${title} · Quad`;
  const key = active === "events" ? "home" : active;
  const hostOn = key === "host";

  return `<!doctype html>
<html lang="en-AU" class="no-js" data-theme="${theme}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>${escape(fullTitle)}</title>
    <link rel="stylesheet" href="/style.css" />
    <script>document.documentElement.className = document.documentElement.className.replace("no-js", "js");</script>
  </head>
  <body${bodyClass ? ` class="${escape(bodyClass)}"` : ""}>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="topbar">
      <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">Q</span>Quad</a>
      <button type="button" class="nav-toggle" data-nav-toggle aria-expanded="false" aria-controls="site-nav">
        <span class="nav-toggle-bars" aria-hidden="true"></span><span class="nav-toggle-label">Menu</span>
      </button>
    </header>
    <div class="app-scrim" data-nav-scrim hidden></div>
    <aside class="app-sidebar" id="site-nav" aria-label="Sidebar">
      <div class="sb-head">
        <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">Q</span>Quad</a>
        <button type="button" class="icon-button sb-close" data-nav-close aria-label="Close menu">${icon("close")}</button>
      </div>
      <a class="button sb-host${hostOn ? " is-active" : ""}" href="${user ? "/events/new" : "/login?next=/events/new"}"${
        hostOn ? ` aria-current="page"` : ""
      }>${icon("host")}Host an event</a>
      <nav class="sb-scroll" aria-label="Main">${sidebarNav(user, key)}</nav>
      ${sidebarUser(user, key)}
    </aside>
    <div class="app-main">
      <main id="main" class="site-main">
        ${body}
      </main>
      ${siteFooter(user)}
    </div>
    ${personModal()}
    <script>${CLIENT_SCRIPT}</script>
    <script src="/client.js" defer></script>${scripts
      .filter((s) => PAGE_SCRIPTS.has(s))
      .map((s) => `\n    <script src="${s}" defer></script>`)
      .join("")}
  </body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

// $0 shows as "Free" rather than "$0.00", since a price badge that always looks
// like a real amount would misstate the (mocked) free events.
export function priceLabel(cents) {
  return cents > 0 ? `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}` : "Free";
}

// One reusable event card. Host identity comes only from event.host_email
// (joined in listEvents); the event's creator column holds a session token and
// is deliberately never read here.
export function eventCard(event, { attendeeCount } = {}) {
  const hostName = event.host_name || event.host_username || "";
  const hostLabel = hostName ? `Hosted by ${escape(hostName)}` : "Host TBA";
  const chip =
    typeof attendeeCount === "number" && attendeeCount > 0
      ? `<span class="attendee-chip">${attendeeCount} checked in</span>`
      : "";

  return `<article class="event-card">
    <!-- Placeholder: real image upload isn't built yet, so this gradient block stands in for an event photo. -->
    <div class="card-image" aria-hidden="true">
      <span class="price-badge">${escape(priceLabel(event.price_cents ?? 0))}</span>
    </div>
    <div class="card-body">
      <h2 class="card-title"><a href="/events/${escape(event.slug)}">${escape(event.title)}</a></h2>
      <p class="card-meta">${escape(event.event_date || "Date TBA")}</p>
      <p class="card-meta">${escape(event.location || "Location TBA")}</p>
      ${event.affiliation ? `<p class="card-meta card-affiliation">${escape(event.affiliation)}</p>` : ""}
      ${chip}
      <div class="card-host">
        ${avatar(hostName, "sm")}
        <span>${hostLabel}</span>
      </div>
    </div>
  </article>`;
}

const SORTS = [
  { value: "latest", label: "Latest" },
  { value: "soonest", label: "Soonest" },
  { value: "name_asc", label: "Name A to Z" },
  { value: "name_desc", label: "Name Z to A" },
];

// Filter/sort sidebar: a laptop-width side column that becomes a flat block
// above the list on narrow screens (see .home-layout in style.css). Plain
// GET-form radios so filtering works with no client-side JS.
function sidebar({ sort, category, categories }) {
  const sortItem = ({ value, label }) => `<label class="filter-option">
      <input type="radio" name="sort" value="${escape(value)}" ${sort === value ? "checked" : ""} />
      ${escape(label)}
    </label>`;

  const categoryItem = (value, label) => `<label class="filter-option">
      <input type="radio" name="category" value="${escape(value)}" ${
        (category || "") === value ? "checked" : ""
      } />
      ${escape(label)}
    </label>`;

  return `<aside class="sidebar" aria-label="Sort and filter events">
    <form method="get" action="/#events" id="filters">
      <section class="filter-group">
        <h2>Sort by</h2>
        ${SORTS.map(sortItem).join("\n")}
      </section>
      <section class="filter-group">
        <h2>Category</h2>
        ${categoryItem("", "All events")}
        ${categories.map((c) => categoryItem(c, c)).join("\n")}
      </section>
      <noscript><button type="submit">Apply</button></noscript>
    </form>
  </aside>
  <script>
    // Progressive enhancement only: without JS the noscript submit button
    // above still works, since this is a plain GET form.
    document.getElementById("filters").addEventListener("change", (e) => e.target.form.requestSubmit());
  </script>`;
}

/* ---- Home page pieces (homePage only) ---- */

// Fixed flash messages for the home page. Only these keys are recognised, so
// nothing from the query string is ever echoed back.
const HOME_FLASH = {
  "logged-out": { text: "You're logged out.", kind: "success" },
};

// Decorative hero illustration: a stack of event tickets with a check mark.
// Inline SVG coloured by CSS classes, so it follows the theme tokens.
const HERO_ART = `<svg class="hero-art-svg" viewBox="0 0 320 260" aria-hidden="true" focusable="false">
  <rect class="ha-back" x="58" y="34" width="210" height="128" rx="16" transform="rotate(-8 163 98)" />
  <rect class="ha-mid" x="46" y="62" width="220" height="132" rx="16" transform="rotate(4 156 128)" />
  <g class="ha-ticket" transform="rotate(-2 160 150)">
    <rect class="ha-front" x="34" y="86" width="246" height="140" rx="18" />
    <rect class="ha-band" x="34" y="86" width="246" height="40" rx="18" />
    <rect class="ha-band" x="34" y="108" width="246" height="18" />
    <circle class="ha-notch" cx="34" cy="176" r="12" />
    <circle class="ha-notch" cx="280" cy="176" r="12" />
    <line class="ha-perf" x1="200" y1="132" x2="200" y2="220" />
    <rect class="ha-line" x="56" y="144" width="110" height="12" rx="6" />
    <rect class="ha-line ha-line-soft" x="56" y="166" width="82" height="10" rx="5" />
    <rect class="ha-line ha-line-soft" x="56" y="186" width="96" height="10" rx="5" />
    <circle class="ha-check-bg" cx="240" cy="176" r="24" />
    <path class="ha-check" d="M229 176 l8 8 l15 -16" />
  </g>
</svg>`;

const HOME_FEATURES = [
  {
    title: "Browse by category",
    text: "Sort the list by date or name, or narrow it to socials, workshops, trivia and the rest.",
  },
  {
    title: "Check in at the door",
    text: "Free events take one tap. Paid ones go through a short checkout first.",
  },
  {
    title: "See who's going",
    text: "Every event page lists the people who have checked in so far.",
  },
  {
    title: "Host your own",
    text: "Any logged-in user can put an event up. It goes live straight away.",
  },
];

function homeFeatures() {
  return `<section class="section" aria-labelledby="home-features-title">
    <h2 class="visually-hidden" id="home-features-title">What you can do on Quad</h2>
    <ul class="home-features">
      ${HOME_FEATURES.map(
        (f, i) => `<li class="panel home-feature">
          <span class="home-feature-num" aria-hidden="true">${i + 1}</span>
          <h3 class="home-feature-title">${escape(f.title)}</h3>
          <p class="home-feature-text">${escape(f.text)}</p>
        </li>`,
      ).join("")}
    </ul>
  </section>`;
}

function homeStats(stats) {
  if (!stats) return "";
  const items = [
    { label: "Events listed", value: stats.events },
    { label: "People signed up", value: stats.users },
    { label: "Check-ins so far", value: stats.checkins },
    { label: "Check-ins this week", value: stats.checkins_last_7_days },
  ];
  return `<section class="section" aria-labelledby="home-stats-title">
    <h2 class="visually-hidden" id="home-stats-title">Quad in numbers</h2>
    <div class="grid grid-stats">
      ${items.map((s) => statCard({ label: s.label, value: Number(s.value ?? 0).toLocaleString("en-AU") })).join("")}
    </div>
  </section>`;
}

// Horizontal scroll-snap row. Without JS it is a plain scrollable list; the
// script reveals the prev/next buttons and keeps them in sync with the scroll.
function homeCarousel(featured, heading) {
  if (!featured || !featured.length) return "";
  return `<section class="section home-carousel" aria-labelledby="home-carousel-title" data-carousel>
    <div class="split section-head home-section-head">
      <h2 id="home-carousel-title">${escape(heading)}</h2>
      <div class="cluster home-carousel-controls" data-carousel-controls hidden>
        <button type="button" class="button button-secondary button-sm" data-carousel-prev aria-controls="home-carousel-track">
          <span aria-hidden="true">&larr;</span> Previous
        </button>
        <button type="button" class="button button-secondary button-sm" data-carousel-next aria-controls="home-carousel-track">
          Next <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </div>
    <ul class="home-carousel-track" id="home-carousel-track" tabindex="0" aria-label="${escape(heading)}">
      ${featured
        .map(
          (e) =>
            `<li class="home-carousel-item">${eventCard(e, { attendeeCount: e.attendee_count })}</li>`,
        )
        .join("")}
    </ul>
  </section>
  <script>
    (function () {
      var root = document.querySelector("[data-carousel]");
      if (!root) return;
      var track = root.querySelector(".home-carousel-track");
      var controls = root.querySelector("[data-carousel-controls]");
      var prev = root.querySelector("[data-carousel-prev]");
      var next = root.querySelector("[data-carousel-next]");
      if (!track || !controls || !prev || !next) return;
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      function sync() {
        var max = track.scrollWidth - track.clientWidth;
        controls.hidden = max <= 2;
        prev.disabled = track.scrollLeft <= 2;
        next.disabled = track.scrollLeft >= max - 2;
      }
      function go(dir) {
        track.scrollBy({ left: dir * track.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
      }
      prev.addEventListener("click", function () { go(-1); });
      next.addEventListener("click", function () { go(1); });
      track.addEventListener("scroll", sync, { passive: true });
      window.addEventListener("resize", sync);
      sync();
    })();
  </script>`;
}

// homePage({user, events, sort, category, categories, stats, featured, featuredHeading, flash})
// stats: the object from db.stats(); featured: events for the carousel;
// flash: a key of HOME_FLASH (anything else is ignored).
export function homePage({
  user,
  events,
  sort,
  category,
  categories,
  stats = null,
  featured = [],
  featuredHeading = "Coming up",
  flash = "",
}) {
  const hostHref = user ? "/events/new" : "/login?next=/events/new";
  const flashMsg = flashToast(HOME_FLASH, flash);

  const hero = `<section class="home-hero" aria-labelledby="home-hero-title">
    <div class="home-hero-text">
      <p class="eyebrow">${user ? `Welcome back, ${escape(displayName(user))}` : "Events on campus and around it"}</p>
      <h1 id="home-hero-title">Find something on this week and check in when you get there.</h1>
      <p class="home-hero-sub">Quad lists events from clubs, societies and anyone else who wants to run one. Pick an event, turn up, and check in from your phone.</p>
      <div class="cluster home-hero-actions">
        <a class="button button-lg" href="#events">Browse events</a>
        <a class="button button-secondary button-lg" href="${hostHref}">Host an event</a>
      </div>
    </div>
    <div class="home-hero-art">${HERO_ART}</div>
  </section>`;

  const ctaBand = `<section class="home-cta" aria-labelledby="home-cta-title">
    <div>
      <h2 id="home-cta-title">Running something? Put it on Quad.</h2>
      <p>Add a title, date and place. People can find it and check in as soon as you save it.</p>
    </div>
    <div class="cluster">
      <a class="button button-lg" href="${hostHref}">Host an event</a>
      <a class="button button-ghost button-lg" href="/readme/">How Quad works</a>
    </div>
  </section>`;

  const list = events.length
    ? `<ul class="event-grid">
        ${events
          .map(
            (e) =>
              `<li class="event-card-item">${eventCard(e, { attendeeCount: e.attendee_count })}</li>`,
          )
          .join("\n")}
      </ul>`
    : emptyState({
        title: "No events match this filter",
        text: "Try another category, or host one yourself.",
        action: { href: "/#events", label: "Show all events" },
      });

  return layout({
    title: "Quad | events",
    user,
    active: "events",
    body: `
      ${
        flashMsg
          ? `${flashMsg}
      <script>
        // Drop ?flash= from the address bar so a reload doesn't show the message again.
        if (window.history && history.replaceState) history.replaceState(null, "", location.pathname + location.hash);
      </script>`
          : ""
      }
      ${hero}
      ${homeFeatures()}
      ${homeStats(stats)}
      ${homeCarousel(featured, featuredHeading)}
      <section class="section home-browse" id="events" aria-labelledby="home-events-title">
        <div class="split section-head home-section-head">
          <div>
            <h2 id="home-events-title">All events</h2>
            <p class="muted home-section-sub">${
              category
                ? `Showing ${escape(category)} events. <a href="/#events">Show all</a>`
                : "Use the sort and category options to narrow the list."
            }</p>
          </div>
          <a href="${hostHref}" class="button">Host an event</a>
        </div>
        <div class="home-layout">
          ${sidebar({ sort, category, categories })}
          <div class="home-main">
            ${list}
          </div>
        </div>
      </section>
      ${ctaBand}
    `,
  });
}

/* ---- Login page ---- */

// loginPage({error, email, field, next}): error is the server message (shown in
// a callout and, when field is "email" or "password", under that field too).
// email re-fills the form; next is an already-validated relative path.
export function loginPage({ error = "", email = "", field = "", next = "" } = {}) {
  const emailError = error && field === "email" ? error : "";
  const passwordError = error && field === "password" ? "Check your email and password, then try again." : "";

  return layout({
    title: "Log in",
    user: null,
    bodyClass: "page-auth",
    body: `
      <div class="auth-wrap">
        <section class="panel auth-card" aria-labelledby="auth-title">
          <div class="auth-head">
            <span class="brand-mark auth-mark" aria-hidden="true">Q</span>
            <h1 id="auth-title">Log in to Quad</h1>
            <p class="muted">Use the email and password for your Quad account.</p>
          </div>
          <form class="stack" method="post" action="/login" data-loading>
            ${
              error
                ? `<div class="callout callout-error" role="alert"><strong>Couldn't log you in.</strong> ${escape(
                    error,
                  )}</div>`
                : ""
            }
            ${next ? `<input type="hidden" name="next" value="${escape(next)}" />` : ""}
            ${formField({
              label: "Email",
              name: "email",
              type: "email",
              value: email,
              error: emailError,
              required: true,
              placeholder: "you@example.com",
              attrs: `autocomplete="email" inputmode="email" spellcheck="false"${error ? "" : " autofocus"}`,
            })}
            <div class="auth-password">
              ${formField({
                label: "Password",
                name: "password",
                type: "password",
                error: passwordError,
                required: true,
                attrs: `autocomplete="current-password"${field === "password" ? " autofocus" : ""}`,
              })}
              <button type="button" class="button button-ghost button-sm auth-reveal" data-password-toggle aria-controls="f-password" aria-pressed="false" hidden>
                <span class="auth-reveal-icon" aria-hidden="true"></span>Show password
              </button>
            </div>
            ${loadingButton("Log in", { loadingLabel: "Logging in...", className: "button-block button-lg" })}
          </form>
          <div class="auth-demo">
            <h2 class="auth-demo-title">Demo accounts</h2>
            <p>This is a demo app. Log in as <code>alex@quad.test</code> with the password <code>password123</code>. The other seeded accounts use the same password.</p>
          </div>
        </section>
        <p class="auth-foot muted small"><a href="/admin/login">Admin login</a> (development only, for the seeded admin account)</p>
      </div>
      <script>
        (function () {
          var btn = document.querySelector("[data-password-toggle]");
          var input = document.getElementById("f-password");
          if (!btn || !input) return;
          btn.hidden = false;
          btn.addEventListener("click", function () {
            var show = input.type === "password";
            input.type = show ? "text" : "password";
            btn.setAttribute("aria-pressed", show ? "true" : "false");
          });
          // Never submit the password field as type=text, so browsers still offer to save it.
          if (input.form) input.form.addEventListener("submit", function () {
            input.type = "password";
            btn.setAttribute("aria-pressed", "false");
          });
        })();
      </script>
    `,
  });
}

export function newEventPage({ user, categories }) {
  return layout({
    title: "Host an event",
    user,
    active: "host",
    body: `
      ${pageHeader({
        eyebrow: "Host",
        title: "Host an event",
        subtitle: "Anyone logged in can host. Your event goes live as soon as you create it.",
      })}
      <div class="form-page">
        <form class="form-card" method="post" action="/events" data-loading>
          ${formField({ label: "Title", name: "title", required: true, placeholder: "Trivia night" })}
          <div class="field-row">
            ${formField({ label: "Date", name: "event_date", type: "date" })}
            ${formField({
              label: "Location",
              name: "location",
              placeholder: "Union Court",
              hint: "We look the address up on OpenStreetMap to put it on the map.",
            })}
          </div>
          ${formField({
            label: "Affiliation",
            name: "affiliation",
            hint: "University, club or group, if there is one.",
          })}
          <div class="field-row">
            ${formField({
              label: "Category",
              name: "category",
              type: "select",
              options: [{ value: "", label: "None" }, ...categories],
            })}
            ${formField({
              label: "Price (AUD)",
              name: "price",
              type: "number",
              value: "0",
              hint: "0 means free.",
              attrs: `min="0" step="0.01"`,
            })}
          </div>
          <div class="form-actions">
            ${loadingButton("Create event", { loadingLabel: "Creating..." })}
            <a class="button button-ghost" href="/">Cancel</a>
          </div>
        </form>
        <p class="meta">Prices are only used to test the checkout step. No real payment is taken (see README).</p>
      </div>
    `,
  });
}

// eventPage lives in event-views.js.

// A dummy payment step: no card processor, no stored details, just a fake
// form that goes straight to the real checkin route on submit. This exists so
// "priced" events have a visibly distinct step from free ones, standing in
// for a real checkout until one gets built (see README's "what I chose not
// to build").
export function payPage({ user, event }) {
  const amount = escape(priceLabel(event.price_cents ?? 0));
  return layout({
    title: `Pay for ${event.title}`,
    user,
    active: "events",
    body: `
      <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Events</a><span aria-hidden="true">/</span><a href="/events/${escape(
        event.slug,
      )}">${escape(event.title)}</a><span aria-hidden="true">/</span><span>Checkout</span></nav>
      ${pageHeader({ eyebrow: "Checkout", title: `Pay ${priceLabel(event.price_cents ?? 0)}` })}
      <div class="form-page">
        <div class="callout callout-info">This is a mocked checkout for ${escape(
          event.title,
        )}. No card is charged, and nothing you type here is stored.</div>
        <form class="form-card" method="post" action="/events/${escape(event.slug)}/checkin" data-loading>
          <div class="field">
            <label class="field-label" for="pay-card">Card number</label>
            <input class="input" id="pay-card" type="text" inputmode="numeric" placeholder="4242 4242 4242 4242" disabled />
          </div>
          <div class="field-row">
            <div class="field">
              <label class="field-label" for="pay-exp">Expiry</label>
              <input class="input" id="pay-exp" type="text" placeholder="12/34" disabled />
            </div>
            <div class="field">
              <label class="field-label" for="pay-cvc">CVC</label>
              <input class="input" id="pay-cvc" type="text" placeholder="123" disabled />
            </div>
          </div>
          <div class="summary-row"><span>Total</span><strong>${amount}</strong></div>
          ${loadingButton(`Pay ${priceLabel(event.price_cents ?? 0)} (mock) & check in`, {
            className: "button-block",
            loadingLabel: "Processing...",
          })}
        </form>
      </div>
    `,
  });
}

// notFoundPage({user, text}): shared 404 page, used for unknown URLs, events,
// profiles and admin user lookups.
export function notFoundPage({ user = null, text = "That page doesn't exist, or it was removed." } = {}) {
  return layout({
    title: "Not found",
    user,
    body: errorState({ title: "Not found", text, action: { href: "/", label: "Back to events" } }),
  });
}

// forbiddenPage({user}): 403 for a logged-in user who isn't an admin.
export function forbiddenPage({ user = null } = {}) {
  return layout({
    title: "Admins only",
    user,
    body: errorState({
      title: "Admins only",
      text: "You need an admin account to see this page.",
      action: { href: "/", label: "Back to events" },
    }),
  });
}

// readmePage({html, user}): README rendered inside the shared layout, untouched.
export function readmePage({ html, user = null }) {
  return layout({
    title: "About Quad",
    user,
    body: `<article class="prose readme">
      ${html}
    </article>`,
  });
}
