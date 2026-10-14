// Demo content for the social side of Quad: events, communities, activity,
// direct messages, chat and announcements. Pure data and small template
// functions only. social-db.js does all the database work.
//
// People are referred to by username and must be one of the five seed users
// from db.js. social-db.js resolves them to accounts by email (SEED_EMAILS),
// because on older databases the username may belong to someone else.

export const SEED_EMAILS = {
  admin: "admin@quad.test",
  alexc: "alex@quad.test",
  "sam.okafor": "sam@quad.test",
  mayap: "maya@quad.test",
  tomw: "tom@quad.test",
};

const SEED_USERNAMES = Object.keys(SEED_EMAILS);

// day_offset is days from today, or "sat"/"sun" for the coming weekend day
// (worked out at boot, so "this weekend" never goes stale).
export const SOCIAL_EVENTS = [
  // ---- Music ----
  {
    slug: "neon-nights-sydney", title: "Neon Nights Sydney", category: "Music", day_offset: 0,
    start_time: "20:00", end_time: "02:00", location: "The Lighthouse Rooftop, Darling Harbour", distance_km: 2.4,
    organizer_username: "mayap", capacity: 400, price_cents: 3500,
    description: "A night of synthwave and house under neon light, right on the harbour. Three DJs, two bars and a dance floor that stays busy until late.",
    tags: ["Electronic", "Nightlife", "Dance"], rating: 4.8, interested: 512, base_attendees: 286, friends_going: 4,
    status: "live", cover_hue: 300, community: "electronic-music", map_x: 38, map_y: 46,
    lineup: [{ name: "Kira Vale", role: "Headline DJ" }, { name: "Pulsewidth", role: "Live set" }, { name: "DJ Marlo", role: "Opening set" }],
  },
  {
    slug: "rooftop-sessions", title: "Rooftop Sessions", category: "Music", day_offset: "sat",
    start_time: "16:00", end_time: "22:00", location: "Skyline Terrace, Surry Hills", distance_km: 3.1,
    organizer_username: "mayap", capacity: 180, price_cents: 2500,
    description: "Acoustic and soul sets on a rooftop as the sun goes down. Bring a friend and a jumper for when it cools off.",
    tags: ["Acoustic", "Live music", "Sunset"], rating: 4.6, interested: 233, base_attendees: 140, friends_going: 2,
    status: "selling-fast", cover_hue: 24, community: "electronic-music", map_x: 52, map_y: 58,
    lineup: [{ name: "Ella Morrow", role: "Singer-songwriter" }, { name: "The Low Tides", role: "Band" }],
  },
  {
    slug: "midnight-frequency", title: "Midnight Frequency", category: "Music", day_offset: 9,
    start_time: "22:00", end_time: "04:00", location: "Basement 77, Kings Cross", distance_km: 3.8,
    organizer_username: "tomw", capacity: 250, price_cents: 3000,
    description: "Techno and minimal in a low-ceilinged basement with a proper sound system. Doors at ten, no re-entry after one.",
    tags: ["Techno", "Underground", "Late night"], rating: 4.5, interested: 198, base_attendees: 172, friends_going: 1,
    status: "upcoming", cover_hue: 250, community: "electronic-music", map_x: 61, map_y: 41,
    lineup: [{ name: "Halcyon Drift", role: "Headline DJ" }, { name: "Mira K", role: "Support" }],
  },
  {
    slug: "sunset-sounds", title: "Sunset Sounds", category: "Music", day_offset: "sun",
    start_time: "15:00", end_time: "20:00", location: "Bondi Pavilion Lawn, Bondi", distance_km: 7.2,
    organizer_username: "mayap", capacity: 600, price_cents: 0,
    description: "A free afternoon of local bands on the lawn by the beach. Picnic rugs welcome, glass is not.",
    tags: ["Outdoor", "Free", "Local bands"], rating: 4.7, interested: 640, base_attendees: 395, friends_going: 5,
    status: "upcoming", cover_hue: 35, community: "electronic-music", map_x: 86, map_y: 62,
    lineup: [{ name: "Saltwater Radio", role: "Band" }, { name: "June Ito", role: "Singer" }, { name: "Coastline", role: "Band" }],
  },
  {
    slug: "future-bass-festival", title: "Future Bass Festival", category: "Music", day_offset: 24,
    start_time: "13:00", end_time: "23:00", location: "Moore Park Showground, Moore Park", distance_km: 4.5,
    organizer_username: "admin", capacity: 2000, price_cents: 8900,
    description: "A full day of future bass, garage and drum and bass across two stages. Food trucks and a chill-out tent on site.",
    tags: ["Festival", "Bass", "All day"], rating: 4.4, interested: 1210, base_attendees: 380, friends_going: 3,
    status: "selling-fast", cover_hue: 190, community: "electronic-music", map_x: 60, map_y: 70,
    lineup: [{ name: "Neon Arcade", role: "Headliner" }, { name: "Subtropic", role: "Main stage" }, { name: "Lola Fenn", role: "Second stage" }],
  },
  // ---- Technology ----
  {
    slug: "ai-after-dark", title: "AI After Dark", category: "Technology", day_offset: 2,
    start_time: "18:30", end_time: "21:30", location: "Fishburners, Ultimo", distance_km: 1.6,
    organizer_username: "alexc", capacity: 150, price_cents: 0,
    description: "Lightning talks on what people are actually building with AI, followed by drinks. Short talks, real demos, no sales pitches.",
    tags: ["AI", "Talks", "Networking"], rating: 4.7, interested: 310, base_attendees: 128, friends_going: 3,
    status: "selling-fast", cover_hue: 210, community: "sydney-tech", map_x: 42, map_y: 55,
    lineup: [{ name: "Dr Hana Lee", role: "Speaker" }, { name: "Raj Menon", role: "Speaker" }, { name: "Alex Chen", role: "Host" }],
  },
  {
    slug: "futuretech-summit", title: "FutureTech Summit", category: "Technology", day_offset: 16,
    start_time: "09:00", end_time: "17:00", location: "ICC Sydney, Darling Harbour", distance_km: 2.2,
    organizer_username: "admin", capacity: 900, price_cents: 14900,
    description: "A one-day conference on cloud, robotics and climate tech. Keynotes in the morning and hands-on workshops after lunch.",
    tags: ["Conference", "Cloud", "Robotics"], rating: 4.5, interested: 870, base_attendees: 360, friends_going: 2,
    status: "upcoming", cover_hue: 220, community: "sydney-tech", map_x: 37, map_y: 52,
    lineup: [{ name: "Grace Ng", role: "Keynote" }, { name: "Oliver Brandt", role: "Workshop lead" }, { name: "Priya Raman", role: "MC" }],
  },
  {
    slug: "startup-launch-night", title: "Startup Launch Night", category: "Technology", day_offset: 5,
    start_time: "18:00", end_time: "21:00", location: "Tank Stream Labs, Sydney CBD", distance_km: 0.9,
    organizer_username: "sam.okafor", capacity: 200, price_cents: 1500,
    description: "Six early-stage teams launch their products live on stage. Vote for your favourite and meet the founders afterwards.",
    tags: ["Startups", "Pitching", "Founders"], rating: 4.6, interested: 245, base_attendees: 150, friends_going: 2,
    status: "upcoming", cover_hue: 160, community: "startup-founders", map_x: 47, map_y: 44,
    lineup: [{ name: "Sam Okafor", role: "Host" }, { name: "Leah Fischer", role: "Judge" }],
  },
  {
    slug: "cybersecurity-meetup", title: "Cybersecurity Meetup", category: "Technology", day_offset: 11,
    start_time: "18:00", end_time: "20:30", location: "UTS Building 11, Ultimo", distance_km: 1.8,
    organizer_username: "alexc", capacity: 120, price_cents: 0,
    description: "Two talks on real incident response, then a capture-the-flag warm-up for anyone who wants to try. Beginners are welcome.",
    tags: ["Security", "CTF", "Talks"], rating: 4.4, interested: 140, base_attendees: 64, friends_going: 1,
    status: "upcoming", cover_hue: 130, community: "sydney-tech", map_x: 40, map_y: 60,
    lineup: [{ name: "Marcus Webb", role: "Speaker" }, { name: "Tina Duong", role: "CTF lead" }],
  },
  {
    slug: "creative-coding-lab", title: "Creative Coding Lab", category: "Technology", day_offset: "sun",
    start_time: "13:00", end_time: "17:00", location: "The Rocks Makerspace, The Rocks", distance_km: 1.2,
    organizer_username: "alexc", capacity: 40, price_cents: 1000,
    description: "Make generative art with code in a relaxed afternoon session. Laptops needed, experience not.",
    tags: ["Generative art", "Workshop", "p5.js"], rating: 4.9, interested: 96, base_attendees: 38, friends_going: 2,
    status: "sold-out", cover_hue: 280, community: "design-creativity", map_x: 48, map_y: 30,
    lineup: [{ name: "Nadia Russo", role: "Facilitator" }, { name: "Alex Chen", role: "Helper" }],
  },
  // ---- Social ----
  {
    slug: "friday-social-club", title: "Friday Social Club", category: "Social", day_offset: 0,
    start_time: "17:30", end_time: "21:00", location: "The Grounds Bar, Newtown", distance_km: 4.1,
    organizer_username: "sam.okafor", capacity: 120, price_cents: 0,
    description: "An easy after-work hang with board games, a long table and a friendly crowd. Come alone, leave with a few new names.",
    tags: ["After work", "Board games", "Casual"], rating: 4.6, interested: 188, base_attendees: 92, friends_going: 3,
    status: "live", cover_hue: 15, community: null, map_x: 30, map_y: 68,
    lineup: [{ name: "Sam Okafor", role: "Host" }, { name: "Jess Taylor", role: "Games master" }],
  },
  {
    slug: "rooftop-networking", title: "Rooftop Networking", category: "Social", day_offset: 7,
    start_time: "18:00", end_time: "20:30", location: "Level 12 Terrace, Barangaroo", distance_km: 1.5,
    organizer_username: "sam.okafor", capacity: 160, price_cents: 2000,
    description: "Meet people from tech, design and finance over drinks with a view. Name tags by industry make starting a conversation easy.",
    tags: ["Networking", "Careers", "Drinks"], rating: 4.3, interested: 205, base_attendees: 118, friends_going: 1,
    status: "upcoming", cover_hue: 45, community: "startup-founders", map_x: 35, map_y: 38,
    lineup: [{ name: "Leah Fischer", role: "Host" }],
  },
  {
    slug: "new-friends-night", title: "New Friends Night", category: "Social", day_offset: 3,
    start_time: "19:00", end_time: "22:00", location: "Lucky Duck Hall, Glebe", distance_km: 3.3,
    organizer_username: "mayap", capacity: 100, price_cents: 0,
    description: "Small-group icebreakers for people new to Sydney or just looking to widen their circle. Hosts rotate the tables every half hour.",
    tags: ["New in town", "Icebreakers", "Friendly"], rating: 4.8, interested: 176, base_attendees: 74, friends_going: 2,
    status: "upcoming", cover_hue: 340, community: null, map_x: 33, map_y: 62,
    lineup: [{ name: "Maya Patel", role: "Host" }, { name: "Chris Allen", role: "Table host" }],
  },
  {
    slug: "singles-and-strangers", title: "Singles & Strangers", category: "Social", day_offset: 13,
    start_time: "19:30", end_time: "22:30", location: "The Velvet Room, Darlinghurst", distance_km: 2.7,
    organizer_username: "tomw", capacity: 80, price_cents: 2500,
    description: "Speed-friending with a playful twist: question cards, short rounds and a mixer at the end. No pressure, just good conversation.",
    tags: ["Singles", "Speed-friending", "Mixer"], rating: 4.2, interested: 158, base_attendees: 66, friends_going: 0,
    status: "selling-fast", cover_hue: 330, community: null, map_x: 57, map_y: 50,
    lineup: [{ name: "Tom Walsh", role: "Host" }],
  },
  {
    slug: "international-social", title: "International Social", category: "Social", day_offset: 18,
    start_time: "18:30", end_time: "22:00", location: "Harbourside Hall, Pyrmont", distance_km: 2.0,
    organizer_username: "admin", capacity: 300, price_cents: 0,
    description: "A mixer for students and workers from everywhere, with language tables and snacks from a dozen countries. Bring a flag sticker if you have one.",
    tags: ["International", "Languages", "Students"], rating: 4.7, interested: 330, base_attendees: 210, friends_going: 3,
    status: "upcoming", cover_hue: 200, community: null, map_x: 36, map_y: 49,
    lineup: [{ name: "Priya Raman", role: "Host" }, { name: "Diego Alvarez", role: "Language tables" }],
  },
  // ---- Food ----
  {
    slug: "night-market-festival", title: "Night Market Festival", category: "Food", day_offset: "sat",
    start_time: "17:00", end_time: "23:00", location: "Chinatown Mall, Haymarket", distance_km: 1.4,
    organizer_username: "tomw", capacity: 1500, price_cents: 0,
    description: "Sixty stalls of street food, desserts and small makers under festoon lights. Entry is free, bring cash for the smaller stalls.",
    tags: ["Street food", "Market", "Free entry"], rating: 4.8, interested: 980, base_attendees: 400, friends_going: 4,
    status: "upcoming", cover_hue: 10, community: "foodies", map_x: 46, map_y: 57,
    lineup: [{ name: "Bao Brothers", role: "Stall" }, { name: "Sweet Mango Co", role: "Dessert stall" }],
  },
  {
    slug: "street-food-safari", title: "Street Food Safari", category: "Food", day_offset: 6,
    start_time: "18:00", end_time: "21:00", location: "Marrickville Metro Laneway, Marrickville", distance_km: 6.5,
    organizer_username: "tomw", capacity: 40, price_cents: 4500,
    description: "A guided walk through six hole-in-the-wall eateries with tastings at each stop. Comfortable shoes and an empty stomach recommended.",
    tags: ["Food tour", "Walking", "Tasting"], rating: 4.9, interested: 120, base_attendees: 38, friends_going: 1,
    status: "selling-fast", cover_hue: 30, community: "foodies", map_x: 24, map_y: 78,
    lineup: [{ name: "Tom Walsh", role: "Guide" }],
  },
  {
    slug: "pasta-and-wine-night", title: "Pasta & Wine Night", category: "Food", day_offset: 10,
    start_time: "19:00", end_time: "22:00", location: "Nonna's Kitchen, Leichhardt", distance_km: 5.4,
    organizer_username: "mayap", capacity: 30, price_cents: 6500,
    description: "Learn to make fresh pasta from scratch, then eat it with matched wines. Small class, long table, plenty of seconds.",
    tags: ["Cooking class", "Wine", "Italian"], rating: 4.8, interested: 88, base_attendees: 30, friends_going: 2,
    status: "sold-out", cover_hue: 5, community: "foodies", map_x: 22, map_y: 56,
    lineup: [{ name: "Chef Lucia Bruno", role: "Instructor" }],
  },
  {
    slug: "asian-fusion-pop-up", title: "Asian Fusion Pop-Up", category: "Food", day_offset: 21,
    start_time: "18:00", end_time: "22:00", location: "Warehouse 9, Alexandria", distance_km: 4.8,
    organizer_username: "tomw", capacity: 120, price_cents: 3800,
    description: "A one-night pop-up from three young chefs mixing Korean, Thai and Japanese flavours. Seven small plates, one long night.",
    tags: ["Pop-up", "Fusion", "Tasting menu"], rating: 4.5, interested: 150, base_attendees: 84, friends_going: 1,
    status: "upcoming", cover_hue: 350, community: "foodies", map_x: 44, map_y: 80,
    lineup: [{ name: "Min-jun Park", role: "Chef" }, { name: "Ploy Srisuk", role: "Chef" }, { name: "Kenji Arai", role: "Chef" }],
  },
  // ---- Art ----
  {
    slug: "digital-dreams", title: "Digital Dreams", category: "Art", day_offset: 4,
    start_time: "18:00", end_time: "22:00", location: "Carriageworks, Eveleigh", distance_km: 3.6,
    organizer_username: "alexc", capacity: 350, price_cents: 2200,
    description: "Projection art and interactive installations from twelve digital artists. Walk through rooms that react to sound and movement.",
    tags: ["Digital art", "Installations", "Interactive"], rating: 4.7, interested: 410, base_attendees: 220, friends_going: 2,
    status: "upcoming", cover_hue: 265, community: "design-creativity", map_x: 34, map_y: 72,
    lineup: [{ name: "Studio Lumen", role: "Artist collective" }, { name: "Ayaan Shah", role: "Artist" }],
  },
  {
    slug: "immersive-art-night", title: "Immersive Art Night", category: "Art", day_offset: 14,
    start_time: "19:00", end_time: "23:00", location: "The Substation Gallery, Redfern", distance_km: 3.0,
    organizer_username: "mayap", capacity: 200, price_cents: 2800,
    description: "A late opening with live painting, ambient music and a room you can draw on. Drinks from the gallery bar.",
    tags: ["Live painting", "Gallery", "Late opening"], rating: 4.4, interested: 170, base_attendees: 96, friends_going: 1,
    status: "upcoming", cover_hue: 290, community: "design-creativity", map_x: 50, map_y: 68,
    lineup: [{ name: "Rosa Kim", role: "Live painter" }, { name: "Echo Fields", role: "Ambient set" }],
  },
  {
    slug: "photography-walk", title: "Photography Walk", category: "Art", day_offset: "sat",
    start_time: "07:00", end_time: "10:00", location: "Circular Quay Ferry Wharf, Circular Quay", distance_km: 1.0,
    organizer_username: "sam.okafor", capacity: 30, price_cents: 0,
    description: "A morning walk from the Quay to the Botanic Garden catching early light on the harbour. Any camera counts, phones included.",
    tags: ["Photography", "Walk", "Morning"], rating: 4.9, interested: 132, base_attendees: 28, friends_going: 2,
    status: "upcoming", cover_hue: 180, community: "photography", map_x: 50, map_y: 28,
    lineup: [{ name: "Sam Okafor", role: "Guide" }, { name: "Lin Zhou", role: "Photographer" }],
  },
  {
    slug: "neon-canvas-exhibition", title: "Neon Canvas Exhibition", category: "Art", day_offset: 27,
    start_time: "17:00", end_time: "21:00", location: "Paddington Arts Space, Paddington", distance_km: 3.9,
    organizer_username: "admin", capacity: 250, price_cents: 1500,
    description: "Opening night for a group show of neon, light and glow-in-the-dark works. Meet the artists and see the pieces with the lights off.",
    tags: ["Exhibition", "Neon", "Opening night"], rating: 4.3, interested: 118, base_attendees: 70, friends_going: 0,
    status: "upcoming", cover_hue: 315, community: "design-creativity", map_x: 66, map_y: 55,
    lineup: [{ name: "Ivy Laurent", role: "Curator" }, { name: "Theo Grant", role: "Artist" }],
  },
  // ---- Sport ----
  {
    slug: "community-football", title: "Community Football", category: "Sport", day_offset: 1,
    start_time: "18:00", end_time: "19:30", location: "Wentworth Park Oval, Glebe", distance_km: 2.6,
    organizer_username: "tomw", capacity: 44, price_cents: 0,
    description: "Casual seven-a-side football for all levels. Teams are mixed on the night so nobody has to bring a squad.",
    tags: ["Football", "Casual", "All levels"], rating: 4.6, interested: 84, base_attendees: 40, friends_going: 2,
    status: "upcoming", cover_hue: 120, community: null, map_x: 36, map_y: 60,
    lineup: [{ name: "Tom Walsh", role: "Organiser" }],
  },
  {
    slug: "night-basketball", title: "Night Basketball", category: "Sport", day_offset: 8,
    start_time: "19:00", end_time: "21:00", location: "Prince Alfred Park Courts, Surry Hills", distance_km: 2.1,
    organizer_username: "tomw", capacity: 30, price_cents: 500,
    description: "Pick-up games under the lights with music on the sideline. Winners stay on, everyone plays.",
    tags: ["Basketball", "Pick-up", "Evening"], rating: 4.5, interested: 72, base_attendees: 44, friends_going: 1,
    status: "upcoming", cover_hue: 25, community: null, map_x: 49, map_y: 63,
    lineup: [{ name: "Tom Walsh", role: "Organiser" }],
  },
  {
    slug: "run-club", title: "Run Club", category: "Sport", day_offset: 0,
    start_time: "06:30", end_time: "07:30", location: "Mrs Macquarie's Chair, Sydney", distance_km: 1.9,
    organizer_username: "alexc", capacity: 100, price_cents: 0,
    description: "A social 5 km loop around the harbour foreshore, with a coffee stop at the end. Pace groups for walkers through to fast runners.",
    tags: ["Running", "Morning", "Coffee"], rating: 4.8, interested: 150, base_attendees: 62, friends_going: 3,
    status: "live", cover_hue: 95, community: "running", map_x: 58, map_y: 30,
    lineup: [{ name: "Alex Chen", role: "Pace lead" }, { name: "Maya Patel", role: "Sweeper" }],
  },
  {
    slug: "surf-meetup", title: "Surf Meetup", category: "Sport", day_offset: "sun",
    start_time: "07:00", end_time: "10:00", location: "North Bondi Surf Club, Bondi", distance_km: 7.5,
    organizer_username: "sam.okafor", capacity: 50, price_cents: 0,
    description: "A relaxed morning surf for all levels, with a couple of experienced surfers on hand for tips. Boards available to borrow.",
    tags: ["Surfing", "Beach", "Morning"], rating: 4.7, interested: 110, base_attendees: 46, friends_going: 2,
    status: "upcoming", cover_hue: 195, community: "running", map_x: 88, map_y: 58,
    lineup: [{ name: "Sam Okafor", role: "Organiser" }, { name: "Kai Moana", role: "Surf coach" }],
  },
];

