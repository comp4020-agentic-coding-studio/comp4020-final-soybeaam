// Lists every social_queries row with when it last ran and its last error.
// Usage: pnpm social:list
import { listSocialQueries } from "../db.js";

const rows = listSocialQueries();
if (!rows.length) {
  console.log("no social queries (add one with pnpm social:add <platform> <kind> <value> [event_slug])");
}
for (const q of rows) {
  const event = q.event_slug ? ` event=${q.event_slug}` : "";
  const ran = q.last_run_at ?? "never";
  const err = q.last_error ? ` error="${q.last_error}"` : "";
  console.log(`#${q.id} ${q.platform} ${q.kind} "${q.value}"${event} last_run=${ran}${err}`);
}
