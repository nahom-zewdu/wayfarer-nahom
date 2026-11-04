import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initializeDatabase,
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

  it("uses the working directory for relative paths and supports memory databases", () => {
    const originalDirectory = process.cwd();
    const originalDatabasePath = process.env.DATABASE_PATH;

    try {
      process.chdir(directory);
      process.env.DATABASE_PATH = join("configured", "relative.sqlite");
      const configuredDb = openDatabase();
      try {
        expect(existsSync(join(directory, "configured", "relative.sqlite"))).toBe(
          true,
        );
        expect(
          configuredDb
            .prepare("SELECT name FROM sqlite_master WHERE name = 'places'")
            .get(),
        ).toEqual({ name: "places" });
      } finally {
        configuredDb.close();
      }

      const memoryDb = openDatabase(":memory:");
      try {
        expect(
          memoryDb
            .prepare("SELECT name FROM sqlite_master WHERE name = 'places'")
            .get(),
        ).toEqual({ name: "places" });
      } finally {
        memoryDb.close();
      }
    } finally {
      process.chdir(originalDirectory);
      if (originalDatabasePath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = originalDatabasePath;
      }
    }
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
      "cancelled_at",
      "idempotency_key",
      "remaining_seats",
    ]);
  });

  it("migrates existing bookings as active and applies the migration once", () => {
    const legacyPath = join(directory, "legacy.sqlite");
    const legacyDb = new Database(legacyPath);
    legacyDb.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE places (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
        description TEXT NOT NULL, opening_hours TEXT NOT NULL
      );
      CREATE TABLE tour_slots (
        id TEXT PRIMARY KEY, place_id TEXT NOT NULL, starts_at TEXT NOT NULL,
        capacity INTEGER NOT NULL
      );
      CREATE TABLE bookings (
        id TEXT PRIMARY KEY, slot_id TEXT NOT NULL, user_id TEXT NOT NULL,
        seats INTEGER NOT NULL, created_at TEXT NOT NULL
      );
      INSERT INTO bookings VALUES (
        'legacy-booking', 'legacy-slot', 'legacy-user', 2,
        '2026-01-01T00:00:00.000Z'
      );
    `);

    try {
      initializeDatabase(legacyDb);
      initializeDatabase(legacyDb);
      expect(
        legacyDb
          .prepare(
            `SELECT id, cancelled_at AS cancelledAt, idempotency_key AS idempotencyKey,
                    remaining_seats AS remainingSeats
             FROM bookings WHERE id = ?`,
          )
          .get("legacy-booking"),
      ).toEqual({
        id: "legacy-booking",
        cancelledAt: null,
        idempotencyKey: null,
        remainingSeats: null,
      });
      expect(
        legacyDb
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
          )
          .get("idx_bookings_user_idempotency_key"),
      ).toEqual({ name: "idx_bookings_user_idempotency_key" });
    } finally {
      legacyDb.close();
    }
  });

  it("applies the seed twice without duplicates or overwriting user data", () => {
    db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(
      "user-002",
      "Yonas Bekele",
    );
    db.prepare(
      `INSERT INTO places (id, name, category, description, opening_hours)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      "addis-ababa-railway-museum",
      "Addis Ababa Railway Museum",
      "Museum",
      "A local description",
      "Illustrative",
    );
    db.prepare(
      `INSERT INTO reviews (id, place_id, user_id, rating, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "local-railway-review",
      "addis-ababa-railway-museum",
      "user-002",
      2,
      "An existing visitor review.",
      "2026-06-01T10:00:00.000Z",
    );

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
    expect(
      db
        .prepare(
          "SELECT id, rating, body FROM reviews WHERE place_id = ? AND user_id = ?",
        )
        .get("addis-ababa-railway-museum", "user-002"),
    ).toEqual({
      id: "local-railway-review",
      rating: 2,
      body: "An existing visitor review.",
    });
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

  it("rolls back all seed inserts when a database constraint fails", () => {
    db.exec(
      `CREATE TRIGGER reject_seed_slots
       BEFORE INSERT ON tour_slots
       BEGIN
         SELECT RAISE(ABORT, 'simulated seed failure');
       END`,
    );

    expect(() => seedDatabase(db)).toThrow();
    expect(db.prepare("SELECT COUNT(*) AS count FROM users").get()).toEqual({
      count: 0,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM places").get()).toEqual({
      count: 0,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM reviews").get()).toEqual({
      count: 0,
    });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM tour_slots").get(),
    ).toEqual({ count: 0 });
  });

  it("gives every seeded place reviews and includes one place with exactly one", () => {
    seedDatabase(db);

    const counts = db
      .prepare(
        `SELECT places.name, COUNT(reviews.id) AS review_count
         FROM places
         LEFT JOIN reviews ON reviews.place_id = places.id
         GROUP BY places.id
         ORDER BY places.id`,
      )
      .all() as { name: string; review_count: number }[];

    expect(counts).toHaveLength(10);
    expect(counts.every(({ review_count }) => review_count >= 1)).toBe(true);
    expect(
      counts.filter(({ review_count }) => review_count === 1).map(({ name }) => name),
    ).toContain("Red Terror Martyrs Memorial Museum");
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