// Schedule and FAQs are the same shape for every event in a category, filled
// with the event's own times and venue. Keeps 27 events from becoming 27
// hand-written blocks.
const SCHEDULES = {
  Music: [["Doors open"], ["Opening set"], ["Headline set"], ["Last call"]],
  Technology: [["Arrive and check in"], ["Welcome and first talk"], ["Demos and Q&A"], ["Drinks and networking"]],
  Social: [["Arrive and grab a name tag"], ["Icebreakers"], ["Mingle"], ["Wrap up"]],
  Food: [["Gates open"], ["First tastings"], ["Main course"], ["Dessert and close"]],
  Art: [["Doors open"], ["Artist welcome"], ["Explore the works"], ["Closing"]],
  Sport: [["Meet and warm up"], ["First session"], ["Main session"], ["Cool down and coffee"]],
};

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = (h * 60 + m + mins + 24 * 60) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// details JSON for an event: schedule, lineup, faqs and its map position.
export function eventDetails(e) {
  const steps = SCHEDULES[e.category] ?? SCHEDULES.Social;
  const schedule = steps.map(([title], i) => ({ time: addMinutes(e.start_time, i * 45), title }));
  const faqs = [
    { q: "How do I get there?", a: `${e.location} is a short walk from the nearest station. Check the map on this page for the exact spot.` },
    {
      q: "Do I need a ticket?",
      a: e.price_cents > 0
        ? "Yes. Tap I'm Going to check out, and your ticket shows up under Tickets."
        : "No ticket needed. Tap I'm Going so the organiser knows how many to expect.",
    },
    { q: "Can I come on my own?", a: "Plenty of people do. Say hi in the event chat beforehand if you'd like a familiar face." },
  ];
  return { schedule, lineup: e.lineup ?? [], faqs, map_x: e.map_x, map_y: e.map_y };
}

