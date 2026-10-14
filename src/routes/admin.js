// Admin area: /admin/login (dev only), the /admin dashboard and user editing.
// Every route except the login ones starts with requireAdmin. Users are
// addressed by username (or email when they have none) in URLs, never by
// token: users.token is the session cookie value.
import { DEV_ADMIN_ENABLED, requireAdmin, verifyPassword } from "../auth.js";
import {
  findUserByEmail,
  findUserByUsername,
  listUsers,
  updateUserAdmin,
  stats,
  recentActivity,
  checkinCountFor,
  usernameError,
  LIMITS,
} from "../db.js";
import { notFoundPage } from "../views.js";
import {
  adminLoginPage,
  adminLoginDisabledPage,
  adminDashboardPage,
  adminEditUserPage,
  ROLE_OPTIONS,
  SORT_OPTIONS,
} from "../admin-views.js";
import { html, field } from "./util.js";

const EDIT_FIELDS = ["name", "username", "email", "role", "bio", "location"];

// Usernames can't contain "@", so an id with one is an email.
function findUserById(id) {
  const key = String(id ?? "").trim();
  if (!key) return undefined;
  return key.includes("@") ? findUserByEmail(key) : findUserByUsername(key);
}

function setSession(reply, user) {
  // Same signed cookie as POST /login: the session is users.token.
  reply.setCookie("session", user.token, { path: "/", httpOnly: true, signed: true, sameSite: "lax" });
}

function formValues(row) {
  return {
    name: row.name ?? "",
    username: row.username ?? "",
    email: row.email ?? "",
    role: row.role ?? "user",
    bio: row.bio ?? "",
    location: row.location ?? "",
  };
}

// Returns field errors for the submitted values (already trimmed).
function validate(values, target, me) {
  const errors = {};
  if (!values.email.includes("@")) errors.email = "Enter an email address with an @.";
  else if (values.email.length > LIMITS.email) errors.email = "That email is too long.";
  else {
    const other = findUserByEmail(values.email);
    if (other && other.token !== target.token) errors.email = "Another account already uses that email.";
  }
  const usernameProblem = usernameError(values.username, target.token);
  if (usernameProblem) errors.username = usernameProblem;
  if (values.role !== "user" && values.role !== "admin") errors.role = "Pick User or Admin.";
  else if (target.token === me.token && values.role !== "admin") {
    errors.role = "You can't remove your own admin role. Ask another admin to do it.";
  }
  for (const key of ["name", "bio", "location"]) {
    if (values[key].length > LIMITS[key]) errors[key] = `Keep this under ${LIMITS[key]} characters.`;
  }
  return errors;
}

export default async function adminRoutes(app) {
  app.get("/admin/login", async (req, reply) => {
    if (!DEV_ADMIN_ENABLED) return html(reply, 404, adminLoginDisabledPage({ user: req.user }));
    if (req.user?.role === "admin") return reply.redirect("/admin");
    html(reply, 200, adminLoginPage({ user: req.user }));
  });

  app.post("/admin/login", async (req, reply) => {
    if (!DEV_ADMIN_ENABLED) return html(reply, 404, adminLoginDisabledPage({ user: req.user }));
    const username = field(req.body, "username");
    const password = field(req.body, "password", { trim: false });

    let account = null;
    if (username === "admin" && password === "admin") {
      const seeded = findUserByEmail("admin@quad.test");
      if (seeded && seeded.role === "admin") account = seeded;
    }
    if (!account && username && password) {
      const found = findUserById(username.includes("@") ? username.toLowerCase() : username);
      if (found && found.role === "admin" && verifyPassword(password, found.password_hash)) account = found;
    }
    if (!account) {
      return html(
        reply,
        401,
        adminLoginPage({ user: req.user, username, error: "Username or password is incorrect, or that account isn't an admin." }),
      );
    }
    setSession(reply, account);
    reply.redirect("/admin");
  });

  app.get("/admin", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const q = field(req.query, "q").slice(0, 100);
    const role = ROLE_OPTIONS.some((o) => o.value && o.value === req.query.role) ? req.query.role : "";
    const sort = SORT_OPTIONS.some((o) => o.value === req.query.sort) ? req.query.sort : "";
    html(
      reply,
      200,
      adminDashboardPage({
        user: req.user,
        stats: stats(),
        activity: recentActivity(8),
        users: listUsers({ q, role, sort }),
        filters: { q, role, sort },
        // adminDashboardPage only shows its own fixed messages.
        flash: req.query.flash,
      }),
    );
  });

  app.get("/admin/users/:id/edit", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const target = findUserById(req.params.id);
    if (!target) return html(reply, 404, notFoundPage({ user: req.user, text: "No user with that username or email." }));
    html(
      reply,
      200,
      adminEditUserPage({
        user: req.user,
        target: { ...target, checkin_count: checkinCountFor(target.token) },
        id: req.params.id,
        values: formValues(target),
      }),
    );
  });

  app.post("/admin/users/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const target = findUserById(req.params.id);
    if (!target) return html(reply, 404, notFoundPage({ user: req.user, text: "No user with that username or email." }));

    // Fields missing from the body keep their current value.
    const values = formValues(target);
    for (const key of EDIT_FIELDS) {
      if (typeof req.body?.[key] === "string") values[key] = req.body[key].trim();
    }
    values.email = values.email.toLowerCase();

    const page = (code, errors, formError = "") =>
      html(
        reply,
        code,
        adminEditUserPage({
          user: req.user,
          target: { ...target, checkin_count: checkinCountFor(target.token) },
          id: req.params.id,
          values,
          errors,
          formError,
        }),
      );

    const errors = validate(values, target, req.user);
    if (Object.keys(errors).length) return page(400, errors, "Fix the highlighted fields and save again.");

    try {
      updateUserAdmin(target.token, values);
    } catch (err) {
      // Backstop for a race between the uniqueness check and the write.
      if (err?.errcode === 2067) return page(400, {}, "That username or email was just taken. Try another.");
      throw err;
    }
    reply.redirect("/admin?flash=user-updated");
  });
}
