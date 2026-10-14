// Views for the social pages. routes/social.js imports everything from here.
// The listing pages live in discover-views.js, the community pages, activity
// and announcements in community-views.js; this file holds the inbox pages
// (messages, notifications) and the form error page.
//
// Every user object here is a publicUser() from social-db.js, so there is no
// token, email or password hash to leak. All text still goes through escape().
import { escape, layout, pageHeader, emptyState, errorState, formatDate } from "./views.js";
import { icon } from "./icons.js";
import { presenceAvatar, personLink, iso } from "./event-views.js";

export { discoverPage, myEventsPage, savedPage, mapPage, ticketsPage } from "./discover-views.js";
export { communitiesPage, communityPage, activityPage, announcementsPage } from "./community-views.js";

const when = (at) => `<time datetime="${iso(at)}">${escape(formatDate(at, { relative: true }))}</time>`;

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

function threadItem(t, activeId) {
  const on = t.id === activeId;
  const last = t.last ? `${t.last.is_mine ? "You: " : ""}${t.last.body}` : "No messages yet";
  return `<li><a class="dm-thread${on ? " is-active" : ""}" href="/messages?thread=${encodeURIComponent(t.id)}" data-dm-open="${escape(
    t.id,
  )}"${on ? ` aria-current="true"` : ""}>
      ${presenceAvatar(t.with, "md")}
      <span class="dm-thread-text">
        <span class="dm-thread-top"><strong>${escape(t.with.display_name)}</strong>${t.last ? `<span class="dm-thread-time">${when(t.last.at)}</span>` : ""}</span>
        <span class="dm-thread-last" data-dm-last>${escape(last)}</span>
      </span>
      ${t.unread ? `<span class="dm-unread" data-dm-unread><span class="visually-hidden">Unread</span></span>` : ""}
    </a></li>`;
}

function conversation(t, activeId) {
  const w = t.with;
  return `<div class="dm-conv" data-dm-conv="${escape(t.id)}" data-with-username="${escape(w.username ?? "")}" data-with-name="${escape(
    w.display_name,
  )}"${t.id === activeId ? "" : " hidden"}>
      <header class="dm-head">
        <a class="icon-button dm-back" href="/messages" data-dm-back aria-label="All conversations">${icon("back")}</a>
        ${personLink(
          w,
          `${presenceAvatar(w, "md")}<span class="person-text"><strong class="person-name">${escape(w.display_name)}</strong><span class="person-meta">${
            w.online ? "Online now" : "Away"
          }${w.username ? `, @${escape(w.username)}` : ""}</span></span>`,
          "person-main dm-who",
        )}
      </header>
      <ol class="dm-log" data-dm-log aria-label="Messages with ${escape(w.display_name)}">
        ${
          t.messages.length
            ? t.messages
                .map(
                  (m) => `<li class="dm-msg${m.is_mine ? " is-mine" : ""}"><p class="dm-bubble">${escape(m.body)}</p><span class="dm-time">${
                    m.is_mine ? "You, " : ""
                  }${when(m.at)}</span></li>`,
                )
                .join("")
            : `<li class="dm-empty" data-dm-empty>Say hello to ${escape(w.display_name)}.</li>`
        }
      </ol>
    </div>`;
}

