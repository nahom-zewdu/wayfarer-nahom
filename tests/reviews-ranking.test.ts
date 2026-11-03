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

  it("creates a review and increases that place's count from zero to one", () => {
    createReviewFixtures(db);
    expect(countReviews(db, "review-place-a")).toBe(0);

    const review = submitReview(db, {
      placeId: "review-place-a",
      userId: "review-user-a",
      rating: 5,
      body: "  A great place to visit.  ",
    });

    expect(review).toMatchObject({
      placeId: "review-place-a",
      userId: "review-user-a",
      rating: 5,
      body: "A great place to visit.",
    });
    expect(review.id).toBeTruthy();
    expect(review.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(countReviews(db, "review-place-a")).toBe(1);
  });

  it("updates one review while preserving its ID and created_at", () => {
    createReviewFixtures(db);
    const original = submitReview(db, {
      placeId: "review-place-a",
      userId: "review-user-a",
      rating: 2,
      body: "Initial review",
    });
    expect(countReviews(db, "review-place-a")).toBe(1);

    const updated = submitReview(db, {
      placeId: "review-place-a",
      userId: "review-user-a",
      rating: 5,
      body: "Updated review",
    });

    expect(updated).toEqual({
      ...original,
      rating: 5,
      body: "Updated review",
    });
    expect(countReviews(db, "review-place-a")).toBe(1);
  });

  it("stores separate reviews for different users at one place", () => {
    createReviewFixtures(db);
    db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(
      "review-user-b",
      "Review User B",
    );

    const first = submitReview(db, {
      placeId: "review-place-a",
      userId: "review-user-a",
      rating: 4,
      body: "A pleasant walk.",
    });
    const second = submitReview(db, {
      placeId: "review-place-a",
      userId: "review-user-b",
      rating: 5,
      body: "Enjoyed the gardens.",
    });

    expect(first.id).not.toBe(second.id);
    expect(countReviews(db, "review-place-a")).toBe(2);
  });

  it("rejects non-integer ratings and ratings outside 1–5", () => {
    createReviewFixtures(db);

    for (const rating of [0, 6, 2.5]) {
      expect(() =>
        submitReview(db, {
          placeId: "review-place-a",
          userId: "review-user-a",
          rating,
          body: "A valid body.",
        }),
      ).toThrow(ReviewServiceError);
    }
  });

  it("rejects empty, whitespace-only, and overlong review bodies", () => {
    createReviewFixtures(db);

    for (const body of [
      "",
      " \t\n ",
      "x".repeat(MAX_REVIEW_BODY_LENGTH + 1),
      "😀".repeat(MAX_REVIEW_BODY_LENGTH + 1),
    ]) {
      expect(() =>
        submitReview(db, {
          placeId: "review-place-a",
          userId: "review-user-a",
          rating: 4,
          body,
        }),
      ).toThrow(ReviewServiceError);
    }
  });

  it("reports missing places and users clearly", () => {
    createReviewFixtures(db);

    expect(() =>
      submitReview(db, {
        placeId: "missing-place",
        userId: "review-user-a",
        rating: 4,
        body: "A valid body.",
      }),
    ).toThrowError(expect.objectContaining({ code: "PLACE_NOT_FOUND" }));

    expect(() =>
      submitReview(db, {
        placeId: "review-place-a",
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

  it("places an unrated place between higher- and lower-rated reviewed places", () => {
    const ranked = rankPlaces([
      placeSummary("reviewed-high", 5, 2),
      placeSummary("unrated", null, 0),
      placeSummary("reviewed-low", 1, 2),
    ]);

    expect(ranked.map(({ id }) => id)).toEqual([
      "reviewed-high",
      "unrated",
      "reviewed-low",
    ]);
    expect(ranked.find((place) => place.id === "unrated")?.rankingScore).toBe(
      3,
    );
  });

  it("handles empty ranking input and assigns unreviewed places a neutral score", () => {
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

  it("rejects ranking inputs outside valid ranges", () => {
    expect(() => calculateAdjustedScore(4, 1, 0)).toThrow(RangeError);
    expect(() => calculateAdjustedScore(4, 1, 6)).toThrow(RangeError);
    expect(() =>
      calculateAdjustedScore(4, 1, Number.NaN),
    ).toThrow(RangeError);
    expect(() => calculateAdjustedScore(6, 1, 3)).toThrow(RangeError);
    expect(() =>
      rankPlaces([placeSummary("invalid-count", 4, -1)]),
    ).toThrow(RangeError);
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

function createReviewFixtures(db: SqliteDatabase): void {
  db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(
    "review-user-a",
    "Review User A",
  );
  db.prepare(
    `INSERT INTO places (id, name, category, description, opening_hours)
     VALUES (?, ?, 'Test', 'Test place', 'Daily 09:00-17:00')`,
  ).run("review-place-a", "Review Place A");
}

function countReviews(db: SqliteDatabase, placeId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM reviews WHERE place_id = ?")
    .get(placeId) as { count: number };

  return row.count;
}
