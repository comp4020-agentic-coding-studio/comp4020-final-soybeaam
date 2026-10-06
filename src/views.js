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
    <div class="card-image" aria-hidden="true"></div>
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

export function homePage({ user, events }) {
  const list = events.length
    ? `<ul class="event-grid">
        ${events
          .map(
            (e) =>
              `<li class="event-card-item">${eventCard(e, { attendeeCount: e.attendee_count })}</li>`,
          )
          .join("\n")}
      </ul>`
    : `<p>No events yet.</p>`;

  return layout({
    title: "Quad — events",
    user,
    body: `
      <h1>Upcoming events</h1>
      ${list}
      <p><a href="${user ? "/events/new" : "/login"}" class="button">Host an event</a></p>
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

export function newEventPage({ user }) {
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
        <button type="submit">Create event</button>
      </form>
    `,
  });
}

export function eventPage({ user, event, attendees, checkedIn }) {
  return layout({
    title: event.title,
    user,
    body: `
      <h1>${escape(event.title)}</h1>
      <p class="meta">${escape(event.event_date ?? "date tbc")} · ${escape(event.location ?? "location tbc")}${
        event.affiliation ? ` · ${escape(event.affiliation)}` : ""
      }</p>

      ${
        user
          ? checkedIn
            ? `<p class="confirmed">You're checked in.</p>`
            : `<form method="post" action="/events/${escape(event.slug)}/checkin">
                <button type="submit">Check in</button>
              </form>`
          : `<p><a href="/login">Log in</a> to check in.</p>`
      }

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
