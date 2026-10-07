// Social import orchestrator (ADR 0003, step 2). Runs every social_queries
// row through its platform connector, cleans each post with normalisePost(),
// and upserts it. Run from `pnpm import:events`, never on a page view.
// Never throws: one failing query is recorded in last_error and the run
// moves on to the next.
import { listSocialQueries, recordSocialQueryRun, upsertSocialPost } from "../../db.js";
import { normalisePost } from "./normalise.js";
import { missingEnv } from "./http.js";
import * as youtube from "./youtube.js";
import * as reddit from "./reddit.js";
import * as bluesky from "./bluesky.js";
import * as mastodon from "./mastodon.js";
import * as x from "./x.js";
import * as instagram from "./instagram.js";
import * as facebook from "./facebook.js";

export const CONNECTORS = { youtube, reddit, bluesky, mastodon, x, instagram, facebook };

function safeRecord(id, error) {
  try {
    recordSocialQueryRun(id, error);
  } catch {
    // a failed bookkeeping write shouldn't stop the run
  }
}

async function runOne(query, env, log) {
  const label = `[social] ${query.platform} ${query.kind} "${query.value}"`;
  const result = { id: query.id, platform: query.platform, kind: query.kind, value: query.value, stored: 0, skipped: 0, error: null };

  const connector = CONNECTORS[query.platform];
  if (!connector) {
    result.error = `unknown platform: ${query.platform}`;
    safeRecord(query.id, result.error);
    log(`${label}: ${result.error}`);
    return result;
  }

  // isConfigured takes the kind too: Bluesky profile needs no credentials
  // but its search kinds do.
  if (!connector.isConfigured(env, query.kind)) {
    const names = missingEnv(env, connector.REQUIRED_ENV ?? []);
    result.error = `not configured: ${names.join(", ") || "missing credentials"}`;
    safeRecord(query.id, result.error);
    log(`${label}: skipped, ${result.error}`);
    return result;
  }

  if (!connector.SUPPORTED_KINDS.includes(query.kind)) {
    result.error = `unsupported kind: ${query.kind}`;
    safeRecord(query.id, result.error);
    log(`${label}: ${result.error}`);
    return result;
  }

  let posts = [];
  try {
    const fetched = await connector.fetchPosts(query, env);
    posts = Array.isArray(fetched?.posts) ? fetched.posts : [];
    result.error = fetched?.error ?? null;
  } catch (err) {
    // Connectors shouldn't throw, but don't trust that.
    result.error = `connector threw: ${err?.message ?? err}`;
  }

  for (const raw of posts) {
    try {
      const post = normalisePost({ ...raw, event_slug: query.event_slug ?? null, query_id: query.id });
      if (!post) {
        result.skipped++;
        continue;
      }
      upsertSocialPost(post);
      result.stored++;
    } catch {
      result.skipped++;
    }
  }

  safeRecord(query.id, result.error ?? null);
  log(`${label}: stored ${result.stored}, skipped ${result.skipped}${result.error ? `, error: ${result.error}` : ""}`);
  return result;
}

export async function runSocialImport({ env = process.env, log = console.log } = {}) {
  const summary = [];
  let queries = [];
  try {
    queries = listSocialQueries();
  } catch (err) {
    log(`[social] could not list queries: ${err?.message ?? err}`);
    return summary;
  }
  if (!queries.length) log("[social] no queries configured (add one with pnpm social:add)");
  for (const query of queries) {
    try {
      summary.push(await runOne(query, env, log));
    } catch (err) {
      summary.push({ id: query?.id, platform: query?.platform, stored: 0, skipped: 0, error: String(err?.message ?? err) });
    }
  }
  return summary;
}
