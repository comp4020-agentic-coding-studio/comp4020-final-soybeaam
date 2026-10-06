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
| Fastify + `node:sqlite` + cookie session | *(fill in)* | *(fill in)* |
| *(alternative you considered)* | | |
| *(alternative you considered)* | | |

## Decision

What was chosen, and why — in your own words.

Facts already true of the implementation, if useful as a starting point:
- Server: Fastify (`src/server.js`)
- Persistence: SQLite via Node's built-in `node:sqlite`, file at `/data/app.db`
  — no native module to compile, which matters inside the 256 MB image
- Identity: a signed cookie set on login (email only, no password) — see
  `src/server.js`'s login route

## Consequences / cost

What this choice makes harder later, and what you'd revisit. E.g.:
- No real auth yet — what does upgrading past email-only identity cost?
- No real-time layer yet (week 10) — what does adding WebSockets/SSE cost
  given this server shape?
- SQLite on a single volume means no horizontal scaling — is that a real
  constraint for this app's actual audience?
