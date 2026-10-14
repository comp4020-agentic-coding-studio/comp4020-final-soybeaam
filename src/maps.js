// Real maps, served at /maps.js and loaded (deferred, after the pinned
// MapLibre script) only by the event page and /map. Tiles and styles come from
// OpenFreeMap. Each [data-realmap] element holds a drawn map as the fallback:
// the real map is built in a hidden layer on top and only shown once it has
// loaded. No MapLibre, no WebGL, or an error before load: the drawing stays.
(function () {
  "use strict";
  var d = document;
  var ml = window.maplibregl;
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); };
  var hosts = $$("[data-realmap]");
  if (!ml || !hosts.length) return;
  if (typeof ml.supported === "function" && !ml.supported()) return;
  try {
    var probe = d.createElement("canvas");
    if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return;
  } catch (e) {
    return;
  }

  var STYLES = {
    light: "https://tiles.openfreemap.org/styles/positron",
    dark: "https://tiles.openfreemap.org/styles/dark",
  };
  var SYDNEY = [151.2093, -33.8688];
  var osDark = window.matchMedia("(prefers-color-scheme: dark)");
  var live = []; // [{map, style}]

  // Same rule as style.css: data-theme light/dark, or "system" follows the OS.
  function styleUrl() {
    var t = d.documentElement.getAttribute("data-theme");
    return STYLES[t === "dark" || (t !== "light" && osDark.matches) ? "dark" : "light"];
  }
  function restyle() {
    var url = styleUrl();
    live.forEach(function (m) {
      if (m.style !== url) { m.style = url; m.map.setStyle(url); }
    });
  }
  osDark.addEventListener("change", restyle);
  new MutationObserver(restyle).observe(d.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // A pin like the drawn ones, using the icon the page put in the host.
  function pinEl(host, tag) {
    var el = d.createElement(tag);
    var tpl = host.querySelector("template[data-realmap-icon]");
    el.className = "rmap-pin";
    el.innerHTML = tpl ? tpl.innerHTML : "";
    return el;
  }

  // mount(host, options, ready): build the map over the drawing and swap it in
  // on load, then call ready(map).
  function mount(host, options, ready) {
    var layer = d.createElement("div");
    layer.className = "realmap";
    host.appendChild(layer);
    var url = styleUrl();
    var map;
    var settled = false;
    try {
      var opts = { container: layer, style: url, dragRotate: false, pitchWithRotate: false, attributionControl: { compact: false } };
      for (var k in options) opts[k] = options[k];
      map = new ml.Map(opts);
    } catch (e) {
      layer.remove();
      return;
    }
    var fail = function () {
      if (settled) return;
      settled = true;
      map.remove();
      layer.remove();
    };
    map.on("error", fail);
    map.once("load", function () {
      if (settled) return;
      settled = true;
      map.off("error", fail);
      map.touchZoomRotate.disableRotation();
      host.scrollLeft = 0;
      host.scrollTop = 0;
      host.classList.add("realmap-on");
      var section = host.closest("section");
      if (section) section.classList.add("has-realmap");
      map.resize();
      live.push({ map: map, style: url });
      ready(map);
    });
  }

  /* ---- Event page: one pin, gentle interaction ---- */

  hosts.forEach(function (host) {
    if (host.getAttribute("data-realmap") !== "event") return;
    var at = [Number(host.getAttribute("data-lng")), Number(host.getAttribute("data-lat"))];
    // cooperativeGestures: the page keeps scrolling unless Ctrl/two fingers.
    mount(host, { center: at, zoom: 14.5, cooperativeGestures: true }, function (map) {
      map.getCanvas().setAttribute("aria-label", "Map of " + (host.getAttribute("data-label") || "the event location"));
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      var el = pinEl(host, "span");
      el.classList.add("rmap-pin-event");
      el.setAttribute("aria-hidden", "true");
      new ml.Marker({ element: el, anchor: "bottom" }).setLngLat(at).addTo(map);
      el.removeAttribute("aria-label");
      el.removeAttribute("role");
      el.removeAttribute("tabindex");
    });
  });

  /* ---- /map: every event with coordinates, chips, popover cards ---- */

  hosts.forEach(function (host) {
    if (host.getAttribute("data-realmap") !== "events") return;
    var emap = host.closest("[data-emap]");
    if (!emap) return;
    var items = $$("[data-emap-item][data-lat]", emap);
    if (!items.length) return;

    // Fit the Sydney events; anything further away is still a pin to pan to.
    var near = items.filter(function (li) {
      var lat = Number(li.getAttribute("data-lat")), lng = Number(li.getAttribute("data-lng"));
      return lat < -33.4 && lat > -34.3 && lng > 150.5 && lng < 151.6;
    });
    var view = { center: SYDNEY, zoom: 11 };
    if (near.length > 1) {
      var b = new ml.LngLatBounds();
      near.forEach(function (li) { b.extend([Number(li.getAttribute("data-lng")), Number(li.getAttribute("data-lat"))]); });
      view = { bounds: b, fitBoundsOptions: { padding: 48, maxZoom: 14 } };
    }

    mount(host, view, function (map) {
      emap.classList.add("has-realmap");
      map.getCanvas().setAttribute("aria-label", "Map of upcoming events");
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");

      var markers = {};
      // Offsets clear the pin (anchored at its tip) whichever side the card opens on.
      var offset = { top: [0, 6], "top-left": [0, 6], "top-right": [0, 6], bottom: [0, -38], "bottom-left": [0, -38], "bottom-right": [0, -38], left: [16, -20], right: [-16, -20], center: [0, 0] };
      var popup = new ml.Popup({ closeButton: true, closeOnClick: false, focusAfterOpen: false, maxWidth: "none", offset: offset, className: "rmap-popup" });
      var activeSlug = null;

      var close = function (focusPin) {
        var was = activeSlug;
        popup.remove();
        if (focusPin && was && markers[was]) markers[was].getElement().focus();
      };
      popup.on("close", function () {
        if (activeSlug && markers[activeSlug]) markers[activeSlug].getElement().classList.remove("is-active");
        activeSlug = null;
      });
      // open(slug, zoomTo): show the card; zoomTo also flies the map there.
      var open = function (slug, zoomTo) {
        var tpl = emap.querySelector('template[data-emap-card="' + CSS.escape(slug) + '"]');
        var m = markers[slug];
        if (!tpl || !m) return;
        if (activeSlug) close(false);
        var box = d.createElement("div");
        box.innerHTML = tpl.innerHTML;
        // On a narrow map the card can't sit beside the pin, so move the pin
        // to the bottom middle and let the card open above it.
        var w = host.clientWidth, h = host.clientHeight;
        var z = zoomTo || map.getZoom();
        if (w < 560) map.easeTo({ center: m.getLngLat(), zoom: z, offset: [0, Math.max(0, h / 2 - 48)], duration: zoomTo ? 800 : 300 });
        else if (zoomTo) map.flyTo({ center: m.getLngLat(), zoom: z });
        popup.setMaxWidth(Math.min(256, w - 24) + "px");
        popup.setDOMContent(box).setLngLat(m.getLngLat()).addTo(map);
        activeSlug = slug;
        m.getElement().classList.add("is-active");
        var link = box.querySelector("a");
        if (link) link.focus({ preventScroll: true });
      };

      items.forEach(function (li) {
        var slug = li.getAttribute("data-emap-item");
        var label = li.getAttribute("data-label") || slug;
        var el = pinEl(host, "button");
        el.type = "button";
        el.setAttribute("data-rmap-pin", slug);
        el.setAttribute("data-category", li.getAttribute("data-category") || "");
        el.style.setProperty("--cat-hue", li.style.getPropertyValue("--cat-hue"));
        el.hidden = li.hidden;
        markers[slug] = new ml.Marker({ element: el, anchor: "bottom" })
          .setLngLat([Number(li.getAttribute("data-lng")), Number(li.getAttribute("data-lat"))])
          .addTo(map);
        // MapLibre labels markers "Map marker"; use the event's own label.
        el.setAttribute("aria-label", label);
        el.addEventListener("click", function (e) {
          e.stopPropagation();
          if (activeSlug === slug) close(false); else open(slug);
        });
      });

      // A click on the map itself (not a pin or the popup) closes the card.
      map.on("click", function (e) {
        if (e.originalEvent && e.originalEvent.target === map.getCanvas()) close(false);
      });
      d.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && activeSlug && !d.querySelector("dialog[open]")) close(true);
      });

      // pages.js has already shown/hidden pins by the time this runs (its
      // listener was added first). Close the card if its pin went away.
      emap.addEventListener("click", function (e) {
        var t = e.target instanceof Element ? e.target : null;
        if (!t) return;
        var el;
        if ((el = t.closest("[data-emap-show]"))) {
          var slug = el.getAttribute("data-emap-show");
          var m = markers[slug];
          if (!m) return;
          host.scrollIntoView({ block: "nearest", behavior: "smooth" });
          open(slug, Math.max(map.getZoom(), 14));
        } else if (t.closest("[data-emap-cat]")) {
          if (activeSlug && markers[activeSlug] && markers[activeSlug].getElement().hidden) close(false);
        }
      });
    });
  });
})();
