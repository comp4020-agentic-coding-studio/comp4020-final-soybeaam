// Profile and settings pages. Markup only: routes/account.js does the
// validation and passes values/errors in. Nothing here ever prints a token or
// a password hash, and the email is only shown on your own profile.
import {
  escape,
  displayName,
  layout,
  avatar,
  flashToast,
  formatDate,
  modal,
  tabs,
  toast,
  emptyState,
  loadingButton,
  pageHeader,
  card,
  formField,
} from "./views.js";
import { parseInterests, LIMITS } from "./db.js";

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
];

export const TIMEZONES = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Adelaide",
  "Australia/Darwin",
  "Australia/Hobart",
  "Australia/Perth",
  "Pacific/Auckland",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

const THEME_OPTIONS = [
  { value: "system", label: "Match my device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function eventList(events, isOwn) {
  if (!events.length) {
    return emptyState({
      title: "No check-ins yet",
      text: isOwn ? "Events you check in to will show up here." : "This person hasn't checked in to any events yet.",
      action: isOwn ? { href: "/", label: "Browse events" } : undefined,
    });
  }
  // Only title, date and place (eventsCheckedInBy returns nothing else).
  return `<ul class="row-list">${events
    .map(
      (e) => `<li class="row-list-item">
        <a class="profile-event-title" href="/events/${escape(e.slug)}">${escape(e.title)}</a>
        <span class="muted">${escape(e.event_date || "Date TBA")} · ${escape(e.location || "Location TBA")}</span>
      </li>`,
    )
    .join("")}</ul>`;
}

// profilePage({viewer, profile, events, isOwn}): read-only profile. viewer is
// the logged-in user (or null), profile the user being shown.
export function profilePage({ viewer, profile, events, isOwn }) {
  const name = displayName(profile);
  const interests = parseInterests(profile.interests);
  const joined = formatDate(profile.created_at);
  const facts = [
    profile.location ? `<li><span class="profile-fact-label">Location</span> ${escape(profile.location)}</li>` : "",
    joined ? `<li><span class="profile-fact-label">Joined</span> ${escape(joined)}</li>` : "",
    isOwn ? `<li><span class="profile-fact-label">Email</span> ${escape(profile.email)}</li>` : "",
  ].join("");

  const hero = `<section class="panel profile-hero">
    ${avatar(profile, "xl")}
    <div class="profile-id">
      <div class="cluster">
        <h1 class="profile-name">${escape(name)}</h1>
        ${profile.role === "admin" ? `<span class="badge badge-accent">Admin</span>` : ""}
      </div>
      ${profile.username ? `<p class="profile-handle muted">@${escape(profile.username)}</p>` : ""}
      ${profile.bio ? `<p class="profile-bio">${escape(profile.bio)}</p>` : isOwn ? `<p class="muted">No bio yet.</p>` : ""}
      ${facts ? `<ul class="profile-facts">${facts}</ul>` : ""}
      ${
        interests.length
          ? `<ul class="profile-interests cluster" aria-label="Interests">${interests
              .map((i) => `<li class="badge">${escape(i)}</li>`)
              .join("")}</ul>`
          : ""
      }
    </div>
    ${isOwn ? `<div class="profile-actions"><a class="button button-secondary" href="/settings">Edit profile</a></div>` : ""}
  </section>`;

  return layout({
    title: isOwn ? "Your profile" : name,
    user: viewer,
    active: isOwn ? "profile" : "",
    body: `<div class="profile-page stack-lg stack">
      ${hero}
      ${card({ title: `Checked in (${events.length})`, body: eventList(events, isOwn) })}
    </div>`,
  });
}

// Fixed messages for ?flash= keys (see flashToast).
const FLASH = {
  profile: { text: "Profile saved.", kind: "success" },
  preferences: { text: "Preferences saved.", kind: "success" },
  password: { text: "Password changed. Other devices have been logged out.", kind: "success" },
};

function profileForm(values, errors) {
  return `<form class="form-card" method="post" action="/settings/profile#profile" data-loading novalidate>
    <div class="field-row">
      ${formField({
        label: "Name",
        name: "name",
        value: values.name,
        error: errors.name,
        attrs: `maxlength="${LIMITS.name}" autocomplete="name"`,
      })}
      ${formField({
        label: "Username",
        name: "username",
        value: values.username,
        error: errors.username,
        hint: `2 to ${LIMITS.username} characters: letters, numbers, dots, dashes or underscores.`,
        attrs: `maxlength="${LIMITS.username}" autocomplete="username" autocapitalize="none" spellcheck="false"`,
      })}
    </div>
    ${formField({
      label: "Avatar URL",
      name: "avatar_url",
      type: "url",
      value: values.avatar_url,
      error: errors.avatar_url,
      hint: "Link to an image starting with http:// or https://. Leave blank to use your initials.",
      placeholder: "https://",
    })}
    ${formField({
      label: "Bio",
      name: "bio",
      type: "textarea",
      rows: 4,
      value: values.bio,
      error: errors.bio,
      hint: `Up to ${LIMITS.bio} characters.`,
      attrs: `maxlength="${LIMITS.bio}" data-char-count="${LIMITS.bio}"`,
    })}
    ${formField({
      label: "Location",
      name: "location",
      value: values.location,
      error: errors.location,
      placeholder: "Canberra, ACT",
      attrs: `maxlength="${LIMITS.location}"`,
    })}
    ${formField({
      label: "Interests",
      name: "interests",
      value: values.interests,
      error: errors.interests,
      hint: "Separate with commas. Up to 10, each 30 characters or fewer.",
      placeholder: "Trivia, Sport, Music",
      attrs: `data-interests-input`,
    })}
    <ul class="cluster account-chip-preview" data-interests-preview aria-label="Interests preview" hidden></ul>
    <div class="form-actions">${loadingButton("Save profile", { loadingLabel: "Saving..." })}</div>
  </form>`;
}

function preferencesForm(values, errors) {
  const notify = String(values.notifications_email) !== "0";
  return `<form class="form-card" method="post" action="/settings/preferences#preferences" data-loading>
    ${formField({ label: "Theme", name: "theme", type: "select", options: THEME_OPTIONS, value: values.theme, error: errors.theme })}
    <div class="field-row">
      ${formField({ label: "Language", name: "language", type: "select", options: LANGUAGES, value: values.language, error: errors.language })}
      ${formField({ label: "Time zone", name: "timezone", type: "select", options: TIMEZONES, value: values.timezone, error: errors.timezone })}
    </div>
    <label class="check">
      <input type="checkbox" name="notifications_email" value="1"${notify ? " checked" : ""} />
      Email me about events I've checked in to
    </label>
    <div class="form-actions">${loadingButton("Save preferences", { loadingLabel: "Saving..." })}</div>
  </form>`;
}

function securitySection(errors) {
  // The fallback form posts straight away without JS. With JS, the button's
  // data-modal-open makes the shared script open the confirm dialog instead.
  return `<div class="stack-lg stack">
    <form class="form-card" method="post" action="/settings/password#security" data-loading>
      <h2 class="panel-title">Change password</h2>
      ${formField({
        label: "Current password",
        name: "current_password",
        type: "password",
        error: errors.current_password,
        attrs: `autocomplete="current-password"`,
        required: true,
      })}
      ${formField({
        label: "New password",
        name: "new_password",
        type: "password",
        error: errors.new_password,
        hint: "At least 8 characters.",
        attrs: `autocomplete="new-password" minlength="8"`,
        required: true,
      })}
      ${formField({
        label: "Confirm new password",
        name: "confirm_password",
        type: "password",
        error: errors.confirm_password,
        attrs: `autocomplete="new-password"`,
        required: true,
      })}
      <div class="form-actions">${loadingButton("Change password", { loadingLabel: "Changing..." })}</div>
    </form>
    <form class="form-card" method="post" action="/settings/logout-everywhere">
      <h2 class="panel-title">Log out everywhere</h2>
      <p class="muted">Ends every session on every device, including this one. You'll need to log in again.</p>
      <div class="form-actions">
        <button type="submit" class="button button-danger" data-modal-open="logout-everywhere">Log out everywhere</button>
      </div>
    </form>
  </div>`;
}

const logoutModal = () =>
  modal({
    id: "logout-everywhere",
    title: "Log out everywhere?",
    body: `<p>This logs you out on every device and browser, including this one. You'll go to the login page next.</p>`,
    footer: `<button type="button" class="button button-ghost" data-modal-close>Cancel</button>
      <form class="form-inline" method="post" action="/settings/logout-everywhere">
        <button type="submit" class="button button-danger">Log out everywhere</button>
      </form>`,
  });

// Live bio counter and interests preview. Built with textContent only.
const SETTINGS_SCRIPT = `<script>
(function () {
  var d = document;
  d.querySelectorAll("[data-char-count]").forEach(function (el) {
    var max = Number(el.getAttribute("data-char-count")) || 0;
    var out = d.createElement("p");
    out.className = "field-hint account-count";
    out.setAttribute("aria-live", "polite");
    el.insertAdjacentElement("afterend", out);
    function update() { out.textContent = el.value.length + " / " + max; }
    el.addEventListener("input", update);
    update();
  });
  var input = d.querySelector("[data-interests-input]");
  var preview = d.querySelector("[data-interests-preview]");
  if (input && preview) {
    var render = function () {
      while (preview.firstChild) preview.removeChild(preview.firstChild);
      var seen = {};
      input.value.split(",").forEach(function (s) {
        var t = s.trim();
        if (!t || seen[t.toLowerCase()]) return;
        seen[t.toLowerCase()] = true;
        var li = d.createElement("li");
        li.className = "badge";
        li.textContent = t;
        preview.appendChild(li);
      });
      preview.hidden = !preview.firstChild;
    };
    input.addEventListener("input", render);
    render();
  }
})();
</script>`;

// settingsPage({user, values, errors, flash, tab}): values/errors are keyed by
// section ("profile", "preferences", "security"). Sections without values fall
// back to the saved user row. tab names the section that failed, if any.
export function settingsPage({ user, values = {}, errors = {}, flash = "", tab = "" }) {
  const profileValues = values.profile ?? {
    name: user.name ?? "",
    username: user.username ?? "",
    avatar_url: user.avatar_url ?? "",
    bio: user.bio ?? "",
    location: user.location ?? "",
    interests: parseInterests(user.interests).join(", "),
  };
  const prefValues = values.preferences ?? {
    theme: user.theme,
    language: user.language,
    timezone: user.timezone,
    notifications_email: user.notifications_email,
  };
  const hasErrors = Object.keys(errors).some((k) => Object.keys(errors[k] || {}).length);

  // The form actions carry #tab so the browser lands on the right tab after a
  // failed POST. This sets it as well, in case the fragment was dropped.
  const tabFix =
    tab && hasErrors
      ? `<script>if (!location.hash) history.replaceState(null, "", "#${escape(tab)}");</script>`
      : "";

  return layout({
    title: "Settings",
    user,
    active: "settings",
    body: `
      ${flashToast(FLASH, flash)}
      ${hasErrors ? toast("Some fields need fixing. See the messages below.", "error") : ""}
      ${pageHeader({
        title: "Settings",
        subtitle: "Your profile, preferences and account security.",
        actions: `<a class="button button-ghost" href="/profile">View profile</a>`,
      })}
      ${tabFix}
      ${tabs(
        [
          { id: "profile", label: "Profile", content: profileForm(profileValues, errors.profile ?? {}) },
          { id: "preferences", label: "Preferences", content: preferencesForm(prefValues, errors.preferences ?? {}) },
          { id: "security", label: "Security", content: securitySection(errors.security ?? {}) },
        ],
        { label: "Settings sections" },
      )}
      ${logoutModal()}
      ${SETTINGS_SCRIPT}
    `,
  });
}
