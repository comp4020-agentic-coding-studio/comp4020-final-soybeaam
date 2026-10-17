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
    "social-1.jpg",
    "social-2.jpg",
    "social-3.jpg",
    "social-4.jpg",
    "social-5.jpg",
    "social-6.jpg",
    "social-7.jpg",
    "social-8.jpg",
  ],
  Workshop: ["workshop-1.jpg", "workshop-2.jpg", "workshop-3.jpg"],
  "Quiz/Trivia": [
    "quiz-trivia-1.jpg",
    "quiz-trivia-2.jpg",
    "quiz-trivia-3.jpg",
    "quiz-trivia-4.jpg",
    "quiz-trivia-5.jpg",
  ],
  Sport: [
    "sport-1.jpg",
    "sport-2.jpg",
    "sport-3.jpg",
    "sport-4.jpg",
    "sport-5.jpg",
    "sport-6.jpg",
    "sport-7.jpg",
    "sport-8.jpg",
    "sport-9.jpg",
    "sport-10.jpg",
    "sport-11.jpg",
    "sport-12.jpg",
    "sport-13.jpg",
  ],
  Party: [
    "party-1.jpg",
    "party-2.jpg",
    "party-3.jpg",
    "party-4.jpg",
    "party-5.jpg",
    "party-6.jpg",
    "party-7.jpg",
    "party-8.jpg",
    "party-9.jpg",
    "party-10.jpg",
    "party-11.jpg",
    "party-12.jpg",
    "party-13.jpg",
  ],
  Music: ["music-1.jpg", "music-2.jpg"],
  Technology: [
    "technology-1.jpg",
    "technology-2.jpg",
    "technology-3.jpg",
    "technology-4.jpg",
    "technology-5.jpg",
    "technology-6.jpg",
    "technology-7.jpg",
    "technology-8.jpg",
  ],
  Food: ["food-1.jpg", "food-2.jpg", "food-3.jpg", "food-4.jpg", "food-5.jpg"],
  Art: ["art-1.jpg", "art-2.jpg", "art-3.jpg", "art-4.jpg", "art-5.jpg"],
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