export const COMMUNITIES = [
  {
    slug: "sydney-tech", name: "Sydney Tech", cover_hue: 215,
    description: "Developers, designers and the tech-curious across Sydney. Meetups, talks and the occasional hackathon.",
    member_usernames: ["alexc", "admin", "sam.okafor"], member_count: 4280, moderators: ["alexc"],
    trending_topics: ["AI tooling", "Rust", "Job market", "Side projects"],
    discussions: [
      { author_username: "alexc", title: "Who's going to AI After Dark?", body: "Thinking of grabbing dinner nearby first. Anyone keen?", replies: 14, minutes_ago: 45 },
      { author_username: "sam.okafor", title: "Best co-working spots in the CBD", body: "Looking for somewhere with decent wifi and a quiet corner. Recommendations welcome.", replies: 22, minutes_ago: 300 },
    ],
  },
  {
    slug: "electronic-music", name: "Electronic Music", cover_hue: 290,
    description: "House, techno, bass and everything in between. Find your next night out and people to go with.",
    member_usernames: ["mayap", "tomw", "alexc"], member_count: 6120, moderators: ["mayap"],
    trending_topics: ["Neon Nights", "Vinyl", "Festival season"],
    discussions: [
      { author_username: "mayap", title: "Neon Nights set times are out", body: "Kira Vale is on at midnight. Plan accordingly.", replies: 31, minutes_ago: 20 },
      { author_username: "tomw", title: "Earplug recommendations?", body: "My ears are still ringing from last weekend. What do people use?", replies: 9, minutes_ago: 720 },
    ],
  },
  {
    slug: "startup-founders", name: "Startup Founders", cover_hue: 160,
    description: "Founders and early team members swapping notes on building companies in Sydney.",
    member_usernames: ["sam.okafor", "admin"], member_count: 1870, moderators: ["sam.okafor"],
    trending_topics: ["Fundraising", "First hires", "Launch night"],
    discussions: [
      { author_username: "sam.okafor", title: "Launch Night lineup confirmed", body: "Six teams, five minutes each. Come and vote.", replies: 12, minutes_ago: 90 },
    ],
  },
  {
    slug: "photography", name: "Photography", cover_hue: 180,
    description: "Photo walks, gear chat and feedback on your shots, from phone snappers to film nerds.",
    member_usernames: ["sam.okafor", "mayap"], member_count: 2340, moderators: ["sam.okafor"],
    trending_topics: ["Golden hour", "Film", "Street photography"],
    discussions: [
      { author_username: "sam.okafor", title: "Sunrise walk this Saturday", body: "Meeting at the Quay at 7. Tripods optional.", replies: 8, minutes_ago: 150 },
      { author_username: "mayap", title: "Share your harbour shots", body: "Post your favourite from the last walk.", replies: 26, minutes_ago: 1440 },
    ],
  },
  {
    slug: "running", name: "Running", cover_hue: 95,
    description: "Social runs, race training and post-run coffee. Every pace is welcome.",
    member_usernames: ["alexc", "tomw", "mayap"], member_count: 3010, moderators: ["alexc"],
    trending_topics: ["City2Surf", "Run Club", "Shoes"],
    discussions: [
      { author_username: "alexc", title: "Run Club route this week", body: "Same loop as last time, with a detour past the Opera House.", replies: 6, minutes_ago: 60 },
    ],
  },
  {
    slug: "foodies", name: "Foodies", cover_hue: 15,
    description: "Night markets, pop-ups and the best cheap eats in Sydney.",
    member_usernames: ["tomw", "mayap", "admin"], member_count: 5420, moderators: ["tomw"],
    trending_topics: ["Night market", "Dumplings", "Pop-ups"],
    discussions: [
      { author_username: "tomw", title: "Night Market must-tries", body: "Make a list before you go or you'll fill up on the first three stalls.", replies: 40, minutes_ago: 30 },
      { author_username: "mayap", title: "Pasta night is sold out", body: "Any interest in a second class? I can ask the chef.", replies: 17, minutes_ago: 480 },
    ],
  },
  {
    slug: "design-creativity", name: "Design & Creativity", cover_hue: 270,
    description: "Designers, artists and makers sharing work, events and studio space.",
    member_usernames: ["alexc", "mayap", "admin"], member_count: 2760, moderators: ["mayap"],
    trending_topics: ["Generative art", "Digital Dreams", "Portfolio reviews"],
    discussions: [
      { author_username: "alexc", title: "Creative Coding Lab is full", body: "Waitlist is open. I'll post the sketches afterwards.", replies: 11, minutes_ago: 200 },
    ],
  },
];

