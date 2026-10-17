// Cover photos for events, grouped by CATEGORIES (src/db.js). Images live in
// src/assets/event_images and are served from /event-images/:file (see
// server.js), which only allows filenames present in ALL_EVENT_IMAGES.
//
// There's no cover_image column on events, so the picture is chosen
// deterministically from category + slug: same event always gets the same
// photo, and new events spread across each category's pool instead of all
// landing on the first file.

export const CATEGORY_IMAGES = {
  Social: [
    "pexels-bertellifotografia-29284270.jpg",
    "pexels-helenalopes-9124691.jpg",
    "pexels-ketut-subiyanto-4474005.jpg",
    "pexels-ketut-subiyanto-4559959.jpg",
    "pexels-ketut-subiyanto-5055241.jpg",
    "pexels-newmanphotographs-16934319.jpg",
    "pexels-rdne-4920893.jpg",
    "pexels-thomas-benedetti-949290600-25358278.jpg",
  ],
  Workshop: [
    "pexels-chuck-2973392.jpg",
    "pexels-karola-g-4219654.jpg",
    "pexels-silverkblack-39190420.jpg",
  ],
  "Quiz/Trivia": [
    "pexels-ann-h-45017-21562934.jpg",
    "pexels-leeloothefirst-5428829.jpg",
    "pexels-loveishersign-28299678.jpg",
    "pexels-nietjuhart-776657.jpg",
    "pexels-sarahpictures-10412820.jpg",
  ],
  Sport: [
    "pexels-ansey-30144519.jpg",
    "pexels-capturedbyaugustine-14815463.jpg",
    "pexels-magda-ehlers-pexels-32471037.jpg",
    "pexels-magda-ehlers-pexels-38943015.jpg",
    "pexels-mart-production-7879937.jpg",
    "pexels-masoodaslami-33723004.jpg",
    "pexels-mehmet-altintas-392989477-32863936.jpg",
    "pexels-mustafa-odemis-2683262-38874239.jpg",
    "pexels-nishantaneja-2385654.jpg",
    "pexels-osmanarabaciart-35879478.jpg",
    "pexels-rdne-6655720.jpg",
    "pexels-rdne-8337517.jpg",
    "pexels-runffwpu-2530124.jpg",
  ],
  Party: [
    "pexels-alexandru-cojanu-828538450-19923642.jpg",
    "pexels-bertellifotografia-18999497.jpg",
    "pexels-cole-peters-377317236-30505259.jpg",
    "pexels-cottonbro-10578919.jpg",
    "pexels-dat1208-18976506.jpg",
    "pexels-iamsupermako-4651855.jpg",
    "pexels-maorattias-5156622.jpg",
    "pexels-maorattias-5191996.jpg",
    "pexels-maorattias-5192291.jpg",
    "pexels-maorattias-5192299.jpg",
    "pexels-marwen-larafa-2159807713-36606989.jpg",
    "pexels-maumascaro-801863.jpg",
    "pexels-pavel-danilyuk-8775179.jpg",
  ],
  Music: ["pexels-cottonbro-4090161.jpg", "pexels-karola-g-4471894.jpg"],
  Technology: [
    "pexels-brett-sayles-4373997.jpg",
    "pexels-godiatima-4955393.jpg",
    "pexels-mikhail-nilov-9242891.jpg",
    "pexels-pok-rie-33563-1432794.jpg",
    "pexels-shkrabaanthony-4348401.jpg",
    "pexels-shutter-rwanda-2157056879-37797428.jpg",
    "pexels-vlada-karpovich-4050347.jpg",
    "pexels-youn-seung-jin-36101845-32778341.jpg",
  ],
  Food: [
    "pexels-amar-36904788.jpg",
    "pexels-davegarcia-39122376.jpg",
    "pexels-kampus-8629103.jpg",
    "pexels-mavihnt-36874496.jpg",
    "pexels-newman-photographs-234743505-31970812.jpg",
  ],
  Art: [
    "pexels-deeanacreates-3923258.jpg",
    "pexels-mateusz-dach-99805-4466999.jpg",
    "pexels-olly-3760529.jpg",
    "pexels-pavel-danilyuk-6926705.jpg",
    "pexels-vlada-karpovich-7025515.jpg",
  ],
};

// "Other" and any category without photos fall back to the full pool, so
// every event still gets a cover rather than none at all.
const FALLBACK_POOL = Object.values(CATEGORY_IMAGES).flat();

export const ALL_EVENT_IMAGES = new Set(FALLBACK_POOL);

// Small, fast, deterministic string hash (djb2) — not cryptographic, just
// needs to spread slugs evenly across a pool.
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

export function coverImageFor(event) {
  if (!event?.slug) return undefined;
  const pool = CATEGORY_IMAGES[event.category] ?? FALLBACK_POOL;
  if (!pool.length) return undefined;
  return pool[hash(event.slug) % pool.length];
}
