// Animated gradient behind the home hero, served at /hero-gradient.js.
// Uses @firecms/neat (https://neat.rebase.pro/?preset=Stripe) from a pinned
// CDN build. Skipped entirely for prefers-reduced-motion, since the whole
// point of the library is a moving WebGL shader; the hero's existing
// --gradient-hero CSS background stays visible underneath as the fallback
// if WebGL or the CDN import fails.
(function () {
  "use strict";
  var canvas = document.querySelector("[data-neat-gradient]");
  if (!canvas) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  import("https://cdn.jsdelivr.net/npm/@firecms/neat@1.1.0/dist/index.es.js")
    .then(function (mod) {
      canvas.closest(".home-hero").classList.add("has-neat-bg");
      new mod.NeatGradient({
        ref: canvas,
        colors: [
          { color: "#FD113F", enabled: true },
          { color: "#90E0FF", enabled: true },
          { color: "#FFC858", enabled: true },
          { color: "#753BFF", enabled: true },
        ],
        speed: 2,
        horizontalPressure: 5,
        verticalPressure: 6,
        waveFrequencyX: 1,
        waveFrequencyY: 2,
        waveAmplitude: 10,
        shadows: 0,
        highlights: 7,
        colorBrightness: 1.05,
        colorSaturation: 0,
        colorBlending: 9,
        backgroundColor: "#003FFF",
        backgroundAlpha: 1,
        grainScale: 0,
        grainIntensity: 0,
        resolution: 1,
      });
    })
    .catch(function () {
      // Leave the CSS --gradient-hero background showing.
    });
})();