// target_slug is an event slug or a community slug.
export const SEED_ACTIVITY = [
  { username: "mayap", verb: "joined", target_slug: "neon-nights-sydney", minutes_ago: 3 },
  { count: 12, verb: "joined", target_slug: "neon-nights-sydney", minutes_ago: 8 },
  { username: "alexc", verb: "is interested in", target_slug: "ai-after-dark", minutes_ago: 12 },
  { username: "tomw", verb: "saved", target_slug: "night-market-festival", minutes_ago: 18 },
  { username: "sam.okafor", verb: "created", target_slug: "startup-launch-night", minutes_ago: 26 },
  { username: "mayap", verb: "posted in", target_slug: "electronic-music", minutes_ago: 31 },
  { count: 8, verb: "joined", target_slug: "run-club", minutes_ago: 40 },
  { username: "alexc", verb: "joined", target_slug: "creative-coding-lab", minutes_ago: 55 },
  { username: "tomw", verb: "created", target_slug: "street-food-safari", minutes_ago: 70 },
  { username: "sam.okafor", verb: "is interested in", target_slug: "photography-walk", minutes_ago: 95 },
  { username: "admin", verb: "posted in", target_slug: "sydney-tech", minutes_ago: 120 },
  { username: "mayap", verb: "saved", target_slug: "pasta-and-wine-night", minutes_ago: 150 },
  { username: "tomw", verb: "joined", target_slug: "community-football", minutes_ago: 190 },
  { username: "alexc", verb: "posted in", target_slug: "running", minutes_ago: 240 },
  { username: "sam.okafor", verb: "joined", target_slug: "surf-meetup", minutes_ago: 320 },
];

