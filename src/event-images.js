// Cover photos for events, grouped by CATEGORIES (src/db.js). Images live in
// src/assets/event_images and are served from /event-images/:file (see
// server.js), which only allows filenames present in ALL_EVENT_IMAGES.
//
// There's no cover_image column on events, so the picture is normally chosen
// deterministically from category + slug: same event always gets the same
// photo, and new events spread across each category's pool instead of all
// landing on the first file. The seed events below are curated by hand in
// EVENT_COVERS instead, since a category-only hash can't tell "techno
// basement set" from "acoustic rooftop sunset" — both are just "Music".

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

// Hand-picked covers for the seed events, matched to what's actually in the
// photo (not just its category) so events sharing a category don't end up
// looking the same. Falls back to the category-hash pool for anything else
// (e.g. events created through the app).
const EVENT_COVERS = {
  "neon-nights-sydney": "party-8.jpg",
  "rooftop-sessions": "music-2.jpg",
  "midnight-frequency": "party-10.jpg",
  "sunset-sounds": "music-1.jpg",
  "future-bass-festival": "party-6.jpg",

  "ai-after-dark": "technology-2.jpg",
  "futuretech-summit": "technology-8.jpg",
  "startup-launch-night": "technology-6.jpg",
  "cybersecurity-meetup": "technology-1.jpg",
  "creative-coding-lab": "technology-7.jpg",

  "friday-social-club": "social-7.jpg",
  "rooftop-networking": "social-5.jpg",
  "new-friends-night": "social-2.jpg",
  "singles-and-strangers": "social-1.jpg",
  "international-social": "social-6.jpg",
  "welcome-mixer": "social-8.jpg",

  "night-market-festival": "food-5.jpg",
  "street-food-safari": "food-2.jpg",
  "pasta-and-wine-night": "food-3.jpg",
  "asian-fusion-pop-up": "food-1.jpg",

  "digital-dreams": "art-4.jpg",
  "immersive-art-night": "art-3.jpg",
  "photography-walk": "sport-8.jpg",
  "neon-canvas-exhibition": "party-2.jpg",

  "community-football": "sport-3.jpg",
  "night-basketball": "sport-12.jpg",
  "run-club": "sport-13.jpg",
  "surf-meetup": "sport-4.jpg",

  "club-trivia-night": "quiz-trivia-3.jpg",
  "study-sprint": "workshop-2.jpg",
};

export function coverImageFor(event) {
  if (!event?.slug) return undefined;
  if (EVENT_COVERS[event.slug]) return EVENT_COVERS[event.slug];
  const pool = CATEGORY_IMAGES[event.category] ?? FALLBACK_POOL;
  if (!pool.length) return undefined;
  return pool[hash(event.slug) % pool.length];
}
