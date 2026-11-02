import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openDatabase,
  type SqliteDatabase,
} from "../src/lib/db/database";
import { seedDatabase } from "../src/lib/db/seed";

describe("database foundation", () => {
  let directory: string;
  let db: SqliteDatabase;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "wayfarer-test-"));
    db = openDatabase(join(directory, "test.sqlite"));
  });

  afterEach(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("initializes the schema and enables foreign keys", () => {
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual([
      "bookings",
      "places",
      "reviews",
      "tour_slots",
      "users",
    ]);
  });

  it("matches the PRD column contract", () => {
    const columnsFor = (table: string): string[] =>
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => (row as { name: string }).name);

    expect(columnsFor("users")).toEqual(["id", "name"]);
    expect(columnsFor("places")).toEqual([
      "id",
      "name",
      "category",
      "description",
      "opening_hours",
    ]);
    expect(columnsFor("reviews")).toEqual([
      "id",
      "place_id",
      "user_id",
      "rating",
      "body",
      "created_at",
    ]);
    expect(columnsFor("tour_slots")).toEqual([
      "id",
      "place_id",
      "starts_at",
      "capacity",
    ]);
    expect(columnsFor("bookings")).toEqual([
      "id",
      "slot_id",
      "user_id",
      "seats",
      "created_at",
    ]);
  });

  it("applies the seed twice without duplicates or overwriting user data", () => {
    const firstCounts = seedDatabase(db);

    db.prepare(
      "INSERT INTO users (id, name) VALUES (?, ?)",
    ).run("user-created", "Locally added user");

    const secondCounts = seedDatabase(db);

    expect(firstCounts).toEqual({
      users: 3,
      places: 10,
      reviews: 17,
      tourSlots: 4,
      bookings: 0,
    });
    expect(secondCounts).toEqual({
      ...firstCounts,
      users: 4,
    });
    expect(
      db.prepare("SELECT name FROM users WHERE id = ?").get("user-created"),
    ).toEqual({ name: "Locally added user" });
  });

  it("uses illustrative opening hours for every seeded place", () => {
    seedDatabase(db);

    const places = db
      .prepare("SELECT opening_hours FROM places")
      .all() as { opening_hours: string }[];

    expect(places).toHaveLength(10);
    for (const place of places) {
      expect(place.opening_hours).toMatch(
        /^[A-Za-z-]+ \d{2}:\d{2}-\d{2}:\d{2} \(illustrative; verify locally\)$/,
      );
    }
  });

  it("allows a seeded review to be updated without changing created_at", () => {
    seedDatabase(db);
    const createdAt = db
      .prepare("SELECT created_at FROM reviews WHERE id = ?")
      .get("review-001") as { created_at: string };

    db.prepare("UPDATE reviews SET body = ? WHERE id = ?").run(
      "Updated review body",
      "review-001",
    );

    expect(
      db
        .prepare("SELECT body, created_at FROM reviews WHERE id = ?")
        .get("review-001"),
    ).toEqual({
      body: "Updated review body",
      created_at: createdAt.created_at,
    });
  });

  it("rolls back all seed inserts when a seeded record conflicts", () => {
    db.prepare(
      "INSERT INTO users (id, name) VALUES (?, ?)",
    ).run("user-001", "Existing local name");
    db.prepare(
      "INSERT INTO places (id, name, category, description, opening_hours) VALUES (?, ?, ?, ?, ?)",
    ).run(
      "national-museum-of-ethiopia",
      "Existing local place",
      "Museum",
      "Existing local description",
      "Daily 09:00-17:00 (illustrative; verify locally)",
    );
    db.prepare(
      "INSERT INTO reviews (id, place_id, user_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      "local-review",
      "national-museum-of-ethiopia",
      "user-001",
      3,
      "Existing local review",
      "2026-06-01T10:00:00.000Z",
    );

    expect(() => seedDatabase(db)).toThrow();
    expect(db.prepare("SELECT COUNT(*) AS count FROM users").get()).toEqual({
      count: 1,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM places").get()).toEqual({
      count: 1,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM reviews").get()).toEqual({
      count: 1,
    });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM tour_slots").get(),
    ).toEqual({ count: 0 });
  });

  it("represents a place with exactly one review", () => {
    seedDatabase(db);

    const result = db
      .prepare(
        `SELECT places.name, COUNT(reviews.id) AS review_count
         FROM places
         JOIN reviews ON reviews.place_id = places.id
         WHERE places.id = ?`,
      )
      .get("red-terror-martyrs-memorial-museum") as
      | { name: string; review_count: number }
      | undefined;

    expect(result).toEqual({
      name: "Red Terror Martyrs Memorial Museum",
      review_count: 1,
    });
  });

  it("rejects ratings outside the 1–5 range", () => {
    seedDatabase(db);

    expect(() =>
      db
        .prepare(
          "INSERT INTO reviews (id, place_id, user_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          "review-invalid-rating",
          "meskel-square",
          "user-001",
          6,
          "Invalid rating",
          "2026-06-01T10:00:00.000Z",
        ),
    ).toThrow();
  });

  it("rejects duplicate reviews for the same user and place", () => {
    seedDatabase(db);

    expect(() =>
      db
        .prepare(
          "INSERT INTO reviews (id, place_id, user_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          "review-duplicate",
          "meskel-square",
          "user-003",
          4,
          "Second review for the same place",
          "2026-06-01T10:00:00.000Z",
        ),
    ).toThrow();
  });

  it("prevents reviews and bookings from referencing missing records", () => {
    seedDatabase(db);

    expect(() =>
      db
        .prepare(
          "INSERT INTO reviews (id, place_id, user_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          "review-invalid-place",
          "missing-place",
          "user-001",
          4,
          "Invalid place",
          "2026-06-01T10:00:00.000Z",
        ),
    ).toThrow();

    expect(() =>
      db
        .prepare(
          "INSERT INTO reviews (id, place_id, user_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          "review-invalid-user",
          "meskel-square",
          "missing-user",
          4,
          "Invalid user",
          "2026-06-01T10:00:00.000Z",
        ),
    ).toThrow();

    expect(() =>
      db
        .prepare(
          "INSERT INTO bookings (id, slot_id, user_id, seats, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          "booking-invalid-slot",
          "missing-slot",
          "user-001",
          1,
          "2026-06-01T10:00:00.000Z",
        ),
    ).toThrow();

    expect(() =>
      db
        .prepare(
          "INSERT INTO bookings (id, slot_id, user_id, seats, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          "booking-invalid-user",
          "slot-entoto-001",
          "missing-user",
          1,
          "2026-06-01T10:00:00.000Z",
        ),
    ).toThrow();
  });

  it("rejects non-positive capacities and booking seat counts", () => {
    seedDatabase(db);

    expect(() =>
      db
        .prepare(
          "INSERT INTO tour_slots (id, place_id, starts_at, capacity) VALUES (?, ?, ?, ?)",
        )
        .run(
          "slot-zero-capacity",
          "meskel-square",
          "2027-03-01T10:00:00.000Z",
          0,
        ),
    ).toThrow();

    expect(() =>
      db
        .prepare(
          "INSERT INTO bookings (id, slot_id, user_id, seats, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          "booking-zero-seats",
          "slot-entoto-001",
          "user-001",
          0,
          "2026-06-01T10:00:00.000Z",
        ),
    ).toThrow();
  });
});