// Direct messages between seed users, oldest first in each thread.
export const SEED_DMS = [
  {
    id: "alexc-mayap", participants: ["alexc", "mayap"],
    messages: [
      { from: "mayap", body: "Are you coming to Neon Nights tonight?", minutes_ago: 95 },
      { from: "alexc", body: "Yes! Meeting a couple of people at the station at 7:45.", minutes_ago: 90 },
      { from: "mayap", body: "Perfect, I'll find you near the bar.", minutes_ago: 88 },
    ],
  },
  {
    id: "alexc-sam.okafor", participants: ["alexc", "sam.okafor"],
    messages: [
      { from: "sam.okafor", body: "Could you help run the demo table at Launch Night?", minutes_ago: 600 },
      { from: "alexc", body: "Happy to. What time should I get there?", minutes_ago: 560 },
      { from: "sam.okafor", body: "5:30 would be great. Thanks heaps.", minutes_ago: 550 },
    ],
  },
  {
    id: "mayap-tomw", participants: ["mayap", "tomw"],
    messages: [
      { from: "tomw", body: "Saving you a spot on the food tour.", minutes_ago: 1500 },
      { from: "mayap", body: "Legend. I'll bring the antacids.", minutes_ago: 1490 },
    ],
  },
  {
    id: "admin-tomw", participants: ["admin", "tomw"],
    messages: [
      { from: "admin", body: "Your Night Market listing is featured this week.", minutes_ago: 2880 },
      { from: "tomw", body: "Nice, thanks for the heads up.", minutes_ago: 2800 },
    ],
  },
];

