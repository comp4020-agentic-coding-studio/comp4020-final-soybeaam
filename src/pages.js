// Page-specific browser code, served at /pages.js and loaded (deferred,
// after /client.js) only by the pages that need it. One block per page, each
// guarded by its root data-* hook, so a page without the hook runs nothing.
// Shared stores come from window.Quad (client.js).
(function () {
  "use strict";
  var d = document;
  var Q = window.Quad;
  var $ = function (sel, root) { return (root || d).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); };
  if (!Q) return;

  function load(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many || one + "s"); }
  function press(btns, on) { btns.forEach(function (b) { b.setAttribute("aria-pressed", b === on ? "true" : "false"); }); }

  /* ---- Discover: instant filtering on top of the GET form ---- */

  var disc = $("[data-discover]");
  if (disc) {
    var grid = $("[data-disc-grid]", disc);
    var items = $$(".sx-item", grid);
    var countEl = $("[data-disc-count]", disc);
    var emptyEl = $("[data-disc-empty]", disc);
    var clearBtns = $$("[data-disc-clear]", disc);
    var initialSort = disc.getAttribute("data-initial-sort");
    var dateInput = $("input[name=date]", disc);
    var timer = null;

    var state = function () {
      var fd = new FormData(disc);
      var get = function (k) { return String(fd.get(k) || "").trim(); };
      return { q: get("q"), category: get("category"), when: get("when"), date: get("date"), price: get("price"),
        within: get("within"), sort: get("sort"), friends: get("friends") };
    };

    // The same rules as applyDiscoverFilters() in routes/social.js.
    var matches = function (li, s) {
      var a = function (k) { return li.getAttribute("data-" + k) || ""; };
      if (s.q && a("search").indexOf(s.q.toLowerCase()) === -1) return false;
      if (s.category && a("category") !== s.category) return false;
      if (s.when && (" " + a("when") + " ").indexOf(" " + s.when + " ") === -1) return false;
      if (s.date && a("date") !== s.date) return false;
      var price = Number(a("price"));
      if (s.price === "free" && price > 0) return false;
      if (s.price === "paid" && !(price > 0)) return false;
      if (s.price === "under20" && price >= 2000) return false;
      if (s.within && (a("km") === "" || Number(a("km")) > Number(s.within))) return false;
      if (s.friends && !(Number(a("friends")) > 0)) return false;
      return true;
    };

    var sortKey = function (s) {
      var num = function (li, k) { return Number(li.getAttribute("data-" + k)) || 0; };
      if (s.sort === "popular") return function (x, y) { return num(y, "pop") - num(x, "pop") || num(y, "interest") - num(x, "interest"); };
      if (initialSort === "rating") return function (x, y) { return num(y, "rating") - num(x, "rating"); };
      if (initialSort === "distance") {
        return function (x, y) {
          var kx = x.getAttribute("data-km"), ky = y.getAttribute("data-km");
          return (kx === "" ? 1e9 : Number(kx)) - (ky === "" ? 1e9 : Number(ky));
        };
      }
      return function (x, y) { return num(x, "soon") - num(y, "soon"); };
    };

    var apply = function () {
      var s = state();
      var shown = 0;
      items.slice().sort(sortKey(s)).forEach(function (li) {
        var ok = matches(li, s);
        li.hidden = !ok;
        if (ok) shown++;
        grid.appendChild(li);
      });
      countEl.textContent = shown === items.length ? plural(shown, "event") : shown + " of " + plural(items.length, "event");
      emptyEl.hidden = shown > 0;
      var active = !!(s.q || s.category || s.when || s.date || s.price || s.within || s.friends || s.sort === "popular");
      clearBtns[0].hidden = !active;
      var params = new URLSearchParams();
      ["q", "category", "when", "date", "price", "within", "sort", "friends"].forEach(function (k) { if (s[k]) params.set(k, s[k]); });
      if (initialSort && !s.sort && initialSort !== "popular") params.set("sort", initialSort);
      var qs = params.toString();
      history.replaceState(null, "", "/discover" + (qs ? "?" + qs : ""));
    };

    disc.addEventListener("input", function (e) {
      if (e.target.name !== "q") return;
      clearTimeout(timer);
      timer = setTimeout(apply, 120);
    });
    disc.addEventListener("change", function (e) {
      var t = e.target;
      // "Pick a date" and the When chips replace each other.
      if (t.name === "date" && t.value) $$("input[name=when]", disc).forEach(function (r) { r.checked = false; });
      if (t.name === "when" && dateInput) dateInput.value = "";
      if (t.name === "date" && !t.value) { var any = $("input[name=when][value='']", disc); if (any) any.checked = true; }
      if (t.name !== "q") apply();
    });
    disc.addEventListener("submit", function (e) { e.preventDefault(); clearTimeout(timer); apply(); });
    clearBtns.forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        disc.reset();
        $$("input[type=radio], input[type=checkbox]", disc).forEach(function (i) { i.checked = i.type === "radio" && i.value === ""; });
        $("input[name=q]", disc).value = "";
        if (dateInput) dateInput.value = "";
        $("select[name=within]", disc).value = "";
        initialSort = "";
        apply();
        $("input[name=q]", disc).focus();
      });
    });
  }

  /* ---- Saved: show only events saved on this device ---- */

  var savedList = $("[data-saved-list]");
  if (savedList) {
    var paintSaved = function () {
      var n = 0;
      $$(".sx-item", savedList).forEach(function (li) {
        var on = Q.saved.has(li.getAttribute("data-event-slug"));
        li.hidden = !on;
        if (on) n++;
      });
      $("[data-saved-empty]", savedList).hidden = n > 0;
      var c = $("[data-saved-count]");
      if (c) { c.textContent = plural(n, "saved event"); c.hidden = n === 0; }
    };
    paintSaved();
    d.addEventListener("quad:saved", paintSaved);
    window.addEventListener("storage", paintSaved);
  }

  /* ---- Communities: Join toggle (kept in quad:joined) ---- */

  var joinBtns = $$("[data-join]");
  if (joinBtns.length) {
    var joined = load("quad:joined", {});
    var isJoined = function (b) {
      var slug = b.getAttribute("data-join");
      return Object.prototype.hasOwnProperty.call(joined, slug) ? !!joined[slug] : b.getAttribute("data-member") === "1";
    };
    var paintJoin = function () {
      joinBtns.forEach(function (b) {
        var on = isJoined(b);
        b.setAttribute("aria-pressed", on ? "true" : "false");
        $("[data-join-label]", b).textContent = on ? "Joined" : "Join";
        // The member count moves by one when this device's choice differs
        // from the seed data.
        var slug = b.getAttribute("data-join");
        $$("[data-member-count]").forEach(function (el) {
          if (el.getAttribute("data-member-count") !== slug) return;
          var base = Number(el.getAttribute("data-base")) || 0;
          var wasMember = b.getAttribute("data-member") === "1";
          el.textContent = (base + (on && !wasMember ? 1 : 0) - (!on && wasMember ? 1 : 0)).toLocaleString("en-AU");
        });
      });
    };
    paintJoin();
    d.addEventListener("click", function (e) {
      var b = e.target instanceof Element ? e.target.closest("[data-join]") : null;
      if (!b) return;
      joined[b.getAttribute("data-join")] = !isJoined(b);
      save("quad:joined", joined);
      paintJoin();
    });
  }

  /* ---- Event map: category filter, pin popover, list links ---- */

  var emap = $("[data-emap]");
  if (emap) {
    var viewport = $("[data-map]", emap);
    var pop = $("[data-emap-pop]", emap);
    var popBody = $("[data-emap-pop-body]", emap);
    var catBtns = $$("[data-emap-cat]", emap);
    var lastPin = null;
    var centre = { x: 0.5, y: 0.5 };

    var closePop = function (focusPin) {
      if (pop.hidden) return;
      pop.hidden = true;
      $$(".emap-pin.is-active", emap).forEach(function (p) { p.classList.remove("is-active"); });
      if (focusPin && lastPin) lastPin.focus();
    };
    var openPop = function (pin) {
      var slug = pin.getAttribute("data-emap-pin");
      var tpl = $('template[data-emap-card="' + slug + '"]', emap);
      if (!tpl) return;
      popBody.innerHTML = tpl.innerHTML;
      pop.style.setProperty("--x", pin.style.getPropertyValue("--x"));
      pop.style.setProperty("--y", pin.style.getPropertyValue("--y"));
      // Flip below the pin when it sits near the top edge.
      pop.classList.toggle("is-below", parseFloat(pin.style.getPropertyValue("--y")) < 45);
      $$(".emap-pin.is-active", emap).forEach(function (p) { p.classList.remove("is-active"); });
      pin.classList.add("is-active");
      pop.hidden = false;
      lastPin = pin;
      var link = $("a", pop);
      if (link) link.focus({ preventScroll: true });
    };
    var pinFor = function (slug) { return $('[data-emap-pin="' + slug + '"]', emap); };

    emap.addEventListener("click", function (e) {
      var t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      var el;
      if ((el = t.closest("[data-emap-pin]"))) {
        e.preventDefault();
        if (el === lastPin && !pop.hidden) closePop(false); else openPop(el);
      } else if ((el = t.closest("[data-emap-show]"))) {
        var pin = pinFor(el.getAttribute("data-emap-show"));
        if (pin) {
          viewport.scrollIntoView({ block: "nearest", behavior: "smooth" });
          openPop(pin);
        }
      } else if (t.closest("[data-emap-close]")) {
        closePop(true);
      } else if ((el = t.closest("[data-emap-cat]"))) {
        var cat = el.getAttribute("data-emap-cat");
        press(catBtns, el);
        var n = 0;
        $$("[data-emap-pin], [data-emap-item]", emap).forEach(function (x) {
          var ok = !cat || x.getAttribute("data-category") === cat;
          x.hidden = !ok;
          if (ok && x.hasAttribute("data-emap-item")) n++;
        });
        var c = $("[data-emap-count]", emap);
        if (c) c.textContent = "(" + n + ")";
        if (lastPin && lastPin.hidden) closePop(false);
      } else if (!t.closest("[data-emap-pop]") && !t.closest("[data-map-zoom]")) {
        closePop(false);
      }
    });
    d.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !pop.hidden && !$("dialog[open]")) closePop(true);
    });

    // Phones show a wider drawing than fits: start in the middle of it.
    viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;

    // client.js changes --z on zoom; keep the same spot in the middle.
    viewport.addEventListener("scroll", function () {
      centre.x = (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth;
      centre.y = (viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight;
    }, { passive: true });
    emap.addEventListener("click", function (e) {
      if (!(e.target instanceof Element) || !e.target.closest("[data-map-zoom]")) return;
      requestAnimationFrame(function () {
        viewport.scrollLeft = centre.x * viewport.scrollWidth - viewport.clientWidth / 2;
        viewport.scrollTop = centre.y * viewport.scrollHeight - viewport.clientHeight / 2;
      });
    });
  }

  /* ---- Activity: filter chips ---- */

  var act = $("[data-activity]");
  if (act) {
    var actBtns = $$("[data-act-filter]", act);
    actBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-act-filter");
        press(actBtns, b);
        var total = 0;
        $$("[data-act-group]", act).forEach(function (g) {
          var n = 0;
          $$(".act", g).forEach(function (li) {
            var ok = k === "all" || (" " + li.getAttribute("data-kinds") + " ").indexOf(" " + k + " ") !== -1;
            li.hidden = !ok;
            if (ok) n++;
          });
          g.hidden = n === 0;
          total += n;
        });
        $("[data-act-empty]", act).hidden = total > 0;
      });
    });
  }

  /* ---- Notifications: read state, filters, badge ---- */

  var nt = $("[data-notifications]");
  if (nt) {
    var ntItems = $$("[data-notif]", nt);
    var ntFilter = "all";
    var ntBtns = $$("[data-notif-filter]", nt);
    var paintNotes = function () {
      var unread = 0;
      ntItems.forEach(function (li) {
        var isRead = Q.read.has(li.getAttribute("data-notif"));
        if (!isRead) unread++;
        li.classList.toggle("is-unread", !isRead);
        $("[data-notif-read]", li).hidden = isRead;
        $("[data-notif-state]", li).textContent = isRead ? "" : ", unread";
        li.hidden = ntFilter === "unread" && isRead;
      });
      Q.setUnread(unread);
      var c = $("[data-notif-count]", nt);
      if (c) c.textContent = unread ? "(" + unread + ")" : "";
      var all = $("[data-notif-all]");
      if (all) all.disabled = unread === 0;
      var visible = ntItems.filter(function (li) { return !li.hidden; }).length;
      var list = $(".nt-list", nt);
      if (list) list.hidden = visible === 0;
      $("[data-notif-empty]", nt).hidden = visible > 0;
    };
    nt.addEventListener("click", function (e) {
      var t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      var el;
      if ((el = t.closest("[data-notif-read]"))) {
        var li = el.closest("[data-notif]");
        Q.read.add(li.getAttribute("data-notif"));
        paintNotes();
        var next = $("[data-notif-link]", li);
        if (next) next.focus();
      } else if ((el = t.closest("[data-notif-link]"))) {
        Q.read.add(el.closest("[data-notif]").getAttribute("data-notif"));
      } else if ((el = t.closest("[data-notif-filter]"))) {
        ntFilter = el.getAttribute("data-notif-filter");
        press(ntBtns, el);
        paintNotes();
      }
    });
    var allBtn = $("[data-notif-all]");
    if (allBtn) {
      allBtn.addEventListener("click", function () {
        Q.read.add(ntItems.map(function (li) { return li.getAttribute("data-notif"); }));
        paintNotes();
      });
    }
    paintNotes();
  }

  /* ---- Messages: switch threads, send (kept on this device) ---- */

  var dm = $("[data-dm]");
  if (dm) {
    var dmKey = "quad:dms:" + dm.getAttribute("data-dm-user");
    var dmRead = "quad:dm-read:" + dm.getAttribute("data-dm-user");
    var store = load(dmKey, {});
    var readThreads = load(dmRead, []);
    var threadList = $("[data-dm-threads]", dm);
    var form = $("[data-dm-form]", dm);
    var box = $("textarea", form);
    var pane = $(".dm-pane", dm);

    var initials = function (name) {
      var parts = String(name || "?").trim().split(/\s+/);
      return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "")).toUpperCase();
    };
    var bubble = function (m) {
      return '<li class="dm-msg is-mine"><p class="dm-bubble">' + esc(m.body) + '</p><span class="dm-time">You, ' +
        esc(new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })) + "</span></li>";
    };
    var convFor = function (id) { return $('[data-dm-conv="' + CSS.escape(id) + '"]', dm); };
    var linkFor = function (id) { return $('[data-dm-open="' + CSS.escape(id) + '"]', dm); };

    // Threads started on this device that the server doesn't know about
    // (for example a ?to= chat from an earlier visit) are rebuilt here.
    Object.keys(store).forEach(function (id) {
      var t = store[id];
      if (convFor(id) || !t || !t.with) return;
      threadList.insertAdjacentHTML("afterbegin", '<li><a class="dm-thread" href="/messages?to=' + encodeURIComponent(t.with.username) +
        '" data-dm-open="' + esc(id) + '"><span class="avatar-wrap"><span class="avatar avatar-md" aria-hidden="true">' + esc(initials(t.with.name)) +
        '</span></span><span class="dm-thread-text"><span class="dm-thread-top"><strong>' + esc(t.with.name) +
        '</strong></span><span class="dm-thread-last" data-dm-last></span></span></a></li>');
      form.insertAdjacentHTML("beforebegin", '<div class="dm-conv" data-dm-conv="' + esc(id) + '" data-with-username="' + esc(t.with.username) +
        '" data-with-name="' + esc(t.with.name) + '" hidden><header class="dm-head"><a class="icon-button dm-back" href="/messages" data-dm-back aria-label="All conversations">' +
        '<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></a>' +
        '<a class="person-main dm-who" href="/profile/' + encodeURIComponent(t.with.username) + '"><span class="avatar avatar-md" aria-hidden="true">' + esc(initials(t.with.name)) +
        '</span><span class="person-text"><strong class="person-name">' + esc(t.with.name) + '</strong><span class="person-meta">@' + esc(t.with.username) +
        '</span></span></a></header><ol class="dm-log" data-dm-log aria-label="Messages with ' + esc(t.with.name) + '"></ol></div>');
    });

    // Stored messages go after the seeded ones.
    Object.keys(store).forEach(function (id) {
      var conv = convFor(id), t = store[id];
      if (!conv || !t || !t.messages || !t.messages.length) return;
      var log = $("[data-dm-log]", conv);
      var empty = $("[data-dm-empty]", log);
      if (empty) empty.remove();
      log.insertAdjacentHTML("beforeend", t.messages.map(bubble).join(""));
      var last = $("[data-dm-last]", linkFor(id));
      if (last) last.textContent = "You: " + t.messages[t.messages.length - 1].body;
    });

    var current = function () { return $(".dm-conv:not([hidden])", dm); };
    var scrollLog = function () { var c = current(); if (c) { var l = $("[data-dm-log]", c); l.scrollTop = l.scrollHeight; } };
    var markRead = function (id) {
      if (readThreads.indexOf(id) === -1) { readThreads.push(id); save(dmRead, readThreads); }
      var u = $("[data-dm-unread]", linkFor(id) || d.createElement("a"));
      if (u) u.remove();
    };

    var openThread = function (id, focus) {
      var conv = convFor(id);
      if (!conv) return;
      $$(".dm-conv", dm).forEach(function (c) { c.hidden = c !== conv; });
      $$("[data-dm-open]", dm).forEach(function (a) {
        var on = a.getAttribute("data-dm-open") === id;
        a.classList.toggle("is-active", on);
        if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      });
      dm.setAttribute("data-view", "thread");
      markRead(id);
      scrollLog();
      history.replaceState(null, "", "/messages?thread=" + encodeURIComponent(id));
      if (focus) box.focus({ preventScroll: true });
    };

    readThreads.forEach(function (id) { var u = $("[data-dm-unread]", linkFor(id) || d.createElement("a")); if (u) u.remove(); });
    // The open thread counts as read when it is on screen: always on wide
    // screens, and on phones only when the thread view was asked for.
    var wide = window.matchMedia("(min-width: 48rem)").matches;
    if ((wide || dm.getAttribute("data-view") === "thread") && current()) markRead(current().getAttribute("data-dm-conv"));
    scrollLog();

    dm.addEventListener("click", function (e) {
      var t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      var el;
      if ((el = t.closest("[data-dm-open]"))) {
        e.preventDefault();
        openThread(el.getAttribute("data-dm-open"), true);
      } else if (t.closest("[data-dm-back]")) {
        e.preventDefault();
        dm.setAttribute("data-view", "list");
        history.replaceState(null, "", "/messages");
        var active = $(".dm-thread.is-active", dm);
        if (active) active.focus();
      }
    });

    box.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var body = box.value.trim();
      var conv = current();
      if (!body || !conv) return;
      var id = conv.getAttribute("data-dm-conv");
      var t = store[id] || { with: { username: conv.getAttribute("data-with-username"), name: conv.getAttribute("data-with-name") }, messages: [] };
      var m = { body: body.slice(0, 1000), at: Date.now() };
      t.messages.push(m);
      store[id] = t;
      save(dmKey, store);
      var log = $("[data-dm-log]", conv);
      var empty = $("[data-dm-empty]", log);
      if (empty) empty.remove();
      log.insertAdjacentHTML("beforeend", bubble(m));
      log.scrollTop = log.scrollHeight;
      var last = $("[data-dm-last]", linkFor(id));
      if (last) last.textContent = "You: " + m.body;
      box.value = "";
    });
    if (pane && !current()) form.hidden = true;
  }
})();
