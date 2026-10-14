// Community pages, the activity feed and the announcements page.
// People are publicUser() objects from social-db.js; nothing private here.
import { escape, layout, avatar, pageHeader, emptyState, formatDate, loadingButton } from "./views.js";
import { icon } from "./icons.js";
import { presenceAvatar, avatarStack, chips, personLink, chatRoom, plural, iso } from "./event-views.js";
import { socialEventCard } from "./discover-views.js";

const when = (at) => `<time datetime="${iso(at)}">${escape(formatDate(at, { relative: true }))}</time>`;
const num = (n) => Number(n ?? 0).toLocaleString("en-AU");

// Join is kept in the browser (quad:joined, see pages.js). data-member
// says whether the seed data already lists the viewer as a member.
function joinButton(c, user, className = "") {
  const member = !!user?.username && c.members.some((m) => m.username === user.username);
  return `<button type="button" class="button ${className} js-only" data-join="${escape(c.slug)}" data-member="${
    member ? "1" : "0"
  }" aria-pressed="${member ? "true" : "false"}"><span data-join-label>${member ? "Joined" : "Join"}</span><span class="visually-hidden"> ${escape(
    c.name,
  )}</span></button>`;
}

const memberCount = (c) =>
  `<span class="cm-count"><strong data-member-count="${escape(c.slug)}" data-base="${Number(c.member_count)}">${num(
    c.member_count,
  )}</strong> members</span>`;

/* ------------------------------------------------------------------ */
/* Communities                                                         */
/* ------------------------------------------------------------------ */

// communitiesPage({user, communities}): see communities() in social-db.js.
export function communitiesPage({ user, communities = [] }) {
  const card = (c) => `<li class="cm-card" style="--hue:${Number(c.cover_hue) || 18}" data-community-slug="${escape(c.slug)}">
      <div class="cm-cover" aria-hidden="true"><span class="cm-mark">${escape(c.name.charAt(0))}</span></div>
      <div class="cm-body">
        <h2 class="cm-name"><a class="sx-link" href="/communities/${escape(c.slug)}">${escape(c.name)}</a></h2>
        <p class="cm-desc">${escape(c.description)}</p>
        <div class="cm-meta">
          ${avatarStack(c.members.slice(0, 4))}
          ${memberCount(c)}
        </div>
        <p class="cm-sub">${icon("calendar")}${escape(plural(c.upcoming_count, "upcoming event"))} · ${escape(
          plural(c.discussion_count, "discussion"),
        )}</p>
        ${chips(c.trending_topics.slice(0, 3))}
      </div>
      <div class="cm-actions">${joinButton(c, user, "button-secondary button-sm")}</div>
    </li>`;
  return layout({
    title: "Communities",
    user,
    active: "communities",
    scripts: ["/pages.js"],
    body: `${pageHeader({ title: "Communities", subtitle: "Groups of people into the same things. Join one to hear about its events and chat." })}
      ${communities.length ? `<ul class="cm-grid">${communities.map(card).join("")}</ul>` : emptyState({ title: "No communities yet" })}`,
  });
}

