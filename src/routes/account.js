// Account area: your profile, other people's public profiles, and settings.
// Each settings section posts to its own endpoint so a validation error only
// re-renders that section's fields. req.user comes from the onRequest hook in
// server.js (signed `session` cookie holding users.token).
import {
  findUserByUsername,
  updateProfile,
  updatePreferences,
  setPassword,
  rotateToken,
  eventsCheckedInBy,
  splitInterests,
  usernameError,
  LIMITS,
  THEMES,
} from "../db.js";
import { hashPassword, verifyPassword } from "../auth.js";
import { notFoundPage } from "../views.js";
import { profilePage, settingsPage, LANGUAGES, TIMEZONES } from "../account-views.js";
import { html, field } from "./util.js";

const URL_RE = /^https?:\/\/\S+$/i;

// Anonymous visitors log in first and come back to where they were heading.
const LOGIN_FOR_PROFILE = "/login?next=/profile";
const LOGIN_FOR_SETTINGS = "/login?next=/settings";

export default async function accountRoutes(app) {
  app.get("/profile", async (req, reply) => {
    if (!req.user) return reply.redirect(LOGIN_FOR_PROFILE);
    html(
      reply,
      200,
      profilePage({ viewer: req.user, profile: req.user, events: eventsCheckedInBy(req.user.token), isOwn: true }),
    );
  });

  app.get("/profile/:username", async (req, reply) => {
    const profile = findUserByUsername(req.params.username);
    if (!profile) {
      return html(reply, 404, notFoundPage({ user: req.user, text: "There's no one with that username." }));
    }
    const isOwn = !!req.user && req.user.token === profile.token;
    html(
      reply,
      200,
      profilePage({ viewer: req.user, profile, events: eventsCheckedInBy(profile.token), isOwn }),
    );
  });

  app.get("/settings", async (req, reply) => {
    if (!req.user) return reply.redirect(LOGIN_FOR_SETTINGS);
    // settingsPage only shows its own fixed messages, so the raw value is safe.
    html(reply, 200, settingsPage({ user: req.user, flash: req.query?.flash }));
  });

  async function saveProfile(req, reply) {
    if (!req.user) return reply.redirect(LOGIN_FOR_SETTINGS);
    const body = req.body ?? {};
    const values = {
      name: field(body, "name"),
      username: field(body, "username"),
      avatar_url: field(body, "avatar_url"),
      bio: field(body, "bio"),
      location: field(body, "location"),
      interests: field(body, "interests"),
    };
    const errors = {};
    if (values.name.length > LIMITS.name) errors.name = `Keep your name to ${LIMITS.name} characters or fewer.`;

    // Blank is allowed and clears the username; db.js stores it lowercase.
    const usernameProblem = usernameError(values.username, req.user.token);
    if (usernameProblem) errors.username = usernameProblem;
    if (values.avatar_url && !URL_RE.test(values.avatar_url)) {
      errors.avatar_url = "Use a link that starts with http:// or https://.";
    }
    if (values.bio.length > LIMITS.bio) errors.bio = `Keep your bio to ${LIMITS.bio} characters or fewer.`;
    if (values.location.length > LIMITS.location) {
      errors.location = `Keep the location to ${LIMITS.location} characters or fewer.`;
    }
    const interests = splitInterests(values.interests);
    if (interests.length > 10) errors.interests = "Add 10 interests at most.";
    else if (interests.some((i) => i.length > 30)) errors.interests = "Each interest needs to be 30 characters or fewer.";

    const fail = () =>
      html(
        reply,
        400,
        settingsPage({ user: req.user, values: { profile: values }, errors: { profile: errors }, tab: "profile" }),
      );
    if (Object.keys(errors).length) return fail();

    try {
      updateProfile(req.user.token, {
        name: values.name,
        username: values.username,
        avatar_url: values.avatar_url,
        bio: values.bio,
        location: values.location,
        interests,
      });
    } catch (err) {
      // Someone claimed the username between the check and the write.
      if (/** @type {any} */ (err)?.errcode === 2067) {
        errors.username = "That username is taken.";
        return fail();
      }
      throw err;
    }
    reply.redirect("/settings?flash=profile#profile");
  }

  app.post("/settings/profile", saveProfile);
  // The plan names POST /settings too; treat it as the profile form.
  app.post("/settings", saveProfile);

  app.post("/settings/preferences", async (req, reply) => {
    if (!req.user) return reply.redirect(LOGIN_FOR_SETTINGS);
    const body = req.body ?? {};
    const values = {
      theme: field(body, "theme"),
      language: field(body, "language"),
      timezone: field(body, "timezone"),
      // An unticked checkbox sends nothing, so absence means off.
      notifications_email: field(body, "notifications_email") === "1" ? "1" : "0",
    };
    const errors = {};
    if (!THEMES.includes(values.theme)) errors.theme = "Pick one of the listed themes.";
    if (!LANGUAGES.some((l) => l.value === values.language)) errors.language = "Pick one of the listed languages.";
    if (!TIMEZONES.includes(values.timezone)) errors.timezone = "Pick one of the listed time zones.";
    if (Object.keys(errors).length) {
      return html(
        reply,
        400,
        settingsPage({
          user: req.user,
          values: { preferences: values },
          errors: { preferences: errors },
          tab: "preferences",
        }),
      );
    }
    updatePreferences(req.user.token, values);
    reply.redirect("/settings?flash=preferences#preferences");
  });

  app.post("/settings/password", async (req, reply) => {
    if (!req.user) return reply.redirect(LOGIN_FOR_SETTINGS);
    const body = req.body ?? {};
    // Passwords are never trimmed and never echoed back into the form.
    const current = field(body, "current_password", { trim: false });
    const next = field(body, "new_password", { trim: false });
    const confirm = field(body, "confirm_password", { trim: false });
    const errors = {};
    if (!current || !verifyPassword(current, req.user.password_hash)) {
      errors.current_password = "That isn't your current password.";
    }
    if (next.length < 8) errors.new_password = "Use at least 8 characters.";
    else if (next !== confirm) errors.confirm_password = "The two new passwords don't match.";
    if (Object.keys(errors).length) {
      return html(reply, 400, settingsPage({ user: req.user, errors: { security: errors }, tab: "security" }));
    }
    setPassword(req.user.token, hashPassword(next));
    // A new password ends every other session: rotating the token breaks the
    // old cookies, and this device gets a cookie for the new token.
    const token = rotateToken(req.user.token);
    if (token) reply.setCookie("session", token, { path: "/", httpOnly: true, signed: true, sameSite: "lax" });
    reply.redirect("/settings?flash=password#security");
  });

  app.post("/settings/logout-everywhere", async (req, reply) => {
    if (!req.user) return reply.redirect(LOGIN_FOR_SETTINGS);
    // Every session cookie holds the old token, so once it's rotated no
    // device (this one included) matches a user any more.
    rotateToken(req.user.token);
    reply.clearCookie("session", { path: "/" });
    reply.redirect("/login");
  });
}