// Per-event chat, built from one small template set. Authors cycle through the
// seed users (skipping the organiser for the question). index 0 is the message
// that the reply (last template) points at.
export function seedChatFor(e) {
  const others = SEED_USERNAMES.filter((u) => u !== e.organizer_username);
  const pick = (i) => others[(i + e.title.length) % others.length];
  const firstOption = (e.tags && e.tags[0]) || "Yes";
  return [
    { username: pick(0), kind: "text", body: `Who else is heading to ${e.title}?`, meta: null, minutes_ago: 240 },
    { username: e.organizer_username, kind: "text", body: `Welcome everyone. Doors at ${e.start_time}, see you at ${e.location.split(",")[0]}.`, meta: null, minutes_ago: 200 },
    {
      username: pick(1), kind: "poll", body: "Quick poll",
      meta: { question: "Meet up beforehand?", options: [{ label: "Yes, nearby", votes: 9 }, { label: "See you inside", votes: 5 }, { label: `Only if there's ${firstOption.toLowerCase()}`, votes: 2 }] },
      minutes_ago: 150,
    },
    { username: pick(2), kind: "location", body: "Meeting spot", meta: { label: `Out the front of ${e.location.split(",")[0]}`, map_x: e.map_x, map_y: e.map_y }, minutes_ago: 120 },
    { username: pick(3), kind: "question", body: "Is there anywhere to leave a bag?", meta: null, minutes_ago: 90 },
    { username: pick(1), kind: "image", body: "From last time", meta: { label: `${e.category} crowd photo`, hue: e.cover_hue }, minutes_ago: 60 },
    { username: pick(2), kind: "gif", body: "", meta: { label: "excited dance" }, minutes_ago: 30 },
    { username: pick(4), kind: "text", body: "Count me in, see you there.", meta: null, minutes_ago: 15, reply_to_index: 0 },
  ];
}

