// Small helpers shared by the route modules.

export function html(reply, code, body) {
  reply.code(code).type("text/html").send(body);
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