// communityPage({user, community}): community(slug) from social-db.js, which
// adds events, discussions and chat to the communities() shape.
export function communityPage({ user, community: c }) {
  const mods = new Set(c.moderators.map((m) => m.username));
  const people = [...c.moderators, ...c.members.filter((m) => !mods.has(m.username))];
  const memberRow = (p) => `<li class="cm-member">
      ${personLink(
        p,
        `${presenceAvatar(p, "md")}<span class="person-text"><strong class="person-name">${escape(p.display_name)}</strong><span class="person-meta">${
          p.online ? "Online" : "Away"
        }${p.location ? `, ${escape(p.location)}` : ""}</span></span>`,
        "person-main",
      )}
      ${mods.has(p.username) ? `<span class="pill pill-accent">Moderator</span>` : ""}
    </li>`;
  const discussion = (d) => `<li class="cm-disc">
      ${d.author ? personLink(d.author, avatar(d.author, "md"), "cm-disc-face") : ""}
      <div class="cm-disc-main">
        <h3 class="cm-disc-title">${escape(d.title)}</h3>
        <p class="cm-disc-body">${escape(d.body)}</p>
        <p class="cm-disc-meta"><span>${d.author ? personLink(d.author, escape(d.author.display_name), "cm-disc-author") : "Someone"}, ${when(
          d.at,
        )}</span><span aria-hidden="true">·</span>${icon("chat")}${escape(plural(Number(d.replies) || 0, "reply", "replies"))}</p>
      </div>
    </li>`;

  return layout({
    title: c.name,
    user,
    active: "communities",
    bodyClass: "page-community",
    scripts: ["/pages.js"],
    body: `<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/communities">Communities</a><span aria-hidden="true">/</span><span>${escape(
      c.name,
    )}</span></nav>
      <section class="ev-hero cm-hero" style="--hue:${Number(c.cover_hue) || 18}" aria-labelledby="cm-title">
        <div class="ev-hero-art" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="ev-hero-inner">
          <div class="ev-pills"><span class="pill">Community</span></div>
          <h1 id="cm-title">${escape(c.name)}</h1>
          <p class="cm-hero-desc">${escape(c.description)}</p>
          <ul class="cm-hero-stats">
            <li>${icon("users")}${memberCount(c)}</li>
            <li>${icon("calendar")}<span><strong>${c.upcoming_count}</strong> upcoming</span></li>
            <li>${icon("chat")}<span><strong>${c.discussion_count}</strong> discussions</span></li>
          </ul>
          <div class="ev-actions">
            ${joinButton(c, user, "button-lg")}
            <a class="button button-secondary" href="#chat">${icon("chat")}Go to chat</a>
          </div>
        </div>
      </section>
      <div class="ev-layout">
        <div class="ev-main">
          <section class="panel ev-section" aria-labelledby="cm-events-title">
            <div class="ev-section-head"><h2 class="panel-title" id="cm-events-title">Upcoming events</h2><a href="/discover">Find more</a></div>
            ${
              c.events.length
                ? `<ul class="sx-grid sx-grid-tight">${c.events.map((e) => `<li class="sx-item">${socialEventCard(e)}</li>`).join("")}</ul>`
                : `<p class="meta">Nothing scheduled right now.</p>`
            }
          </section>
          <section class="panel ev-section" aria-labelledby="cm-disc-title">
            <div class="ev-section-head"><h2 class="panel-title" id="cm-disc-title">Discussions</h2></div>
            ${c.discussions.length ? `<ul class="cm-discs">${c.discussions.map(discussion).join("")}</ul>` : `<p class="meta">No discussions yet.</p>`}
          </section>
          ${chatRoom({
            user,
            action: `/communities/${c.slug}/chat`,
            back: `/communities/${c.slug}`,
            title: "Community chat",
            sub: `${plural(people.filter((p) => p.online).length, "member")} online`,
            messages: c.chat,
            online: people.filter((p) => p.online).slice(0, 4),
            placeholder: `Message ${c.name}`,
            inline: true,
          })}
        </div>
        <aside class="ev-side" aria-label="About this community">
          <section class="panel ev-section" aria-labelledby="cm-topics-title">
            <h2 class="panel-title" id="cm-topics-title">${icon("trending")} Trending topics</h2>
            ${chips(c.trending_topics, { accent: c.trending_topics.slice(0, 1) })}
          </section>
          <section class="panel ev-section" aria-labelledby="cm-members-title">
            <h2 class="panel-title" id="cm-members-title">Members on Quad</h2>
            <p class="meta small ev-section-sub">${escape(num(c.member_count))} in total. People you can find here:</p>
            ${people.length ? `<ul class="cm-members">${people.map(memberRow).join("")}</ul>` : `<p class="meta">No members yet.</p>`}
          </section>
        </aside>
      </div>`,
  });
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

// Which filter chips an item belongs to (space-separated, read by pages.js).
function activityKinds(i) {
  const kinds = [];
  if (i.verb === "joined") kinds.push("joins");
  if (i.verb === "saved" || i.verb === "is interested in") kinds.push("saves");
  if (i.verb === "created" || i.verb === "posted an update for") kinds.push("events");
  if (i.target?.type === "community") kinds.push("communities");
  return kinds.join(" ");
}

const KIND_ICON = { joins: "check", saves: "saved", events: "calendar", communities: "communities" };

function activityItem(i) {
  const kinds = activityKinds(i);
  const badge = KIND_ICON[kinds.split(" ")[0]] ?? "activity";
  const face = i.actor
    ? personLink(i.actor, presenceAvatar(i.actor, "md"), "act-face")
    : `<span class="act-face act-group" aria-hidden="true">${icon("users")}</span>`;
  const who = i.actor
    ? personLink(i.actor, escape(i.actor.display_name), "act-who")
    : `<strong class="act-who">${escape(plural(Number(i.count) || 0, "person", "people"))}</strong>`;
  return `<li class="act" data-kinds="${kinds}">
    <span class="act-avatar">${face}<span class="act-badge" aria-hidden="true">${icon(badge)}</span></span>
    <p class="act-text">${who} ${escape(i.verb)} <a href="${escape(i.target.href)}">${escape(i.target.title)}</a>${
      i.target.type === "community" ? ` <span class="pill">Community</span>` : ""
    }</p>
    <span class="act-time">${when(i.at)}</span>
  </li>`;
}

// activityPage({user, items}): [{id, actor, count, verb, target: {type, slug, title, href}, at}].
export function activityPage({ user, items = [] }) {
  const today = new Date().toDateString();
  const isToday = (at) => new Date(String(at).replace(" ", "T") + "Z").toDateString() === today;
  const groups = [
    { id: "act-today", label: "Today", list: items.filter((i) => isToday(i.at)) },
    { id: "act-earlier", label: "Earlier", list: items.filter((i) => !isToday(i.at)) },
  ].filter((g) => g.list.length);
  const filters = [
    ["all", "All"],
    ["joins", "Joins"],
    ["saves", "Saves"],
    ["events", "New events"],
    ["communities", "Communities"],
  ];
  return layout({
    title: "Activity",
    user,
    active: "activity",
    scripts: ["/pages.js"],
    body: `${pageHeader({ title: "Activity", subtitle: "What people on Quad have been up to lately." })}
      <div data-activity>
        <div class="fchips-row act-filters js-only" role="group" aria-label="Filter activity">
          ${filters.map(([v, l], n) => `<button type="button" class="fchip" data-act-filter="${v}" aria-pressed="${n === 0}">${escape(l)}</button>`).join("")}
        </div>
        ${
          groups.length
            ? groups
                .map(
                  (g) => `<section class="act-group-section" aria-labelledby="${g.id}" data-act-group>
              <h2 class="act-day" id="${g.id}">${escape(g.label)}</h2>
              <ol class="act-list panel">${g.list.map(activityItem).join("")}</ol>
            </section>`,
                )
                .join("")
            : ""
        }
        <div data-act-empty${groups.length ? " hidden" : ""}>${emptyState({ title: "Nothing here yet", text: "Activity from events and communities shows up here." })}</div>
      </div>`,
  });
}

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

function announcementCard(a) {
  const source = a.event
    ? `<a class="pill pill-info ann-source" href="/events/${escape(a.event.slug)}">${icon("calendar")}${escape(a.event.title)}</a>`
    : `<span class="pill pill-accent ann-source"><span class="ann-q" aria-hidden="true">Q</span>Quad</span>`;
  return `<li class="ann ann-card${a.pinned ? " is-pinned" : ""}" data-ann="${a.id}">
    <div class="ann-head">
      ${source}
      <span class="pill pill-warning" data-pin-badge${a.pinned ? "" : " hidden"}>Pinned</span>
    </div>
    <h2 class="ann-title">${escape(a.title)}</h2>
    ${a.body ? `<p class="ann-body">${escape(a.body)}</p>` : ""}
    <div class="ann-foot">
      <span class="ann-by">${a.author ? personLink(a.author, avatar(a.author, "sm"), "ann-face") : ""}<span>${
        a.author ? personLink(a.author, escape(a.author.display_name), "ann-author") : "Quad"
      }, ${when(a.at)}</span></span>
      ${
        a.can_manage
          ? `<form class="form-inline" method="post" action="/announcements/${a.id}/pin" data-pin-form>
              <button type="submit" class="button button-ghost button-sm" aria-pressed="${a.pinned ? "true" : "false"}" data-pin>${
                a.pinned ? "Unpin" : "Pin"
              }</button>
            </form>`
          : ""
      }
    </div>
  </li>`;
}

// announcementsPage({user, announcements, canPostGlobal}): announcements are
// [{id, title, body, pinned, at, author, event: {slug, title} | null,
// can_manage}]. can_manage is set by the route (host or admin).
export function announcementsPage({ user, announcements = [], canPostGlobal = false }) {
  const form = canPostGlobal
    ? `<details class="panel ann-compose">
        <summary class="ann-compose-summary">${icon("announcements")}<span><strong>Post an announcement</strong><span class="meta small">Goes to everyone on Quad.</span></span></summary>
        <form class="ann-form" method="post" action="/announcements" data-loading>
          <div class="field"><label class="field-label" for="ann-title">Title</label>
            <input class="input" id="ann-title" name="title" required maxlength="120" /></div>
          <div class="field"><label class="field-label" for="ann-body">Message</label>
            <textarea class="input" id="ann-body" name="body" rows="3" maxlength="2000"></textarea></div>
          <label class="check"><input type="checkbox" name="pinned" value="1" /> Pin to the top</label>
          <div>${loadingButton("Post to everyone", { className: "button-sm", loadingLabel: "Posting..." })}</div>
        </form>
      </details>`
    : "";
  return layout({
    title: "Announcements",
    user,
    active: "announcements",
    body: `${pageHeader({ title: "Announcements", subtitle: "News from Quad and updates from event hosts. Pinned ones stay at the top." })}
      ${form}
      ${
        announcements.length
          ? `<ul class="ann-list ann-feed">${announcements.map(announcementCard).join("")}</ul>`
          : emptyState({ title: "No announcements yet" })
      }`,
  });
}