// Short chat for each community room.
export function seedCommunityChat(c) {
  const [a, b] = c.member_usernames.length > 1 ? c.member_usernames : [c.member_usernames[0], "admin"];
  return [
    { username: a, kind: "text", body: `Welcome to ${c.name}. Say hi and tell us what you're into.`, meta: null, minutes_ago: 600 },
    { username: b, kind: "text", body: `Hi all. Keen to hear about ${c.trending_topics[0]}.`, meta: null, minutes_ago: 420 },
    { username: a, kind: "text", body: "Check the events tab for what's on this week.", meta: null, minutes_ago: 60, reply_to_index: 1 },
  ];
}

// Event announcements are posted by the event's organiser; global ones (no
// event_slug) by admin.
export const SEED_ANNOUNCEMENTS = [
  { event_slug: "neon-nights-sydney", title: "Set times are up", body: "Doors 8 pm, Pulsewidth at 10, Kira Vale at midnight.", pinned: 1, minutes_ago: 50 },
  { event_slug: "neon-nights-sydney", title: "Bag check", body: "Small bags only tonight. There is a cloakroom near the lifts.", pinned: 0, minutes_ago: 20 },
  { event_slug: "ai-after-dark", title: "Two more speakers added", body: "We've added a demo on local models and one on AI in healthcare.", pinned: 1, minutes_ago: 300 },
  { event_slug: "night-market-festival", title: "Cash tip", body: "Some of the smaller stalls are cash only. There is an ATM at the north end.", pinned: 0, minutes_ago: 400 },
  { event_slug: "run-club", title: "Route change", body: "The foreshore path is partly closed, so we'll loop via the Domain instead.", pinned: 1, minutes_ago: 120 },
  { event_slug: "startup-launch-night", title: "Voting opens on the night", body: "Scan the code on your seat to vote for the best launch.", pinned: 0, minutes_ago: 900 },
  { event_slug: null, title: "Welcome to the new Quad", body: "Discover events, join communities and chat with people going to the same things as you.", pinned: 1, minutes_ago: 1440 },
  { event_slug: null, title: "This weekend in Sydney", body: "Night Market Festival, Sunset Sounds and a sunrise photo walk are all on. Check Discover for more.", pinned: 0, minutes_ago: 240 },
  { event_slug: null, title: "Community guidelines", body: "Be kind in chats, keep it on topic, and flag anything that looks off to an admin.", pinned: 0, minutes_ago: 4320 },
];