// messagesPage({user, threads, to, active}): threads from dmThreadsFor()
// ({id, with, messages: [{from, body, at, is_mine}], last: {body, at}, unread}).
//   to: optional publicUser from /messages?to=<username>. Opens their thread,
//       or starts an empty one (kept on this device by pages.js).
//   active: thread id from /messages?thread=<id>.
// Sending is client-side only (pages.js, localStorage per viewer).
export function messagesPage({ user, threads = [], to = null, active = "" }) {
  const list = threads.map((t) => ({ ...t, last: t.last ? { ...t.last, is_mine: t.messages.at(-1)?.is_mine } : null }));
  let activeId = list.some((t) => t.id === active) ? active : "";
  if (to?.username) {
    const existing = list.find((t) => t.with?.username === to.username);
    if (existing) activeId = existing.id;
    else {
      const id = `new-${to.username}`;
      list.unshift({ id, with: to, messages: [], last: null, unread: 0 });
      activeId = id;
    }
  }
  const view = activeId ? "thread" : "list";
  if (!activeId && list.length) activeId = list[0].id;

  return layout({
    title: "Messages",
    user,
    active: "messages",
    bodyClass: "page-messages",
    scripts: ["/pages.js"],
    body: `${pageHeader({ title: "Messages" })}
      ${
        list.length
          ? `<div class="dm" data-dm data-dm-user="${escape(user?.username ?? "me")}" data-view="${view}">
        <section class="panel dm-list" aria-labelledby="dm-list-title">
          <h2 class="dm-list-title" id="dm-list-title">Conversations</h2>
          <ul class="dm-threads" data-dm-threads>${list.map((t) => threadItem(t, activeId)).join("")}</ul>
        </section>
        <section class="panel dm-pane" aria-label="Conversation">
          ${list.map((t) => conversation(t, activeId)).join("")}
          <form class="dm-compose js-only" data-dm-form>
            <label class="visually-hidden" for="dm-body">Message</label>
            <textarea id="dm-body" name="body" rows="1" maxlength="1000" required placeholder="Write a message"></textarea>
            <button type="submit" class="button chat-send" aria-label="Send">${icon("send")}</button>
          </form>
          <p class="dm-note">Messages you send are kept on this device only.<span class="nojs-only"> Sending needs JavaScript.</span></p>
        </section>
      </div>`
          : emptyState({ title: "No messages yet", text: "Open someone's profile from an event or community and tap Message.", action: { href: "/discover", label: "Find people at events" } })
      }`,
  });
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

const NOTIF_ICON = { announcement: "announcements", reply: "reply", reminder: "clock", community: "communities" };

// notificationsPage({user, notifications}): [{id, kind, text, href, at}].
// Read state is kept in the browser (Quad.read); pages.js marks items and
// keeps the sidebar badge in step through data-notification-ids.
export function notificationsPage({ user, notifications = [] }) {
  const ids = escape(JSON.stringify(notifications.map((n) => n.id)));
  const item = (n) => `<li class="nt" data-notif="${escape(n.id)}" data-kind="${escape(n.kind)}">
      <span class="nt-icon nt-${escape(n.kind)}" aria-hidden="true">${icon(NOTIF_ICON[n.kind] ?? "notifications")}</span>
      <div class="nt-main">
        <a class="nt-link" href="${escape(n.href)}" data-notif-link>${escape(n.text)}</a>
        <span class="nt-time">${when(n.at)}<span class="visually-hidden" data-notif-state></span></span>
      </div>
      <button type="button" class="button button-ghost button-sm nt-read js-only" data-notif-read hidden>Mark as read</button>
    </li>`;
  return layout({
    title: "Notifications",
    user,
    active: "notifications",
    scripts: ["/pages.js"],
    body: `${pageHeader({
      title: "Notifications",
      subtitle: "Replies, reminders and news from your events and communities.",
      actions: notifications.length
        ? `<button type="button" class="button button-secondary button-sm js-only" data-notif-all>${icon("check")}Mark all as read</button>`
        : "",
    })}
      <div class="nt-wrap" data-notifications data-notification-ids="${ids}">
        ${
          notifications.length
            ? `<div class="fchips-row js-only" role="group" aria-label="Show">
                <button type="button" class="fchip" data-notif-filter="all" aria-pressed="true">All</button>
                <button type="button" class="fchip" data-notif-filter="unread" aria-pressed="false">Unread <span class="fchip-n" data-notif-count></span></button>
              </div>
              <ul class="nt-list panel">${notifications.map(item).join("")}</ul>`
            : ""
        }
        <div data-notif-empty${notifications.length ? " hidden" : ""}>${emptyState({
          title: "You're all caught up",
          text: "New replies, reminders and announcements will show up here.",
        })}</div>
      </div>`,
  });
}

// formErrorPage({user, text, back}): a rejected form post (empty chat message,
// title too long and so on), with a link back to where it came from.
export function formErrorPage({ user, text, back = "/" }) {
  return layout({
    title: "Couldn't save that",
    user,
    body: errorState({ title: "Couldn't save that", text, action: { href: back, label: "Go back" } }),
  });
}
