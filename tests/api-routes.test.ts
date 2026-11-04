import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openDatabase, type SqliteDatabase } from "../src/lib/db/database";
import { resetServerDatabase } from "../src/lib/db/server";
import { seedDatabase } from "../src/lib/db/seed";
import type { PlaceAvailability } from "../src/lib/places/types";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    connection: vi.fn().mockResolvedValue(undefined),
  };
});

describe("Wayfarer API routes", () => {
  let directory: string;
  let db: SqliteDatabase;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "wayfarer-api-test-"));
    process.env.DATABASE_PATH = join(directory, "test.sqlite");
    resetServerDatabase();
    db = openDatabase(process.env.DATABASE_PATH);
    seedDatabase(db);
  });

  afterEach(() => {
    db.close();
    resetServerDatabase();
    delete process.env.DATABASE_PATH;
    rmSync(directory, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it("lists places with category filtering and top-rated ordering", async () => {
    const { GET } = await import("../src/app/api/places/route");

    const allPlaces = await GET(new Request("http://localhost/api/places"));
    expect(allPlaces.status).toBe(200);
    const allBody = (await allPlaces.json()) as { places: Array<{ id: string }> };
    expect(allBody.places).toHaveLength(10);

    const filtered = await GET(
      new Request("http://localhost/api/places?category=Museum&sort=top-rated"),
    );
    expect(filtered.status).toBe(200);
    const filteredBody = (await filtered.json()) as {
      places: Array<{ id: string; category: string }>;
    };
    expect(filteredBody.places.length).toBeGreaterThan(0);
    expect(
      filteredBody.places.every((place) => place.category === "Museum"),
    ).toBe(true);

    const invalidSort = await GET(
      new Request("http://localhost/api/places?sort=invalid"),
    );
    expect(invalidSort.status).toBe(400);
    expect((await invalidSort.json()).error.code).toBe("INVALID_QUERY");

    const unknownCategory = await GET(
      new Request("http://localhost/api/places?category=Unknown"),
    );
    expect(unknownCategory.status).toBe(200);
    expect((await unknownCategory.json()).places).toEqual([]);
  });

  it("summarizes upcoming availability and filters and sorts deterministically", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2028-01-01T00:00:00.000Z"));

    const placeRows = [
      ["availability-alpha", "Alpha", "FixtureNature"],
      ["availability-beta", "Beta", "FixtureNature"],
      ["availability-epsilon", "Epsilon", "FixtureNature"],
      ["availability-gamma", "Gamma", "FixtureNature"],
      ["availability-delta", "Delta", "FixtureMuseum"],
      ["availability-none", "No Tours", "FixtureMuseum"],
    ] as const;
    for (const [id, name, category] of placeRows) {
      db.prepare(
        `INSERT INTO places (id, name, category, description, opening_hours)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, name, category, `${name} description`, "Illustrative");
    }

    const insertReview = db.prepare(
      `INSERT INTO reviews (id, place_id, user_id, rating, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const [id, placeId, userId, rating] of [
      ["alpha-review-1", "availability-alpha", "user-001", 5],
      ["alpha-review-2", "availability-alpha", "user-002", 5],
      ["alpha-review-3", "availability-alpha", "user-003", 5],
      ["beta-review", "availability-beta", "user-001", 1],
      ["epsilon-review-1", "availability-epsilon", "user-001", 4],
      ["epsilon-review-2", "availability-epsilon", "user-002", 4],
    ] as const) {
      insertReview.run(
        id,
        placeId,
        userId,
        rating,
        "Controlled availability fixture",
        "2027-01-01T00:00:00.000Z",
      );
    }

    const insertSlot = db.prepare(
      `INSERT INTO tour_slots (id, place_id, starts_at, capacity)
       VALUES (?, ?, ?, ?)`,
    );
    const insertBooking = db.prepare(
      `INSERT INTO bookings (id, slot_id, user_id, seats, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const addSlot = (
      id: string,
      placeId: string,
      startsAt: string,
      capacity: number,
      bookedSeats: number,
    ) => {
      insertSlot.run(id, placeId, startsAt, capacity);
      if (bookedSeats > 0) {
        insertBooking.run(
          `${id}-booking`,
          id,
          "user-001",
          bookedSeats,
          "2027-01-01T00:00:00.000Z",
        );
      }
    };

    addSlot(
      "alpha-past",
      "availability-alpha",
      "2027-12-31T23:59:59.999Z",
      20,
      0,
    );
    addSlot(
      "alpha-full",
      "availability-alpha",
      "2028-01-02T00:00:00.000Z",
      3,
      3,
    );
    addSlot(
      "alpha-available",
      "availability-alpha",
      "2028-01-03T00:00:00.000Z",
      8,
      2,
    );
    addSlot(
      "alpha-available-later",
      "availability-alpha",
      "2028-01-05T00:00:00.000Z",
      4,
      1,
    );
    addSlot(
      "beta-available",
      "availability-beta",
      "2028-01-04T00:00:00.000Z",
      6,
      2,
    );
    addSlot(
      "gamma-full",
      "availability-gamma",
      "2028-01-02T00:00:00.000Z",
      2,
      2,
    );
    addSlot(
      "epsilon-available",
      "availability-epsilon",
      "2028-01-06T00:00:00.000Z",
      4,
      2,
    );
    addSlot(
      "epsilon-available-later",
      "availability-epsilon",
      "2028-01-07T00:00:00.000Z",
      5,
      3,
    );
    addSlot(
      "delta-now",
      "availability-delta",
      "2028-01-01T00:00:00.000Z",
      10,
      0,
    );

    const { GET } = await import("../src/app/api/places/route");
    const list = async (query = "") => {
      const response = await GET(
        new Request(`http://localhost/api/places${query}`),
      );
      expect(response.status).toBe(200);
      return (await response.json()).places as Array<{
        id: string;
        category: string;
        availability: PlaceAvailability;
      }>;
    };

    const allPlaces = await list();
    expect(allPlaces).toHaveLength(16);
    const byId = new Map(allPlaces.map((place) => [place.id, place]));
    expect(byId.get("availability-alpha")?.availability).toEqual({
      nextAvailableSlot: {
        startsAt: "2028-01-03T00:00:00.000Z",
        remainingSeats: 6,
      },
      nextUpcomingSlot: {
        startsAt: "2028-01-02T00:00:00.000Z",
        remainingSeats: 0,
      },
      availableSlotCount: 2,
      maxAvailableSeats: 6,
    });
    expect(byId.get("availability-gamma")?.availability).toEqual({
      nextAvailableSlot: null,
      nextUpcomingSlot: {
        startsAt: "2028-01-02T00:00:00.000Z",
        remainingSeats: 0,
      },
      availableSlotCount: 0,
      maxAvailableSeats: 0,
    });
    expect(byId.get("availability-epsilon")?.availability).toEqual({
      nextAvailableSlot: {
        startsAt: "2028-01-06T00:00:00.000Z",
        remainingSeats: 2,
      },
      nextUpcomingSlot: {
        startsAt: "2028-01-06T00:00:00.000Z",
        remainingSeats: 2,
      },
      availableSlotCount: 2,
      maxAvailableSeats: 2,
    });
    expect(byId.get("availability-delta")?.availability).toEqual({
      nextAvailableSlot: null,
      nextUpcomingSlot: null,
      availableSlotCount: 0,
      maxAvailableSeats: 0,
    });
    expect(byId.get("availability-none")?.availability).toEqual({
      nextAvailableSlot: null,
      nextUpcomingSlot: null,
      availableSlotCount: 0,
      maxAvailableSeats: 0,
    });

    const minimumOne = await list("?minSeats=1");
    expect(minimumOne.map((place) => place.id)).toEqual(
      expect.arrayContaining([
        "availability-alpha",
        "availability-beta",
        "availability-epsilon",
      ]),
    );
    expect(minimumOne.some((place) => place.id === "availability-gamma")).toBe(
      false,
    );
    expect(
      (await list("?category=FixtureNature&minSeats=4")).map(
        (place) => place.id,
      ),
    ).toEqual(["availability-alpha", "availability-beta"]);
    expect((await list("?minSeats=6")).map((place) => place.id)).toEqual([
      "availability-alpha",
    ]);

    const natureIds = (sort: string) =>
      list(`?category=FixtureNature&sort=${sort}`).then((places) =>
        places.map((place) => place.id),
      );
    expect(await natureIds("name")).toEqual([
      "availability-alpha",
      "availability-beta",
      "availability-epsilon",
      "availability-gamma",
    ]);
    expect(await natureIds("top-rated")).toEqual([
      "availability-alpha",
      "availability-gamma",
      "availability-epsilon",
      "availability-beta",
    ]);
    expect(await natureIds("soonest-available")).toEqual([
      "availability-alpha",
      "availability-beta",
      "availability-epsilon",
      "availability-gamma",
    ]);
    expect(await natureIds("most-available")).toEqual([
      "availability-alpha",
      "availability-beta",
      "availability-epsilon",
      "availability-gamma",
    ]);

    for (const invalid of ["", "0", "-1", "1.5", "1e2", "1001", "9007199254740992"]) {
      const response = await GET(
        new Request(`http://localhost/api/places?minSeats=${invalid}`),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_QUERY");
    }
    const invalidSort = await GET(
      new Request("http://localhost/api/places?sort=least-busy"),
    );
    expect(invalidSort.status).toBe(400);
    expect((await invalidSort.json()).error.code).toBe("INVALID_QUERY");
  });

  it("returns a place detail response with reviews and tour slots", async () => {
    const routeModule = await import("../src/app/api/places/[id]/route");
    const response = await routeModule.GET(
      new Request("http://localhost/api/places/national-museum-of-ethiopia"),
      { params: Promise.resolve({ id: "national-museum-of-ethiopia" }) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      place: { id: string; name: string };
      ratingSummary: { averageRating: number | null; reviewCount: number };
      reviews: Array<{ userId: string; reviewerName: string }>;
      tourSlots: Array<{ id: string; remainingSeats: number }>;
    };

    expect(body.place.id).toBe("national-museum-of-ethiopia");
    expect(body.place.name).toBe("National Museum of Ethiopia");
    expect(body.ratingSummary.reviewCount).toBe(3);
    expect(body.reviews.length).toBeGreaterThan(0);
    expect(body.reviews[0].reviewerName).toBeTruthy();
    expect(body.tourSlots).toEqual([]);
  });

  it("reports persisted booked and remaining seats in place details", async () => {
    const slotId = "slot-entoto-001";
    db.prepare(
      `INSERT INTO bookings (id, slot_id, user_id, seats, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      "detail-booking-one",
      slotId,
      "user-001",
      3,
      "2026-01-01T00:00:00.000Z",
    );
    db.prepare(
      `INSERT INTO bookings (id, slot_id, user_id, seats, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      "detail-booking-two",
      slotId,
      "user-002",
      2,
      "2026-01-02T00:00:00.000Z",
    );

    const routeModule = await import("../src/app/api/places/[id]/route");
    const response = await routeModule.GET(
      new Request("http://localhost/api/places/entoto-natural-park"),
      { params: Promise.resolve({ id: "entoto-natural-park" }) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      tourSlots: Array<{
        id: string;
        capacity: number;
        bookedSeats: number;
        remainingSeats: number;
      }>;
    };
    expect(body.tourSlots).toEqual([
      {
        id: slotId,
        startsAt: "2027-02-06T07:00:00.000Z",
        capacity: 12,
        bookedSeats: 5,
        remainingSeats: 7,
      },
    ]);
  });

  it("returns 404 for missing place IDs and exposes the seeded users", async () => {
    const detailModule = await import("../src/app/api/places/[id]/route");
    const missing = await detailModule.GET(
      new Request("http://localhost/api/places/nope"),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("PLACE_NOT_FOUND");

    const usersModule = await import("../src/app/api/users/route");
    const users = await usersModule.GET();
    expect(users.status).toBe(200);
    const usersBody = (await users.json()) as {
      users: Array<{ id: string; name: string }>;
    };
    expect(usersBody.users).toHaveLength(3);
    expect(usersBody.users[0].id).toBe("user-001");
  });

  it("creates and updates reviews using the acting user header", async () => {
    const routeModule = await import("../src/app/api/places/[id]/reviews/route");
    const createRequest = new Request(
      "http://localhost/api/places/national-museum-of-ethiopia/reviews",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": "user-001",
        },
        body: JSON.stringify({ rating: 5, body: "Excellent museum." }),
      },
    );

    const createResponse = await routeModule.POST(
      createRequest,
      { params: Promise.resolve({ id: "national-museum-of-ethiopia" }) },
    );
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as {
      review: { id: string; userId: string; rating: number; body: string };
    };
    expect(created.review.userId).toBe("user-001");
    expect(created.review.rating).toBe(5);
    expect(created.review.body).toBe("Excellent museum.");

    const updateRequest = new Request(
      "http://localhost/api/places/national-museum-of-ethiopia/reviews",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": "user-001",
        },
        body: JSON.stringify({ rating: 2, body: "Updated review text." }),
      },
    );
    const updateResponse = await routeModule.POST(
      updateRequest,
      { params: Promise.resolve({ id: "national-museum-of-ethiopia" }) },
    );
    expect(updateResponse.status).toBe(200);
    const updated = (await updateResponse.json()) as {
      review: { id: string; body: string; rating: number };
    };
    expect(updated.review.id).toBe(created.review.id);
    expect(updated.review.body).toBe("Updated review text.");
    expect(updated.review.rating).toBe(2);

    const missingUserResponse = await routeModule.POST(
      new Request(
        "http://localhost/api/places/national-museum-of-ethiopia/reviews",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: 4, body: "Missing header" }),
        },
      ),
      { params: Promise.resolve({ id: "national-museum-of-ethiopia" }) },
    );
    expect(missingUserResponse.status).toBe(400);
    expect((await missingUserResponse.json()).error.code).toBe("INVALID_INPUT");

    const invalidBody = await routeModule.POST(
      new Request(
        "http://localhost/api/places/national-museum-of-ethiopia/reviews",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": "user-001",
          },
          body: JSON.stringify({ rating: 6, body: "Invalid" }),
        },
      ),
      { params: Promise.resolve({ id: "national-museum-of-ethiopia" }) },
    );
    expect(invalidBody.status).toBe(400);
    expect((await invalidBody.json()).error.code).toBe("INVALID_INPUT");

    const unknownUserResponse = await routeModule.POST(
      new Request(
        "http://localhost/api/places/national-museum-of-ethiopia/reviews",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": "unknown-user",
          },
          body: JSON.stringify({ rating: 4, body: "Unknown user review." }),
        },
      ),
      { params: Promise.resolve({ id: "national-museum-of-ethiopia" }) },
    );
    expect(unknownUserResponse.status).toBe(404);
    expect((await unknownUserResponse.json()).error).toEqual({
      code: "USER_NOT_FOUND",
      message: 'User "unknown-user" does not exist.',
    });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM reviews WHERE user_id = 'unknown-user'",
        )
        .get(),
    ).toEqual({ count: 0 });

    const malformedJsonResponse = await routeModule.POST(
      new Request(
        "http://localhost/api/places/national-museum-of-ethiopia/reviews",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": "user-001",
          },
          body: '{"rating":',
        },
      ),
      { params: Promise.resolve({ id: "national-museum-of-ethiopia" }) },
    );
    expect(malformedJsonResponse.status).toBe(400);
    expect((await malformedJsonResponse.json()).error).toEqual({
      code: "MALFORMED_JSON",
      message: "Request body must be valid JSON.",
    });
  });

  it("books seats and rejects invalid, full, and malformed requests", async () => {
    const routeModule = await import(
      "../src/app/api/tour-slots/[id]/bookings/route",
    );

    db.prepare(
      `INSERT INTO tour_slots (id, place_id, starts_at, capacity) VALUES (?, ?, ?, ?)`,
    ).run(
      "test-slot-available",
      "national-museum-of-ethiopia",
      "2027-03-01T10:00:00.000Z",
      2,
    );

    const successResponse = await routeModule.POST(
      new Request("http://localhost/api/tour-slots/test-slot-available/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": "user-001",
        },
        body: JSON.stringify({ seats: 2 }),
      }),
      { params: Promise.resolve({ id: "test-slot-available" }) },
    );
    expect(successResponse.status).toBe(201);
    const successBody = (await successResponse.json()) as {
      booking: { seats: number; userId: string };
      remainingSeats: number;
    };
    expect(successBody.booking.seats).toBe(2);
    expect(successBody.booking.userId).toBe("user-001");
    expect(successBody.remainingSeats).toBe(0);

    db.prepare(
      `INSERT INTO tour_slots (id, place_id, starts_at, capacity) VALUES (?, ?, ?, ?)`,
    ).run(
      "test-slot-full",
      "holy-trinity-cathedral",
      "2027-03-02T10:00:00.000Z",
      1,
    );
    db.prepare(
      `INSERT INTO bookings (id, slot_id, user_id, seats, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(
      "booking-full-slot",
      "test-slot-full",
      "user-002",
      1,
      "2026-01-01T00:00:00.000Z",
    );

    const fullResponse = await routeModule.POST(
      new Request("http://localhost/api/tour-slots/test-slot-full/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": "user-001",
        },
        body: JSON.stringify({ seats: 1 }),
      }),
      { params: Promise.resolve({ id: "test-slot-full" }) },
    );
    expect(fullResponse.status).toBe(409);
    expect((await fullResponse.json()).error.code).toBe("SLOT_FULL");

    const invalidSeats = await routeModule.POST(
      new Request("http://localhost/api/tour-slots/test-slot-full/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": "user-001",
        },
        body: JSON.stringify({ seats: 0 }),
      }),
      { params: Promise.resolve({ id: "test-slot-full" }) },
    );
    expect(invalidSeats.status).toBe(400);
    expect((await invalidSeats.json()).error.code).toBe("INVALID_INPUT");

    db.prepare(
      `INSERT INTO tour_slots (id, place_id, starts_at, capacity)
       VALUES (?, ?, ?, ?)`,
    ).run(
      "test-slot-limited",
      "national-museum-of-ethiopia",
      "2027-03-03T10:00:00.000Z",
      2,
    );
    db.prepare(
      `INSERT INTO bookings (id, slot_id, user_id, seats, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      "booking-limited-slot",
      "test-slot-limited",
      "user-002",
      1,
      "2026-01-01T00:00:00.000Z",
    );

    const overCapacityResponse = await routeModule.POST(
      new Request(
        "http://localhost/api/tour-slots/test-slot-limited/bookings",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": "user-001",
          },
          body: JSON.stringify({ seats: 2 }),
        },
      ),
      { params: Promise.resolve({ id: "test-slot-limited" }) },
    );
    expect(overCapacityResponse.status).toBe(409);
    expect((await overCapacityResponse.json()).error).toEqual({
      code: "INSUFFICIENT_CAPACITY",
      message: "Only 1 seat(s) remain in this tour slot.",
    });
    expect(
      db
        .prepare("SELECT COUNT(*) AS count FROM bookings WHERE slot_id = ?")
        .get("test-slot-limited"),
    ).toEqual({ count: 1 });
    expect(
      db
        .prepare(
          "SELECT COALESCE(SUM(seats), 0) AS seats FROM bookings WHERE slot_id = ?",
        )
        .get("test-slot-limited"),
    ).toEqual({ seats: 1 });

    const unknownUserResponse = await routeModule.POST(
      new Request(
        "http://localhost/api/tour-slots/test-slot-limited/bookings",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": "unknown-user",
          },
          body: JSON.stringify({ seats: 1 }),
        },
      ),
      { params: Promise.resolve({ id: "test-slot-limited" }) },
    );
    expect(unknownUserResponse.status).toBe(404);
    expect((await unknownUserResponse.json()).error).toEqual({
      code: "USER_NOT_FOUND",
      message: 'User "unknown-user" does not exist.',
    });
    expect(
      db
        .prepare("SELECT COUNT(*) AS count FROM bookings WHERE slot_id = ?")
        .get("test-slot-limited"),
    ).toEqual({ count: 1 });

    const malformed = await routeModule.POST(
      new Request("http://localhost/api/tour-slots/test-slot-full/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": "user-001",
        },
        body: '{"seats":',
      }),
      { params: Promise.resolve({ id: "test-slot-full" }) },
    );
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("MALFORMED_JSON");
  });
});
