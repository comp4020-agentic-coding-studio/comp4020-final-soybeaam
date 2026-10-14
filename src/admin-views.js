// Admin-only markup: the dev admin login, the dashboard and the user edit
// page. Kept apart from views.js so user-facing pages never import it.
// Rows from listUsers carry token and password_hash; every renderer here
// picks fields by name and never spreads a row into markup.
import {
  escape,
  displayName,
  layout,
  avatar,
  flashToast,
  formatDate,
  emptyState,
  errorState,
  loadingButton,
  pageHeader,
  statCard,
  formField,
} from "./views.js";

export const ROLE_OPTIONS = [
  { value: "", label: "All roles" },
  { value: "user", label: "Users" },
  { value: "admin", label: "Admins" },
];

export const SORT_OPTIONS = [
  { value: "created", label: "Newest first" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "checkins", label: "Most check-ins" },
];

// Fixed messages for ?flash= keys, so query text is never echoed back.
const FLASH = {
  "user-updated": { text: "User details saved.", kind: "success" },
};

// The id used in admin URLs: username if set, otherwise email. Never the token.
function userKey(u) {
  return u.username || u.email;
}

function editHref(u) {
  return `/admin/users/${encodeURIComponent(userKey(u))}/edit`;
}

// s is SQLite UTC ("2026-10-08 03:15:00"); "T" + "Z" makes it an ISO datetime.
function timeTag(s) {
  const plain = formatDate(s);
  if (!plain) return "";
  return `<time datetime="${escape(String(s).replace(" ", "T") + "Z")}" title="${escape(plain)}">${escape(
    formatDate(s, { relative: true }),
  )}</time>`;
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

// adminLoginPage({user, error, username}): dev-only login form.
export function adminLoginPage({ user = null, error = "", username = "" } = {}) {
  const body = `<div class="admin-login">
    ${pageHeader({ eyebrow: "Admin", title: "Admin login" })}
    <div class="callout callout-warning admin-dev-banner" role="note">
      <strong>Development only:</strong> this login accepts admin / admin and is turned off on the deployed site.
    </div>
    <form method="post" action="/admin/login" class="form-block stack" data-loading novalidate>
      ${error ? `<div class="callout callout-error" role="alert">${escape(error)}</div>` : ""}
      ${formField({
        label: "Username or email",
        name: "username",
        value: username,
        required: true,
        attrs: `autocomplete="username" autocapitalize="none" spellcheck="false"`,
      })}
      ${formField({
        label: "Password",
        name: "password",
        type: "password",
        required: true,
        attrs: `autocomplete="current-password"`,
      })}
      <div class="cluster">${loadingButton("Log in", { loadingLabel: "Logging in" })}</div>
    </form>
    <p class="muted">An admin account with a password can also log in here, or through the normal <a href="/login">login page</a>.</p>
  </div>`;
  return layout({ title: "Admin login", user, body, active: "admin" });
}

// adminLoginDisabledPage({user}): shown instead of the form when the dev login is off.
export function adminLoginDisabledPage({ user = null } = {}) {
  return layout({
    title: "Admin login unavailable",
    user,
    body: errorState({
      title: "Admin login is turned off here",
      text: "The admin / admin login only works in local development. Admins on this site log in through the normal login page.",
      action: { href: "/login", label: "Go to login" },
    }),
  });
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

function statsRow(s) {
  return `<div class="grid grid-stats">
    ${statCard({ label: "Users", value: s.users, hint: `${s.admins} ${s.admins === 1 ? "admin" : "admins"}` })}
    ${statCard({ label: "Events", value: s.events })}
    ${statCard({ label: "Check-ins", value: s.checkins })}
    ${statCard({ label: "Check-ins this week", value: s.checkins_last_7_days, hint: "Last 7 days" })}
  </div>`;
}

function checkinItem(c) {
  const who = escape(displayName({ name: c.user_name, username: c.user_username, email: c.user_email }));
  const what = c.event_title
    ? `<a href="/events/${encodeURIComponent(c.event_slug)}">${escape(c.event_title)}</a>`
    : `<span class="muted">a removed event</span>`;
  return `<li class="row-list-item">
    <span>${who} checked in to ${what}</span>
    <span class="muted small nowrap">${timeTag(c.created_at)}</span>
  </li>`;
}

function eventItem(e) {
  // Seeded events have no host; displayName would fall back to "Account".
  const host = e.host_name || e.host_email ? displayName({ name: e.host_name, email: e.host_email }) : "";
  return `<li class="row-list-item">
    <span><a href="/events/${encodeURIComponent(e.slug)}">${escape(e.title)}</a>${
      host ? ` <span class="muted">hosted by ${escape(host)}</span>` : ""
    }</span>
    <span class="muted small nowrap">${timeTag(e.created_at)}</span>
  </li>`;
}

function activityPanels(activity) {
  const list = (items, render, empty) =>
    items.length
      ? `<ul class="row-list">${items.map(render).join("")}</ul>`
      : `<p class="muted">${escape(empty)}</p>`;
  return `<div class="grid grid-2 section">
    <section class="panel">
      <h2 class="panel-title">Recent check-ins</h2>
      <div class="panel-body">${list(activity.checkins, checkinItem, "No check-ins yet.")}</div>
    </section>
    <section class="panel">
      <h2 class="panel-title">New events</h2>
      <div class="panel-body">${list(activity.events, eventItem, "No events yet.")}</div>
    </section>
  </div>`;
}

function filterForm({ q, role, sort }) {
  const filtered = Boolean(q || role || (sort && sort !== "created"));
  return `<form method="get" action="/admin" class="form-inline admin-filters" role="search" aria-label="Filter users">
    ${formField({ label: "Search", name: "q", type: "search", value: q, placeholder: "Name, username or email", id: "admin-q" })}
    ${formField({ label: "Role", name: "role", type: "select", value: role, options: ROLE_OPTIONS, id: "admin-role" })}
    ${formField({ label: "Sort by", name: "sort", type: "select", value: sort || "created", options: SORT_OPTIONS, id: "admin-sort" })}
    <div class="cluster">
      <button type="submit" class="button button-secondary">Apply</button>
      ${filtered ? `<a class="button button-ghost" href="/admin">Clear</a>` : ""}
    </div>
  </form>`;
}

function userRow(u, me) {
  const isMe = me && u.email === me.email;
  return `<tr>
    <td>
      <div class="admin-user-cell">
        ${avatar({ name: u.name, username: u.username, email: u.email, avatar_url: u.avatar_url }, "sm")}
        <span>${escape(displayName(u))}${isMe ? ` <span class="muted">(you)</span>` : ""}</span>
      </div>
    </td>
    <td>${u.username ? `@${escape(u.username)}` : `<span class="muted">none</span>`}</td>
    <td>${escape(u.email)}</td>
    <td>${
      u.role === "admin" ? `<span class="badge badge-accent">Admin</span>` : `<span class="badge">User</span>`
    }</td>
    <td class="num">${escape(u.checkin_count)}</td>
    <td>${escape(formatDate(u.created_at))}</td>
    <td><a class="button button-sm button-secondary" href="${escape(editHref(u))}">Edit<span class="visually-hidden"> ${escape(
      displayName(u),
    )}</span></a></td>
  </tr>`;
}

function usersTable(users, me) {
  return `<div class="table-wrap">
    <table class="table admin-users-table">
      <caption class="visually-hidden">Users</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Username</th>
          <th scope="col">Email</th>
          <th scope="col">Role</th>
          <th scope="col" class="num">Check-ins</th>
          <th scope="col">Joined</th>
          <th scope="col"><span class="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>${users.map((u) => userRow(u, me)).join("")}</tbody>
    </table>
  </div>`;
}

// adminDashboardPage({user, stats, activity, users, filters, flash})
export function adminDashboardPage({ user, stats, activity, users, filters = {}, flash = "" }) {
  const { q = "", role = "", sort = "" } = filters;
  const count = `${users.length} ${users.length === 1 ? "user" : "users"}`;
  const body = `${flashToast(FLASH, flash)}
    ${pageHeader({ eyebrow: "Admin", title: "Dashboard", subtitle: "Accounts, events and check-ins across Quad." })}
    ${statsRow(stats)}
    ${activityPanels(activity)}
    <section class="section" aria-labelledby="admin-users-heading">
      <div class="split section-head">
        <h2 id="admin-users-heading">Users</h2>
        <span class="muted small">${escape(count)}</span>
      </div>
      ${filterForm({ q, role, sort })}
      ${
        users.length
          ? usersTable(users, user)
          : emptyState({
              title: "No users match",
              text: "Try a different search or role filter.",
              action: { href: "/admin", label: "Show all users" },
            })
      }
    </section>`;
  return layout({ title: "Admin", user, body, active: "admin" });
}

/* ------------------------------------------------------------------ */
/* Edit user                                                           */
/* ------------------------------------------------------------------ */

// adminEditUserPage({user, target, id, values, errors, formError})
// target: the row being edited (for read-only details). id: the URL key it was
// loaded by, so a failed save posts back to the same address even if the
// username field was changed. values: what goes in the inputs.
export function adminEditUserPage({ user, target, id, values, errors = {}, formError = "" }) {
  const isSelf = target.email === user.email;
  const body = `${pageHeader({
    eyebrow: "Admin",
    title: `Edit ${displayName(target)}`,
    subtitle: `Joined ${formatDate(target.created_at)} · ${target.checkin_count ?? 0} check-ins`,
    actions: `<a class="button button-ghost" href="/admin">Back to dashboard</a>`,
  })}
    <form method="post" action="/admin/users/${escape(encodeURIComponent(id))}" class="form-card" data-loading novalidate>
      ${formError ? `<div class="callout callout-error" role="alert">${escape(formError)}</div>` : ""}
      ${avatar({ name: target.name, username: target.username, email: target.email, avatar_url: target.avatar_url }, "lg")}
      ${formField({ label: "Name", name: "name", value: values.name, error: errors.name })}
      ${formField({
        label: "Username",
        name: "username",
        value: values.username,
        error: errors.username,
        hint: "2 to 32 letters, numbers, dots, dashes or underscores. Leave blank for none.",
        attrs: `autocapitalize="none" spellcheck="false"`,
      })}
      ${formField({ label: "Email", name: "email", type: "email", value: values.email, error: errors.email, required: true })}
      ${formField({
        label: "Role",
        name: "role",
        type: "select",
        value: values.role,
        error: errors.role,
        options: [
          { value: "user", label: "User" },
          { value: "admin", label: "Admin" },
        ],
        hint: isSelf ? "You can't remove your own admin role." : "",
      })}
      ${formField({ label: "Bio", name: "bio", type: "textarea", value: values.bio, error: errors.bio, rows: 3 })}
      ${formField({ label: "Location", name: "location", value: values.location, error: errors.location })}
      <div class="cluster">
        ${loadingButton("Save changes", { loadingLabel: "Saving" })}
        <a class="button button-ghost" href="/admin">Cancel</a>
      </div>
    </form>`;
  return layout({ title: `Edit ${displayName(target)}`, user, body, active: "admin" });
}
