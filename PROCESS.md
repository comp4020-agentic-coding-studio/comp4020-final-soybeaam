# Process overview

## The build

Quad is an events site where people find and host campus events. A host publishes an event with a time, place and optional affiliation (university, club), and anyone logged in can check in. Unlike most event apps, it isn't limited to university. Students and non-students share the same space, and filters let people browse events from ANU, from other universities, or from outside any institution.

This is a week-9 slice of a larger idea. What exists today is login, hosting an event, a check-in that persists, category/price metadata on events, a mocked checkout for priced events, and sort/filter on the event list. Booking with capacity, group chat, pinned announcements and real payments are the direction, not the current app. The README keeps these apart under "What's live today" and "Where this is going", and I rewrote it twice this week after noticing it described planned features in the present tense — first after the initial build, and again after adding categories and the mocked checkout changed what "today" actually covers.

## Picking the stack

For each big question (what counts as a person, what persists, how changes reach everyone, the stack), the agent gave me options rather than picking one unprompted. I chose Fastify with Node's built-in `node:sqlite` over two alternatives — reusing the Astro stack from a prior crit, and Firebase/Firestore — and wrote the comparison up as [docs/decisions/0001-app-stack.md](docs/decisions/0001-app-stack.md) rather than restating it here. The short version: `node:sqlite` needs no native module to compile, and Fastify is a plain long-lived server, which is the shape week 10's real-time layer needs — Firebase would have solved real-time and auth for free, but doesn't fit a project deployed as a single container with its own volume.

## Scoping

The first plan was the whole platform: payments, group chat, moderation, volunteer roles, real accounts. I narrowed it to something I could build, test and deploy in a week: cookie login, seeded placeholder events, and a check-in that survives coming back. The cut was deliberate. Everything I removed went to "Where this is going" rather than staying in the README as an implied promise. Payments and seat holds went to "What I chose not to build", each with a reason grounded in [Robin Sloan's "An App Can Be a Home-Cooked Meal"](https://www.robinsloan.com/notes/home-cooked-app/): home-cooked software doesn't need to answer to revenue, so it doesn't need to collect it.

## Building it

[`3cf6d07`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/3cf6d07) is the first working server: Fastify with `node:sqlite`, a schema of users, events and check-ins, and routes for login, hosting and check-in. Alongside it I wrote five new spec tests in `spec/events.test.ts`. They check that a stranger can log in and check in and still be checked in on return, that checking in twice doesn't create two entries, that check-in requires being logged in, and that anyone logged in can host. With the existing checks, all seven passed.

[`b98926e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/b98926e) adds category/price metadata, a mocked checkout for priced events, and the sidebar sort/filter. I kept `welcome-mixer` priced at $0 specifically so the existing spec tests, which check in to it directly with no payment step, didn't need rewriting — a deliberate seam rather than an accident.

I verified against the running app, not only the tests: `pnpm check` against a fresh local database, then again against the live Fly deployment at its real URL, for both commits. I didn't test two concurrent browser sessions against each other this week, since there's no real-time behaviour yet for that to exercise — that's a week 10 check. The tests came with each feature, not after it, so the README's "enforced" list is the spec file and nothing more.

## Directing, grounding and correcting the agent

**Directing.** I set the scope and the stack, and the agent proposed options at each decision rather than choosing unprompted. I didn't ask it to "build an events app" — I asked it to compare options, narrowed the idea to a check-in loop I could finish in a week, and only then asked it to implement.

**Grounding.** I checked its work against things it couldn't argue with: the spec tests, the local server, and the deployed app. I read the README against the spec file more than once, and twice found it describing features — booking, capacity, chat — that no code backed, and rewrote it to match the code rather than the other way around.

**Correcting.** Three examples.

1. *Overreach.* I delegated the visual redesign to an orchestrator agent, scoped to `src/style.css` and `src/views.js`: a white background, a card-grid layout, a reusable `eventCard()` component. It also edited `README.md` and `CLAUDE.md`, which I hadn't asked it to touch, and its own hand-back report claimed those files were untouched when they weren't. Both files hold my own account of the project and the instructions governing the agent, not the agent's account, so I reverted the edits before committing — they never reached `main`, which is why [`3cf6d07`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/3cf6d07) contains only the UI work, not the unwanted README/CLAUDE.md content.
2. *A privacy leak.* The AI found host details being surfaced using the raw session token stored in `events.created_by`. That token is the session's credential, so publishing it would let a stranger impersonate the host. I asked the AI to fix it and it created `listEvents()` to join the host's email from `users` instead, so the token never reaches a page. This landed in [`3cf6d07`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/3cf6d07) too, before I'd separated commits by concern — there's no dedicated test asserting the token never appears in the HTML, which is a gap I'm noting rather than hiding.
3. *A fabricated README, twice.* Separately from the redesign, README.md was overwritten with content describing a different app entirely — booking, capacity racing, chat — phrased as if it were my own argument, despite the guardrails. I reverted it both times rather than editing around it, and rewrote the affected sections ("What good means here") myself afterward once the gap between the README and the actual build was pointed out to me directly, line by line.

## What I'd still change

Commit discipline was weak early on: the whole first build landed in one commit ([`3cf6d07`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/3cf6d07)) rather than several smaller ones, which makes "legibility of process" harder to show from the history alone rather than from this account. [`b98926e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-soybeaam/commit/b98926e) is a step toward splitting commits by concern, and I want to keep that up for weeks 10 and 11 rather than let a deadline collapse the history again.
