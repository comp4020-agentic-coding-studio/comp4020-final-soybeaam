const escape = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function layout({ title, user, body }) {
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escape(title)}</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <header>
      <nav>
        <a class="brand" href="/">Quad</a>
        <span class="spacer"></span>
        ${
          user
            ? `<span class="who">${escape(user.email)}</span>
               <form method="post" action="/logout"><button type="submit">Log out</button></form>`
            : `<a href="/login">Log in</a>`
        }
      </nav>
    </header>
    <main>
      ${body}
    </main>
    <footer>
      <a href="/readme/">About this app</a>
    </footer>
  </body>
</html>`;
}

// $0 shows as "Free" rather than "$0.00" — a price badge that always looks
// like a real amount would misstate the (mocked) free events.
function priceLabel(cents) {
  return cents > 0 ? `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}` : "Free";
}

// One reusable event card. Host identity comes only from event.host_email
// (joined in listEvents); the event's creator column holds a session token and
// is deliberately never read here.
export function eventCard(event, { attendeeCount } = {}) {
  const hostEmail = event.host_email;
  const initial = hostEmail ? String(hostEmail).charAt(0).toUpperCase() : "?";
  const hostLabel = hostEmail ? `Hosted by ${escape(hostEmail)}` : "Host TBA";
  const chip =
    typeof attendeeCount === "number" && attendeeCount > 0
      ? `<span class="attendee-chip">${attendeeCount} checked in</span>`
      : "";

  return `<article class="event-card">
    <!-- Placeholder: real image upload isn't built yet, so this gradient block stands in for an event photo. -->
    <div class="card-image" aria-hidden="true">
      <span class="price-badge">${escape(priceLabel(event.price_cents ?? 0))}</span>
    </div>
    <div class="card-body">
      <h2 class="card-title"><a href="/events/${escape(event.slug)}">${escape(event.title)}</a></h2>
      <p class="card-meta">${escape(event.event_date || "Date TBA")}</p>
      <p class="card-meta">${escape(event.location || "Location TBA")}</p>
      ${event.affiliation ? `<p class="card-meta card-affiliation">${escape(event.affiliation)}</p>` : ""}
      ${chip}
      <div class="card-host">
        <span class="avatar" aria-hidden="true">${escape(initial)}</span>
        <span>${hostLabel}</span>
      </div>
    </div>
  </article>`;
}

const SORTS = [
  { value: "latest", label: "Latest" },
  { value: "soonest", label: "Soonest" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
];

// Filter/sort sidebar — a laptop-width side column that becomes a flat block
// above the list on narrow screens (see .home-layout in style.css). Plain
// GET-form radios so filtering works with no client-side JS.
function sidebar({ sort, category, categories }) {
  const sortItem = ({ value, label }) => `<label class="filter-option">
      <input type="radio" name="sort" value="${escape(value)}" ${sort === value ? "checked" : ""} />
      ${escape(label)}
    </label>`;

  const categoryItem = (value, label) => `<label class="filter-option">
      <input type="radio" name="category" value="${escape(value)}" ${
        (category || "") === value ? "checked" : ""
      } />
      ${escape(label)}
    </label>`;

  return `<aside class="sidebar" aria-label="Sort and filter events">
    <form method="get" action="/" id="filters">
      <section class="filter-group">
        <h2>Sort by</h2>
        ${SORTS.map(sortItem).join("\n")}
      </section>
      <section class="filter-group">
        <h2>Category</h2>
        ${categoryItem("", "All events")}
        ${categories.map((c) => categoryItem(c, c)).join("\n")}
      </section>
      <noscript><button type="submit">Apply</button></noscript>
    </form>
  </aside>
  <script>
    // Progressive enhancement only: without JS the noscript submit button
    // above still works, since this is a plain GET form.
    document.getElementById("filters").addEventListener("change", (e) => e.target.form.requestSubmit());
  </script>`;
}

export function homePage({ user, events, sort, category, categories }) {
  const list = events.length
    ? `<ul class="event-grid">
        ${events
          .map(
            (e) =>
              `<li class="event-card-item">${eventCard(e, { attendeeCount: e.attendee_count })}</li>`,
          )
          .join("\n")}
      </ul>`
    : `<p>No events match this filter.</p>`;

  return layout({
    title: "Quad — events",
    user,
    body: `
      <h1>Upcoming events</h1>
      <div class="home-layout">
        ${sidebar({ sort, category, categories })}
        <div class="home-main">
          ${list}
          <p><a href="${user ? "/events/new" : "/login"}" class="button">Host an event</a></p>
        </div>
      </div>
    `,
  });
}

export function loginPage({ error } = {}) {
  return layout({
    title: "Log in",
    user: null,
    body: `
      <h1>Log in</h1>
      <p>Enter an email. There's no password yet — this is a placeholder session, not real auth (see PROCESS.md).</p>
      ${error ? `<p class="error">${escape(error)}</p>` : ""}
      <form method="post" action="/login">
        <label>Email <input type="email" name="email" required /></label>
        <button type="submit">Continue</button>
      </form>
    `,
  });
}

export function newEventPage({ user, categories }) {
  return layout({
    title: "Host an event",
    user,
    body: `
      <h1>Host an event</h1>
      <form method="post" action="/events">
        <label>Title <input type="text" name="title" required /></label>
        <label>Date <input type="date" name="event_date" /></label>
        <label>Location <input type="text" name="location" /></label>
        <label>Affiliation (university, club) <input type="text" name="affiliation" /></label>
        <label>Category
          <select name="category">
            <option value="">None</option>
            ${categories.map((c) => `<option value="${escape(c)}">${escape(c)}</option>`).join("\n")}
          </select>
        </label>
        <label>Price (0 = free)
          <input type="number" name="price" min="0" step="0.01" value="0" />
        </label>
        <button type="submit">Create event</button>
      </form>
      <p class="meta">Prices are for testing the checkout step only — no real
      payment is taken (see README).</p>
    `,
  });
}

export function eventPage({ user, event, attendees, checkedIn }) {
  const price = event.price_cents ?? 0;

  let action;
  if (!user) {
    action = `<p><a href="/login">Log in</a> to check in.</p>`;
  } else if (checkedIn) {
    action = `<p class="confirmed">You're checked in.</p>`;
  } else if (price > 0) {
    action = `<a class="button" href="/events/${escape(event.slug)}/pay">Pay ${escape(
      priceLabel(price),
    )} &amp; check in</a>`;
  } else {
    action = `<form method="post" action="/events/${escape(event.slug)}/checkin">
      <button type="submit">Check in (free)</button>
    </form>`;
  }

  return layout({
    title: event.title,
    user,
    body: `
      <h1>${escape(event.title)}</h1>
      <p class="meta">${escape(event.event_date ?? "date tbc")} · ${escape(event.location ?? "location tbc")}${
        event.affiliation ? ` · ${escape(event.affiliation)}` : ""
      }${event.category ? ` · ${escape(event.category)}` : ""} · ${escape(priceLabel(price))}</p>

      ${action}

      <h2>Who's checked in (${attendees.length})</h2>
      ${
        attendees.length
          ? `<ul class="attendees">${attendees
              .map((a) => `<li>${escape(a.email)}</li>`)
              .join("\n")}</ul>`
          : `<p>Nobody yet — be the first.</p>`
      }
    `,
  });
}

