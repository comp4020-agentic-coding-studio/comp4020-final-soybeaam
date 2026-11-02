import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { forbiddenPage } from "./views.js";

// Password hashing with node:crypto's scrypt, so there's no extra dependency.
// Stored form: "scrypt$<saltHex>$<hashHex>". The prefix leaves room to change
// the algorithm later without guessing what an old row was hashed with.
const KEY_LENGTH = 64;

export function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(pw), salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

// False for anything that isn't a well-formed scrypt hash, including NULL
// (users created before passwords existed have no hash and can't log in).
export function verifyPassword(pw, stored) {
  if (typeof pw !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltHex, hashHex] = parts;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;
  const actual = scryptSync(pw, Buffer.from(saltHex, "hex"), KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}

// The literal admin/admin dev login is only allowed locally. Fly sets
// FLY_APP_NAME on every machine, so it is never live on the deployed app.
export const DEV_ADMIN_ENABLED =
  !process.env.FLY_APP_NAME && process.env.NODE_ENV !== "production";

// Options for every `session` cookie write (login, signup, admin login,
// password change), so the four call sites can't drift apart. `secure` is
// only on when deployed (same FLY_APP_NAME signal as above): Fly serves the
// app over HTTPS, while local dev is plain http, where a secure cookie would
// never be sent back and login would silently break.
export function sessionCookieOptions() {
  return { path: "/", httpOnly: true, signed: true, sameSite: "lax", secure: !!process.env.FLY_APP_NAME };
}

// Client key for rate limiting. On Fly every request arrives from Fly's
// proxy, so req.ip is the same for everyone; Fly puts the real client
// address in Fly-Client-IP, which Fly's docs recommend over parsing
// X-Forwarded-For (fly.io/docs/networking/request-headers). Off Fly the
// header is ignored, since nothing trusted sets it there.
export function clientIp(req) {
  const flyIp = process.env.FLY_APP_NAME ? req.headers["fly-client-ip"] : undefined;
  return typeof flyIp === "string" && flyIp ? flyIp : req.ip;
}

// Plain guard for admin routes, called at the top of a handler:
//   if (!requireAdmin(req, reply)) return;
// Anonymous visitors go to the admin login; logged-in non-admins get a 403.
export function requireAdmin(req, reply) {
  if (!req.user) {
    reply.redirect("/admin/login");
    return false;
  }
  if (req.user.role !== "admin") {
    reply.code(403).type("text/html").send(forbiddenPage({ user: req.user }));
    return false;
  }
  return true;
}
