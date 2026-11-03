import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_RANKING_PRIOR_STRENGTH,
  calculateAdjustedScore,
  getRankedPlaces,
  rankPlaces,
  type PlaceRatingSummary,
} from "../src/lib/places/ranking";
import {
  MAX_REVIEW_BODY_LENGTH,
  ReviewServiceError,
  submitReview,
} from "../src/lib/reviews/service";
import {
  openDatabase,
  type SqliteDatabase,
} from "../src/lib/db/database";
import { seedDatabase } from "../src/lib/db/seed";

describe("review service and confidence-adjusted ranking", () => {
  let directory: string;
  let db: SqliteDatabase;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "wayfarer-reviews-test-"));
    db = openDatabase(join(directory, "test.sqlite"));
  });

  afterEach(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("creates a review for an existing place and user", () => {
    seedDatabase(db);

    const review = submitReview(db, {
      placeId: "meskel-square",
      userId: "user-001",
      rating: 5,
      body: "  A great place to visit.  ",
    });

    expect(review).toMatchObject({
      placeId: "meskel-square",
      userId: "user-001",
      rating: 5,
      body: "A great place to visit.",
    });
    expect(review.id).toBeTruthy();
    expect(review.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it("updates an existing review and preserves its ID and created_at", () => {
    seedDatabase(db);
    const original = submitReview(db, {
      placeId: "meskel-square",
      userId: "user-001",
      rating: 2,
      body: "Initial review",
    });

    const updated = submitReview(db, {
      placeId: "meskel-square",
      userId: "user-001",
      rating: 5,
      body: "Updated review",
    });

    expect(updated).toEqual({
      ...original,
      rating: 5,
      body: "Updated review",
    });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM reviews WHERE place_id = ? AND user_id = ?",
        )
        .get("meskel-square", "user-001"),
    ).toEqual({ count: 1 });
  });

  it("allows different users to review the same place", () => {
    seedDatabase(db);

    const first = submitReview(db, {
      placeId: "friendship-square",
      userId: "user-001",
      rating: 4,
      body: "A pleasant walk.",
    });
    const second = submitReview(db, {
      placeId: "friendship-square",
      userId: "user-003",
      rating: 5,
      body: "Enjoyed the gardens.",
    });

    expect(first.id).not.toBe(second.id);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM reviews WHERE place_id = ?",
        )
        .get("friendship-square"),
    ).toEqual({ count: 3 });
  });

  it("rejects ratings outside the integer range 1–5", () => {
    seedDatabase(db);

    for (const rating of [0, 6, 2.5]) {
      expect(() =>
        submitReview(db, {
          placeId: "meskel-square",
          userId: "user-001",
          rating,
          body: "A valid body.",
        }),
      ).toThrow(ReviewServiceError);
    }
  });

  it("rejects empty, whitespace-only, and overlong review bodies", () => {
    seedDatabase(db);

    for (const body of [
      "",
      " \t\n ",
      "x".repeat(MAX_REVIEW_BODY_LENGTH + 1),
      "😀".repeat(MAX_REVIEW_BODY_LENGTH + 1),
    ]) {
      expect(() =>
        submitReview(db, {
          placeId: "meskel-square",
          userId: "user-001",
          rating: 4,
          body,
        }),
      ).toThrow(ReviewServiceError);
    }
  });

  it("reports missing places and users clearly", () => {
    seedDatabase(db);

    expect(() =>
      submitReview(db, {
        placeId: "missing-place",
        userId: "user-001",
        rating: 4,
        body: "A valid body.",
      }),
    ).toThrowError(expect.objectContaining({ code: "PLACE_NOT_FOUND" }));

    expect(() =>
      submitReview(db, {
        placeId: "meskel-square",
        userId: "missing-user",
        rating: 4,
        body: "A valid body.",
      }),
    ).toThrowError(expect.objectContaining({ code: "USER_NOT_FOUND" }));
  });

  it("rejects place and user IDs with surrounding whitespace", () => {
    createReviewFixtures(db);

    expect(() =>
      submitReview(db, {
        placeId: " review-place-a",
        userId: "review-user-a",
        rating: 4,
        body: "A valid body.",
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID_INPUT",
        message: "Place ID cannot contain surrounding whitespace.",
      }),
    );

    expect(() =>
      submitReview(db, {
        placeId: "review-place-a",
        userId: "review-user-a ",
        rating: 4,
        body: "A valid body.",
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID_INPUT",
        message: "User ID cannot contain surrounding whitespace.",
      }),
    );
  });

  it("moderates a low-count perfect rating below a supported high rating", () => {
    const ranked = rankPlaces([
      placeSummary("well-supported", 4.5, 10),
      placeSummary("one-perfect-review", 5, 1),
      placeSummary("low-rated", 1, 10),
    ]);

    expect(ranked.map((place) => place.id)).toEqual([
      "well-supported",
      "one-perfect-review",
      "low-rated",
    ]);
    expect(
      ranked.every(({ rankingScore }) => Number.isFinite(rankingScore)),
    ).toBe(true);
  });

  it("increases confidence in a place average as review count grows", () => {
    const lowCount = calculateAdjustedScore(5, 1, 3);
    const highCount = calculateAdjustedScore(5, 10, 3);

    expect(lowCount).toBeCloseTo(3.333333);
    expect(highCount).toBeCloseTo(4.333333);
    expect(highCount).toBeGreaterThan(lowCount);
  });

  it("gives a zero-review place the global mean and handles an empty dataset", () => {
    const ranked = rankPlaces([
      placeSummary("reviewed", 4, 2),
      placeSummary("no-reviews", null, 0),
    ]);

    expect(ranked.find((place) => place.id === "no-reviews")?.rankingScore).toBe(
      4,
    );
    expect(rankPlaces([])).toEqual([]);
    expect(
      rankPlaces([
        placeSummary("unreviewed-b", null, 0),
        placeSummary("unreviewed-a", null, 0),
      ]).map(({ id, rankingScore }) => ({ id, rankingScore })),
    ).toEqual([
      { id: "unreviewed-a", rankingScore: 3 },
      { id: "unreviewed-b", rankingScore: 3 },
    ]);
  });

  it("sorts equal scores by place ID in ascending order", () => {
    const ranked = rankPlaces([
      placeSummary("place-b", 4, 3),
      placeSummary("place-a", 4, 3),
    ]);

    expect(ranked.map((place) => place.id)).toEqual(["place-a", "place-b"]);
  });

  it("returns places in confidence-adjusted order from the SQLite query", () => {
    const insertUser = db.prepare("INSERT INTO users (id, name) VALUES (?, ?)");
    const insertPlace = db.prepare(
      `INSERT INTO places (id, name, category, description, opening_hours)
       VALUES (?, ?, 'Test', 'Test place', 'Daily 09:00-17:00')`,
    );
    const insertReview = db.prepare(
      `INSERT INTO reviews (id, place_id, user_id, rating, body, created_at)
       VALUES (?, ?, ?, ?, 'Test review', '2026-01-01T00:00:00.000Z')`,
    );

    const setup = db.transaction(() => {
      insertPlace.run("a-supported", "Supported");
      insertPlace.run("b-perfect", "Perfect");
      insertPlace.run("c-low", "Low");

      const ratings = [
        ...Array.from({ length: 5 }, () => ["a-supported", 4] as const),
        ...Array.from({ length: 5 }, () => ["a-supported", 5] as const),
        ["b-perfect", 5] as const,
        ...Array.from({ length: 10 }, () => ["c-low", 1] as const),
      ];

      ratings.forEach(([placeId, rating], index) => {
        const userId = `ranking-user-${index}`;
        insertUser.run(userId, userId);
        insertReview.run(
          `ranking-review-${index}`,
          placeId,
          userId,
          rating,
        );
      });
    });
    setup();

    expect(getRankedPlaces(db).map((place) => place.id)).toEqual([
      "a-supported",
      "b-perfect",
      "c-low",
    ]);
    expect(DEFAULT_RANKING_PRIOR_STRENGTH).toBe(5);
  });
});

function placeSummary(
  id: string,
  averageRating: number | null,
  reviewCount: number,
): PlaceRatingSummary {
  return {
    id,
    name: id,
    category: "Test",
    description: "Test place",
    openingHours: "Daily 09:00-17:00",
    averageRating,
    reviewCount,
  };
}
