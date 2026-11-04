import type { SqliteDatabase } from "./database";

const users = [
  { id: "user-001", name: "Mekdes Tadesse" },
  { id: "user-002", name: "Yonas Bekele" },
  { id: "user-003", name: "Sara Alemu" },
] as const;

const places = [
  {
    id: "national-museum-of-ethiopia",
    name: "National Museum of Ethiopia",
    category: "Museum",
    description: "A landmark museum known for its archaeological collections and the famous fossil Lucy.",
    openingHours: "Tue-Sun 09:00-17:00 (illustrative; verify locally)",
  },
  {
    id: "holy-trinity-cathedral",
    name: "Holy Trinity Cathedral",
    category: "Religious & Historic",
    description: "An important cathedral with striking architecture, historic memorials, and peaceful grounds.",
    openingHours: "Daily 08:00-17:00 (illustrative; verify locally)",
  },
  {
    id: "entoto-natural-park",
    name: "Entoto Natural Park",
    category: "Nature",
    description: "A highland escape with eucalyptus forests, walking trails, and wide city views.",
    openingHours: "Daily 06:00-18:00 (illustrative; verify locally)",
  },
  {
    id: "merkato",
    name: "Merkato",
    category: "Market",
    description: "One of Africa's largest open-air markets, full of local produce, crafts, and everyday trade.",
    openingHours: "Mon-Sat 07:00-18:00 (illustrative; verify locally)",
  },
  {
    id: "red-terror-martyrs-memorial-museum",
    name: "Red Terror Martyrs Memorial Museum",
    category: "Museum",
    description: "A moving museum preserving the stories and history of the Red Terror period.",
    openingHours: "Mon-Sat 08:30-17:30 (illustrative; verify locally)",
  },
  {
    id: "unity-park",
    name: "Unity Park",
    category: "Park & Culture",
    description: "A landscaped park in the Grand Palace compound featuring gardens and cultural exhibits.",
    openingHours: "Daily 09:00-18:00 (illustrative; verify locally)",
  },
  {
    id: "meskel-square",
    name: "Meskel Square",
    category: "Landmark",
    description: "A central public square and gathering place, especially lively during Meskel celebrations.",
    openingHours: "Daily 00:00-23:59 (illustrative; verify locally)",
  },
  {
    id: "addis-ababa-railway-museum",
    name: "Addis Ababa Railway Museum",
    category: "Museum",
    description: "A small museum exploring the history of the Ethio-Djibouti railway and its locomotives.",
    openingHours: "Mon-Fri 09:00-16:30 (illustrative; verify locally)",
  },
  {
    id: "shola-market",
    name: "Shola Market",
    category: "Market",
    description: "A neighborhood market where visitors can browse fresh produce and local household goods.",
    openingHours: "Mon-Sat 06:30-18:00 (illustrative; verify locally)",
  },
  {
    id: "friendship-square",
    name: "Friendship Square",
    category: "Park",
    description: "A modern public garden with fountains, walking paths, and open spaces near the city center.",
    openingHours: "Daily 06:00-20:00 (illustrative; verify locally)",
  },
] as const;

