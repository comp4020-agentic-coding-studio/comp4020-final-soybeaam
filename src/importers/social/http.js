// Shared fetch helper for the social connectors (ADR 0003, step 2). Every
// connector call goes through requestJson() so the rules live in one place:
// a 10 s timeout, a descriptive User-Agent, status-bearing error messages,
// and never throwing. Error strings never include the request URL, since
// some platforms (YouTube) carry the API key in the query string.

export const USER_AGENT = "Quad/1.0 (COMP4020 student project)";
export const MAX_RESULTS = 25;
export const SEARCH_KINDS = ["hashtag", "keyword"];

// Replaces any secret value that sneaks into a message (e.g. echoed back in
// an error body) with "***".
export function redact(message, secrets = []) {
  let out = String(message ?? "");
  for (const secret of secrets) {
    if (secret && String(secret).length >= 4) out = out.split(String(secret)).join("***");
  }
  return out;
}

// Returns { data } on a 2xx JSON response, otherwise { error }. `secrets`
// are scrubbed from any error text.
export async function requestJson(url, { method = "GET", headers = {}, body, secrets = [] } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const reason = err?.name === "TimeoutError" ? "timed out" : (err?.message ?? String(err));
    return { error: redact(`network error: ${reason}`, secrets) };
  }

  // Status first: a CDN 403/429 page is HTML, and parsing it as JSON would
  // hide the real cause behind a parse error.
  if (!res.ok) {
    const hint = res.status === 429 ? " (rate limited)" : res.status === 401 || res.status === 403 ? " (auth refused)" : "";
    return { error: `HTTP ${res.status}${hint}` };
  }

  try {
    return { data: await res.json() };
  } catch {
    return { error: "malformed JSON response" };
  }
}

// Runs mapItem over each item, dropping nulls and anything that throws, so
// one bad item never drops the batch. Caps at MAX_RESULTS.
export function mapAll(items, mapItem) {
  if (!Array.isArray(items)) return [];
  const posts = [];
  for (const item of items) {
    if (posts.length >= MAX_RESULTS) break;
    try {
      const mapped = mapItem(item);
      if (mapped) posts.push(mapped);
    } catch {
      // skip this item only
    }
  }
  return posts;
}

export function stripHash(value) {
  return String(value ?? "").trim().replace(/^#/, "");
}

// Which of `names` are unset or blank in env (for the orchestrator's
// "not configured: NAME, NAME" message).
export function missingEnv(env, names) {
  return names.filter((name) => !env?.[name] || !String(env[name]).trim());
}