// A dummy payment step: no card processor, no stored details, just a fake
// form that goes straight to the real checkin route on submit. This exists so
// "priced" events have a visibly distinct step from free ones, standing in
// for a real checkout until one gets built (see README's "what I chose not
// to build").
export function payPage({ user, event }) {
  return layout({
    title: `Pay — ${event.title}`,
    user,
    body: `
      <h1>Pay ${escape(priceLabel(event.price_cents ?? 0))}</h1>
      <p class="meta">${escape(event.title)} — this is a mocked checkout. No card is
      charged, and nothing you type here is stored.</p>
      <form method="post" action="/events/${escape(event.slug)}/checkin">
        <label>Card number <input type="text" inputmode="numeric" placeholder="4242 4242 4242 4242" disabled /></label>
        <label>Expiry <input type="text" placeholder="12/34" disabled /></label>
        <label>CVC <input type="text" placeholder="123" disabled /></label>
        <button type="submit">Pay ${escape(priceLabel(event.price_cents ?? 0))} (mock) &amp; check in</button>
      </form>
    `,
  });
}

export function readmePage({ html }) {
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>About — Quad</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <header><nav><a class="brand" href="/">Quad</a></nav></header>
    <main class="readme">
      ${html}
    </main>
  </body>
</html>`;
}
