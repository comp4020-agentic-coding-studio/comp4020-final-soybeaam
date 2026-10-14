# Quad
Host or publish an event with a time, place and optional affiliation
(university, club). Unlike typical event apps, both students and
non-students can check in, and everyone sees the same guest list for
an event. Sorting and category filters let people find events that
aren't just from ANU but from other universities, clubs, or outside
any institution.
This is a first version (week 9). What exists today is in "What's live
today"; everything else is in "Where this is going" and is not built.

## What's live today
- Log in with email and password (demo accounts alex, sam, maya and tom
  at quad.test, all with password `password123`), with your session
  persisting when you come back
- Profile and settings pages, and a dev-only admin dashboard at
  `/admin/login` (admin / admin; off when NODE_ENV=production or on Fly)
- Any logged-in user can host an event (time, place, optional
  affiliation, category, price)
- Check in to a free event in one step; a priced event goes through a
  mocked checkout first (no real card is charged)
- Sort and filter the event list by name, date or category

## What good means here
The app is good if:

1. **Everyone sees the same guest list.** Whoever checked in to an
   event is visible to anyone who loads that event's page after them —
   there's one shared view of who's going, not a private list per
   person.
2. **Checking in is quick for a stranger.** Open the link, log in
   with a seeded demo account (for example alex@quad.test with password
   `password123`), check in. No approval to wait on.
3. **Hosting has no gatekeeper.** Anyone logged in can host an event —
   title, date, location, affiliation, category, price — with no
   review step before it's live.
4. **The range of events is genuinely diverse.** A study session, a
   club social, a paid workshop and a free trivia night are all the
   same kind of thing to the app; category and price are metadata, not
   a hierarchy.
5. **A price is seen before it's paid.** A free event says so. A
   priced event shows the amount and a checkout step before check-in,
   rather than collecting money with no visible moment of agreement —
   even though, this week, that checkout is mocked.

## What is enforced and what is judged
Checked by the tests in `spec/events.test.ts`, against the running app:

- a seeded demo user can log in with email and password and check in, and the check-in is still there
  when they come back
- checking in twice doesn't create two entries
- checking in requires being logged in
- anyone logged in can host an event

Judged, not enforced: whether an event looks genuine, whether a host is who
they claim to be, and whether the mocked checkout reads as obviously fake
rather than a real payment form. None of these have a test yet.

## Where this is going
None of this exists yet, and nothing above depends on it.

- **Booking with capacity.** Limited spots, and the rule that the last
  spot goes to exactly one person (first committed request wins). This
  is where a real capacity race appears.
- **Event group chat.** Attendees and hosts talk, with hosts able to
  announce and pin messages.
- **Volunteer role.** Hosts delegating announcing and pinning.
- **Moderation.** Rules against promoting competing events, such as
  link filtering and flagging.
- **Payments.** See below.

## What I chose not to build (yet)
- **Real payments.** Sloan's essay ["An App Can Be a Home-Cooked
  Meal"](https://www.robinsloan.com/notes/home-cooked-app/) argues
  home-cooked software's value is in not needing to scale or monetize:
  it stays answerable only to the people using it. I used that to
  decide against real payments this week: the checkout step is
  mocked — a fake card form that goes straight to check-in — so no
  money moves, and I'm not building refunds, seat holds, or real
  payment processing. Taking real money would make Quad answerable to
  revenue, disputes and chargebacks as well as to the students and
  hosts using it, and I want it to stay answerable only to them.
- **Seat holds during payment.** Better experience, more moving parts.
  A wrong "sold out" is cheaper than a double booking, so I'll start
  without holds when booking arrives.