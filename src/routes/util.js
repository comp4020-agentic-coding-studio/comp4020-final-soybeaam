// Small helpers shared by the route modules.

export function html(reply, code, body) {
  reply.code(code).type("text/html").send(body);
}

// A redirect target is only accepted if it is a path on this site: it must
// start with a single "/", and may not contain a backslash or control
// characters (browsers treat "/\evil.com" like "//evil.com"). Returns "" if not.
export function safeNext(value) {
  if (typeof value !== "string" || value.length > 512) return "";
  if (!value.startsWith("/") || value.startsWith("//")) return "";
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return "";
  return value;
}

// Where to send someone back to after a form post: the Referer's path, but
// only if it points at this host and passes safeNext. Otherwise fallback.
export function backTo(req, fallback) {
  const ref = req.headers.referer;
  if (typeof ref !== "string" || !ref) return fallback;
  try {
    const url = new URL(ref);
    if (url.host !== req.headers.host) return fallback;
    return safeNext(url.pathname + url.search) || fallback;
  } catch {
    return fallback;
  }
}

// True when the client asked for JSON (fetch with Accept: application/json).
export function wantsJson(req) {
  return String(req.headers.accept ?? "").includes("application/json");
}

// A form or query field as a string ("" if missing). Formbody turns repeated
// keys into arrays, so take the first value rather than stringifying the
// array. Trimmed unless {trim: false} (passwords).
export function field(body, key, { trim = true } = {}) {
  let v = body?.[key];
  if (Array.isArray(v)) v = v[0];
  if (v === undefined || v === null) return "";
  return trim ? String(v).trim() : String(v);
}
