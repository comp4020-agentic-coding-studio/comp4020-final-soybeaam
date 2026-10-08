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