const reviews = [
  { id: "review-001", placeId: "national-museum-of-ethiopia", userId: "user-001", rating: 5, body: "Lucy and the archaeological galleries made this a highlight of our visit.", createdAt: "2026-03-10T09:00:00.000Z" },
  { id: "review-002", placeId: "national-museum-of-ethiopia", userId: "user-002", rating: 4, body: "Fascinating collection; allow extra time for the upper floors.", createdAt: "2026-03-12T10:30:00.000Z" },
  { id: "review-003", placeId: "national-museum-of-ethiopia", userId: "user-003", rating: 4, body: "A worthwhile stop with helpful context on Ethiopia's history.", createdAt: "2026-03-15T08:15:00.000Z" },
  { id: "review-004", placeId: "holy-trinity-cathedral", userId: "user-001", rating: 5, body: "Beautiful architecture and a calm, memorable visit.", createdAt: "2026-03-18T11:00:00.000Z" },
  { id: "review-005", placeId: "holy-trinity-cathedral", userId: "user-003", rating: 4, body: "The stained glass and history are well worth seeing.", createdAt: "2026-03-20T14:00:00.000Z" },
  { id: "review-006", placeId: "entoto-natural-park", userId: "user-002", rating: 5, body: "Fresh air, forest trails, and sweeping views above the city.", createdAt: "2026-04-02T07:45:00.000Z" },
  { id: "review-007", placeId: "entoto-natural-park", userId: "user-003", rating: 4, body: "A lovely break from the city; bring a light jacket.", createdAt: "2026-04-04T06:30:00.000Z" },
  { id: "review-008", placeId: "merkato", userId: "user-001", rating: 4, body: "Energetic and colorful, with something interesting around every corner.", createdAt: "2026-04-09T12:00:00.000Z" },
  { id: "review-009", placeId: "merkato", userId: "user-002", rating: 3, body: "An exciting market, though it can be crowded and confusing.", createdAt: "2026-04-11T13:20:00.000Z" },
  { id: "review-010", placeId: "red-terror-martyrs-memorial-museum", userId: "user-003", rating: 5, body: "A moving and thoughtfully presented account of a difficult history.", createdAt: "2026-04-14T09:25:00.000Z" },
  { id: "review-011", placeId: "unity-park", userId: "user-001", rating: 4, body: "Lovely gardens and a good introduction to the country's diverse cultures.", createdAt: "2026-04-18T10:40:00.000Z" },
  { id: "review-012", placeId: "unity-park", userId: "user-002", rating: 5, body: "Well kept, spacious, and an enjoyable afternoon out.", createdAt: "2026-04-20T11:10:00.000Z" },
  { id: "review-013", placeId: "meskel-square", userId: "user-003", rating: 3, body: "A fascinating central landmark, best experienced during an event.", createdAt: "2026-04-25T15:00:00.000Z" },
  { id: "review-018", placeId: "addis-ababa-railway-museum", userId: "user-002", rating: 4, body: "A small, engaging stop for learning about the railway's history.", createdAt: "2026-04-28T10:00:00.000Z" },
  { id: "review-015", placeId: "shola-market", userId: "user-001", rating: 4, body: "Friendly local atmosphere and a great place to see daily life.", createdAt: "2026-05-05T08:50:00.000Z" },
  { id: "review-016", placeId: "shola-market", userId: "user-003", rating: 3, body: "Good variety, though a little busy at peak hours.", createdAt: "2026-05-08T09:30:00.000Z" },
  { id: "review-017", placeId: "friendship-square", userId: "user-002", rating: 5, body: "A clean, relaxing place for a walk and a break downtown.", createdAt: "2026-05-12T16:15:00.000Z" },
] as const;

const tourSlots = [
  { id: "slot-entoto-001", placeId: "entoto-natural-park", startsAt: "2027-02-06T07:00:00.000Z", capacity: 12 },
  { id: "slot-merkato-001", placeId: "merkato", startsAt: "2027-02-07T06:30:00.000Z", capacity: 8 },
  { id: "slot-unity-park-001", placeId: "unity-park", startsAt: "2027-02-13T08:00:00.000Z", capacity: 10 },
  { id: "slot-heritage-walk-001", placeId: "holy-trinity-cathedral", startsAt: "2027-02-14T08:30:00.000Z", capacity: 6 },
] as const;

export interface SeedCounts {
  users: number;
  places: number;
  reviews: number;
  tourSlots: number;
  bookings: number;
}

type CountedTable = "users" | "places" | "reviews" | "tour_slots" | "bookings";

function countRows(db: SqliteDatabase, table: CountedTable): number {
  const result = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as
    | { count: number }
    | undefined;

  if (!result) {
    throw new Error(`Could not count rows in ${table}.`);
  }

  return result.count;
}

export function seedDatabase(db: SqliteDatabase): SeedCounts {
  const seed = db.transaction(() => {
    const insertUser = db.prepare(
      "INSERT INTO users (id, name) VALUES (?, ?) ON CONFLICT(id) DO NOTHING",
    );
    const insertPlace = db.prepare(
      "INSERT INTO places (id, name, category, description, opening_hours) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    );
    const insertReview = db.prepare(
      `INSERT INTO reviews (id, place_id, user_id, rating, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING
       ON CONFLICT(place_id, user_id) DO NOTHING`,
    );
    const insertTourSlot = db.prepare(
      "INSERT INTO tour_slots (id, place_id, starts_at, capacity) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    );

    for (const user of users) {
      insertUser.run(user.id, user.name);
    }

    for (const place of places) {
      insertPlace.run(
        place.id,
        place.name,
        place.category,
        place.description,
        place.openingHours,
      );
    }

    for (const review of reviews) {
      insertReview.run(
        review.id,
        review.placeId,
        review.userId,
        review.rating,
        review.body,
        review.createdAt,
      );
    }

    for (const tourSlot of tourSlots) {
      insertTourSlot.run(
        tourSlot.id,
        tourSlot.placeId,
        tourSlot.startsAt,
        tourSlot.capacity,
      );
    }
  });

  seed.immediate();

  return {
    users: countRows(db, "users"),
    places: countRows(db, "places"),
    reviews: countRows(db, "reviews"),
    tourSlots: countRows(db, "tour_slots"),
    bookings: countRows(db, "bookings"),
  };
}
