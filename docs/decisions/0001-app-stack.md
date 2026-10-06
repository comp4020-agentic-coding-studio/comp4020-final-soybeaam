# ADR 0001: App stack for the final project

<!-- TEMPLATE: this is a skeleton, not a finished decision record. PROCESS.md
     can link here instead of restating this, per the brief. Fill in the
     reasoning yourself — the "why" is part of what's marked; this file only
     lays out the shape and the facts already true of the running app. -->

## Status

Accepted (week 9) — revisit at week 10/11 if real-time or auth needs outgrow it.

## Context

What does this decision need to satisfy? (the fixed constraints: one
shared-cpu-1x machine, 256 MB memory, one volume at `/data`, HTTP on
`0.0.0.0:$PORT`; plus your own requirements for this app)

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Fastify + `node:sqlite` | One small server process. No native module to compile, so it builds inside the 256 MB image. Persistence is a single file. Fastify has first-class plugins for cookies and, later, WebSockets/SSE. | Single volume, so no horizontal scaling. Email-only identity is weak. I write the data layer by hand (no ORM). |
| Crit 7 astro stack | already familiar; good for mostly-static pages | built for content sites, not a long-lived server holding open connections and writing data |
| Firebase (Firestore + Auth) | Real-time is built in: clients subscribe to a document or query and get pushed changes, so the week 10 requirement would need almost no server code. Auth is built in (email link, Google sign-in), which fixes the weak email-only identity. No server or volume to run. | Realtime, auth and access rules all live inside the vendor. Rules are written in a separate language and are easy to get subtly wrong. Firestore is a document store, so "one check-in per user per event" has to be enforced through document IDs or rules rather than a SQL unique constraint. Tests need the emulator or a live project. Free tier limits and vendor lock-in. It also doesn't fit a project deployed as a container with its own persistent volume. |
## Decision

Fastify with Node's built-in `node:sqlite`, it fits in the image, it keeps persistence
trivial, and a plain Node server is the natural home for the real-time
layer in week 10.

- Server: Fastify (`src/server.js`)
- Persistence: SQLite via `node:sqlite`, file at `/data/app.db`
- Identity: signed cookie set on login (email only, no password)

## Consequences / cost

- **Identity.** Email-only means anyone who knows an address can log in
  as that person. Acceptable for a first version where check-ins are
  low-stakes. It becomes a real problem once payments or host-only
  powers (pin, announce) exist. Upgrading means adding verification
  (emailed magic link at minimum) and changing the login route, but the
  cookie session can stay.
- **Real-time (week 10).** [Your estimate. A starting point: SSE is the
  smaller change, since the server only pushes and Fastify can hold the
  connections open. WebSockets only earn their cost if clients need to
  send over the same channel. Either way it's one process, so an
  in-memory list of open connections works, which is also why scaling
  to several instances would break it.]
- **Scaling.** One SQLite file on one volume means one instance. For
  campus events with a bounded audience this is [your judgement: is it
  a real constraint?]. Revisit if I ever need more than one server.
- **`node:sqlite`.** 
  # what the agent did
Built: Fastify server (src/server.js), node:sqlite DB (src/db.js) on /data/app.db

Stack, confirmed/simplified for week 9:
- Fastify + node:sqlite, DB at /data/app.db
- Plain server-rendered HTML + CSS (no WebSockets yet — real-time is week 10's job per the brief's own timeline, so I'd skip @fastify/websocket entirely this week rather than wire it up unused)
- Cookie session via @fastify/cookie + @fastify/secure-session or a hand-rolled signed cookie — simple is fine