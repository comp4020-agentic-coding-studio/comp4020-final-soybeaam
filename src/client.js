// Browser script for every page, served at /client.js (loaded with defer).
// Plain DOM code, one block per feature, each driven by data-* hooks so a
// page without the hook runs nothing. Things the server doesn't store (saved
// events, follows, read notifications, reactions, poll votes) live in
// localStorage. window.Quad exposes the stores for other pages to reuse.
(function () {
  "use strict";
  var d = document;
  var $ = function (sel, root) { return (root || d).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); };

  /* ---- localStorage helpers ---- */

  function load(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode: keep going */ }
  }

  // A set of strings kept under one key: has / toggle / add / all.
  function stringSet(key) {
    function list() { var v = load(key, []); return Array.isArray(v) ? v.map(String) : []; }
    return {
      all: list,
      has: function (id) { return list().indexOf(String(id)) !== -1; },
      add: function (ids) {
        var cur = list();
        [].concat(ids).forEach(function (id) { if (cur.indexOf(String(id)) === -1) cur.push(String(id)); });
        save(key, cur);
      },
      toggle: function (id) {
        var cur = list(), i = cur.indexOf(String(id));
        if (i === -1) cur.push(String(id)); else cur.splice(i, 1);
        save(key, cur);
        return i === -1;
      },
    };
  }

  var saved = stringSet("quad:saved");
  var following = stringSet("quad:following");
  var read = stringSet("quad:read-notifications");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // POST with Accept: application/json. Bodies go form-encoded, the only
  // format the server parses. Resolves with the JSON, rejects with a message.
  function post(url, form) {
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      body: form ? new URLSearchParams(new FormData(form)) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
        return data;
      });
    });
  }

  /* ---- Sidebar drawer (small screens) ---- */

  var navToggle = $("[data-nav-toggle]");
  var sidebar = $("#site-nav");
  var navScrim = $("[data-nav-scrim]");
  function setNav(open, focusBack) {
    if (!sidebar || !navToggle) return;
    sidebar.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (navScrim) navScrim.hidden = !open;
    if (open) { var first = $("a, button", sidebar); if (first) first.focus(); }
    else if (focusBack) navToggle.focus();
  }
  if (navToggle && sidebar) {
    navToggle.addEventListener("click", function () { setNav(!sidebar.classList.contains("is-open"), false); });
    if (navScrim) navScrim.addEventListener("click", function () { setNav(false, true); });
    $$("[data-nav-close]").forEach(function (b) { b.addEventListener("click", function () { setNav(false, true); }); });
    // Reset if the window grows past the drawer breakpoint while it is open.
    window.matchMedia("(min-width: 56.25rem)").addEventListener("change", function (e) { if (e.matches) setNav(false, false); });
  }

  /* ---- Notification badge ---- */

  // The notifications page can render data-notification-ids='[..]' and the
  // badge then counts the ones not yet in Quad.read. Other pages reuse the
  // last count, cached under quad:unread-count.
  function setUnread(n) {
    n = Math.max(0, Number(n) || 0);
    save("quad:unread-count", n);
    $$("[data-notif-badge]").forEach(function (b) {
      b.textContent = n > 99 ? "99+" : String(n);
      b.hidden = n === 0;
      b.setAttribute("aria-label", n + " unread");
    });
  }
  var idSource = $("[data-notification-ids]");
  if (idSource) {
    var ids = [];
    try { ids = JSON.parse(idSource.getAttribute("data-notification-ids")) || []; } catch (e) { /* ignore */ }
    setUnread(ids.filter(function (id) { return !read.has(id); }).length);
  } else {
    setUnread(load("quad:unread-count", 0));
  }

  /* ---- Saved events ---- */

  function syncSaved() {
    $$("[data-save]").forEach(function (b) {
      var on = saved.has(b.getAttribute("data-save"));
      b.setAttribute("aria-pressed", on ? "true" : "false");
      var label = $("[data-save-label]", b);
      if (label) label.textContent = on ? "Saved" : "Save";
    });
  }

  /* ---- Follows ---- */

  function syncFollow() {
    $$("[data-follow]").forEach(function (b) {
      var u = b.getAttribute("data-follow");
      if (!u) return;
      var on = following.has(u);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.textContent = on ? "Following" : "Follow";
    });
  }

  syncSaved();
  syncFollow();
  window.addEventListener("storage", function () { syncSaved(); syncFollow(); });

  /* ---- Share ---- */

  function share(btn) {
    var url = new URL(btn.getAttribute("data-share") || location.pathname, location.href).href;
    var status = $("[data-share-status]");
    var say = function (t) { if (status) { status.textContent = t; setTimeout(function () { status.textContent = ""; }, 4000); } };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(function () { say("Link copied."); }, function () { window.prompt("Copy this link", url); });
    } else {
      window.prompt("Copy this link", url);
    }
  }

  /* ---- Mini profile popover ---- */

  var pm = $("#person-modal");
  function openPerson(link) {
    var p;
    try { p = JSON.parse(link.getAttribute("data-person")); } catch (e) { return false; }
    if (!pm || typeof pm.showModal !== "function" || !p) return false;
    $(".modal-title", pm).textContent = p.name || p.username;
    var face = (link.closest("li") || link).querySelector(".avatar");
    var slot = $("[data-pm-avatar]", pm);
    slot.innerHTML = "";
    if (face) { var c = face.cloneNode(true); c.className = c.className.replace(/avatar-(sm|md|lg)/, "avatar-xl"); slot.appendChild(c); }
    $("[data-pm-status]", pm).textContent = (p.online ? "Online now" : "Away") + (p.username ? ", @" + p.username : "");
    $("[data-pm-meta]", pm).textContent = [p.location, p.mutual ? p.mutual + " mutual friend" + (p.mutual === 1 ? "" : "s") : "No mutual friends"]
      .filter(Boolean).join(". ");
    $("[data-pm-bio]", pm).textContent = p.bio || "";
    $("[data-pm-interests]", pm).innerHTML = (p.interests || []).length
      ? '<ul class="chips">' + p.interests.map(function (t) { return '<li class="chip">' + esc(t) + "</li>"; }).join("") + "</ul>"
      : "";
    $("[data-pm-follow]", pm).setAttribute("data-follow", p.username || "");
    $("[data-pm-message]", pm).href = "/messages?to=" + encodeURIComponent(p.username || "");
    $("[data-pm-profile]", pm).href = "/profile/" + encodeURIComponent(p.username || "");
    syncFollow();
    pm.showModal();
    return true;
  }

  /* ---- Map zoom ---- */

  function zoom(btn) {
    var map = $("[data-map]", btn.closest("section") || d);
    if (!map) return;
    var z = Number(map.style.getPropertyValue("--z")) || 1;
    z = Math.min(3, Math.max(1, z + (btn.getAttribute("data-map-zoom") === "in" ? 0.5 : -0.5)));
    map.style.setProperty("--z", String(z));
    $$("[data-map-zoom]", btn.parentNode).forEach(function (b) {
      b.disabled = b.getAttribute("data-map-zoom") === "in" ? z >= 3 : z <= 1;
    });
  }

  /* ---- Chat: drawer, reactions, polls, replies, sending ---- */

  // One chat per page. Event pages show it as a drawer; a chat marked
  // data-chat-inline (community pages) stays a normal panel in the page.
  var chat = $("[data-chat]");
  var chatInline = !!(chat && chat.hasAttribute("data-chat-inline"));
  var chatScrim = $("[data-chat-scrim]");
  var chatOpener = null;
  function setChat(open) {
    if (!chat || chatInline) return;
    chat.classList.toggle("is-open", open);
    d.documentElement.classList.toggle("chat-open", open);
    if (chatScrim) chatScrim.hidden = !open;
    if (open) {
      var log = $("[data-chat-log]", chat);
      if (log) log.scrollTop = log.scrollHeight;
      var target = $("textarea", chat) || $("[data-chat-close]", chat);
      if (target) target.focus({ preventScroll: true });
    } else if (chatOpener) {
      chatOpener.focus();
    }
  }
  if (chat && !chatInline) {
    chat.classList.add("is-drawer");
    if (chatScrim) chatScrim.addEventListener("click", function () { setChat(false); });
    if (location.hash === "#chat") setChat(true);
  } else if (chat) {
    var inlineLog = $("[data-chat-log]", chat);
    if (inlineLog) inlineLog.scrollTop = inlineLog.scrollHeight;
  }

  var reacted = load("quad:reactions", {});
  var votes = load("quad:poll-votes", {});

  function paintReactions(root) {
    $$("[data-react]", root).forEach(function (b) {
      var msg = b.closest("[data-msg]");
      var key = (msg ? msg.getAttribute("data-msg") : "") + ":" + b.getAttribute("data-react");
      var on = !!reacted[key];
      var n = (Number(b.getAttribute("data-count")) || 0) + (on ? 1 : 0);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("is-zero", n === 0);
      $(".react-n", b).textContent = n ? String(n) : "";
    });
  }

  function paintPolls(root) {
    $$("[data-poll]", root).forEach(function (poll) {
      var mine = votes[poll.getAttribute("data-poll")];
      var opts = $$("[data-poll-option]", poll);
      var counts = opts.map(function (o, i) { return (Number(o.getAttribute("data-votes")) || 0) + (String(mine) === String(i) ? 1 : 0); });
      var total = counts.reduce(function (a, b) { return a + b; }, 0);
      opts.forEach(function (o, i) {
        var pct = total ? Math.round((counts[i] / total) * 100) : 0;
        o.setAttribute("aria-pressed", String(mine) === String(i) ? "true" : "false");
        $(".poll-bar", o).style.width = pct + "%";
        $(".poll-pct", o).textContent = pct + "%";
      });
      var t = $("[data-poll-total]", poll);
      if (t) t.textContent = String(total);
    });
  }
  paintReactions(d);
  paintPolls(d);

  // Initials and hue the same way views.js avatar() does, for new messages.
  function avatarHtml(u) {
    u = u || {};
    if (u.avatar_url && /^(https?:\/\/|\/(?!\/))/i.test(u.avatar_url)) {
      return '<img class="avatar avatar-md" src="' + esc(u.avatar_url) + '" alt="" />';
    }
    var key = String(u.username || u.name || ""), h = 0;
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
    var parts = String(u.name || "").trim().split(/\s+/).filter(Boolean);
    var ini = parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")) : String(u.username || "?").charAt(0);
    return '<span class="avatar avatar-md" style="--avatar-hue:' + h + '" aria-hidden="true">' + esc(ini.toUpperCase()) + "</span>";
  }

  // Mirrors chatMessage() in event-views.js for the kinds a user can post.
  function messageHtml(m) {
    var name = esc(m.author && m.author.display_name || "You");
    // Fresh reaction buttons from the template chatRoom() renders, so a
    // message posted into an empty room still gets them.
    var tpl = $("template[data-react-tpl]", chat);
    var reactTpl = tpl ? tpl.innerHTML : "";
    return '<li class="msg msg-' + esc(m.kind) + ' is-mine" id="msg-' + m.id + '" data-msg="' + m.id + '">' +
      '<span class="avatar-wrap">' + avatarHtml(m.author) + '<span class="online-dot" aria-hidden="true"></span></span>' +
      '<div class="msg-main"><p class="msg-head"><strong class="msg-name">' + name + "</strong>" +
      (m.from_host ? '<span class="pill pill-accent msg-host">Host</span>' : "") +
      '<time class="msg-time">just now</time></p>' +
      (m.reply ? '<p class="msg-quote"><span class="msg-quote-name">' + esc(m.reply.author_name) + "</span> " + esc(m.reply.body) + "</p>" : "") +
      (m.kind === "question" ? '<p class="msg-flag">Question for the organiser</p>' : "") +
      '<p class="msg-body">' + esc(m.body) + "</p>" +
      '<div class="msg-actions">' + reactTpl +
      '<button type="button" class="msg-reply" data-reply="' + m.id + '" data-reply-name="' + name + '">Reply</button></div></div></li>';
  }

  function setReply(id, name) {
    var form = $("[data-chat-form]");
    if (!form) return;
    $("[data-reply-input]", form).value = id || "";
    var chip = $("[data-reply-chip]", form);
    chip.hidden = !id;
    if (id) $("[data-reply-name]", chip).textContent = name;
    $("textarea", form).focus();
  }

  var chatForm = $("[data-chat-form]");
  if (chatForm) {
    var box = $("textarea", chatForm);
    var err = $("[data-chat-error]", chatForm);
    box.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); chatForm.requestSubmit(); }
    });
    chatForm.addEventListener("submit", function (e) {
      if (!window.fetch || !box.value.trim()) return;
      e.preventDefault();
      var btn = $("[type=submit]", chatForm);
      btn.disabled = true;
      err.hidden = true;
      post(chatForm.action, chatForm).then(function (m) {
        var log = $("[data-chat-log]", chat);
        var empty = $("[data-chat-empty]", log);
        if (empty) empty.remove();
        log.insertAdjacentHTML("beforeend", messageHtml(m));
        paintReactions(log.lastElementChild);
        log.scrollTop = log.scrollHeight;
        box.value = "";
        var ask = $("[data-ask]", chatForm);
        if (ask) ask.checked = false;
        setReply(null);
      }).catch(function (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      }).then(function () { btn.disabled = false; });
    });
  }

  /* ---- Forms enhanced with fetch: maybe toggle, pin toggle ---- */

  d.addEventListener("submit", function (e) {
    var f = e.target;
    if (!(f instanceof HTMLFormElement) || !window.fetch) return;
    if (f.hasAttribute("data-maybe-form")) {
      e.preventDefault();
      var mb = $("[data-maybe]", f);
      post(f.action).then(function (r) { mb.setAttribute("aria-pressed", r.maybe ? "true" : "false"); }, function () { f.submit(); });
    } else if (f.hasAttribute("data-pin-form")) {
      e.preventDefault();
      post(f.action).then(function (r) {
        var item = f.closest("[data-ann]");
        var pb = $("[data-pin]", f);
        pb.setAttribute("aria-pressed", r.pinned ? "true" : "false");
        pb.textContent = r.pinned ? "Unpin" : "Pin";
        if (item) {
          item.classList.toggle("is-pinned", !!r.pinned);
          var badge = $("[data-pin-badge]", item);
          if (badge) badge.hidden = !r.pinned;
        }
      }, function () { f.submit(); });
    }
  });

  /* ---- One click handler for the rest ---- */

  d.addEventListener("click", function (e) {
    var t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    var el;
    if ((el = t.closest("[data-save]"))) {
      var slug = el.getAttribute("data-save");
      var nowSaved = saved.toggle(slug);
      syncSaved();
      // pages.js (Saved page) listens for this to show or hide cards.
      d.dispatchEvent(new CustomEvent("quad:saved", { detail: { slug: slug, saved: nowSaved } }));
    } else if ((el = t.closest("[data-follow]"))) {
      if (el.getAttribute("data-follow")) { following.toggle(el.getAttribute("data-follow")); syncFollow(); }
    } else if ((el = t.closest("[data-share]"))) {
      share(el);
    } else if ((el = t.closest("[data-person]"))) {
      if (openPerson(el)) e.preventDefault();
    } else if ((el = t.closest("[data-map-zoom]"))) {
      zoom(el);
    } else if ((el = t.closest("[data-chat-open]")) && chat && !chatInline) {
      e.preventDefault();
      chatOpener = el;
      setChat(true);
    } else if (t.closest("[data-chat-close]")) {
      setChat(false);
    } else if ((el = t.closest("[data-react]"))) {
      var msg = el.closest("[data-msg]");
      var key = msg.getAttribute("data-msg") + ":" + el.getAttribute("data-react");
      if (reacted[key]) delete reacted[key]; else reacted[key] = true;
      save("quad:reactions", reacted);
      paintReactions(msg);
    } else if ((el = t.closest("[data-poll-option]"))) {
      var poll = el.closest("[data-poll]"), id = poll.getAttribute("data-poll"), i = el.getAttribute("data-poll-option");
      if (String(votes[id]) === i) delete votes[id]; else votes[id] = i;
      save("quad:poll-votes", votes);
      paintPolls(poll.parentNode);
    } else if ((el = t.closest("[data-reply]"))) {
      setReply(el.getAttribute("data-reply"), el.getAttribute("data-reply-name"));
    } else if (t.closest("[data-reply-cancel]")) {
      setReply(null);
    }
  });

  d.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || $("dialog[open]")) return;
    if (chat && chat.classList.contains("is-open")) setChat(false);
    else if (sidebar && sidebar.classList.contains("is-open")) setNav(false, true);
  });

  window.Quad = {
    saved: saved,
    following: following,
    read: read,
    setUnread: setUnread,
    sync: function () { syncSaved(); syncFollow(); paintReactions(d); paintPolls(d); },
  };
})();
