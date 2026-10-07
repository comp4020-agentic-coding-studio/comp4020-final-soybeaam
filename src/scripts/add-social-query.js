// Adds one social_queries row (ADR 0003). Queries are data, not code.
// Usage: pnpm social:add <platform> <kind> <value> [event_slug]
import { addSocialQuery, getEvent } from "../db.js";
import { PLATFORMS } from "../importers/social/normalise.js";

const KINDS = ["hashtag", "keyword", "profile", "geo"];
const USAGE = `usage: pnpm social:add <platform> <kind> <value> [event_slug]
  platform: ${PLATFORMS.join(" | ")}
  kind:     ${KINDS.join(" | ")}`;

const [platformArg, kindArg, value, eventSlug] = process.argv.slice(2);
const platform = platformArg?.toLowerCase();
const kind = kindArg?.toLowerCase();

function fail(message) {
  if (message) console.error(message);
  console.error(USAGE);
  process.exit(1);
}

if (!platform || !PLATFORMS.includes(platform)) fail(platform ? `unknown platform: ${platform}` : null);
if (!kind || !KINDS.includes(kind)) fail(kind ? `unknown kind: ${kind}` : "missing kind");
if (!value || !value.trim()) fail("missing value");
if (eventSlug && !getEvent(eventSlug)) fail(`no event with slug: ${eventSlug}`);

const row = addSocialQuery({ platform, kind, value: value.trim(), event_slug: eventSlug || null });
console.log(row);
