import type { SqliteDatabase } from "../db/database";

export const DEFAULT_RANKING_PRIOR_STRENGTH = 5;
export const NO_REVIEW_GLOBAL_MEAN = 3;

export interface PlaceRatingSummary {
  id: string;
  name: string;
  category: string;
  description: string;
  openingHours: string;
  averageRating: number | null;
  reviewCount: number;
}

export interface RankedPlace extends PlaceRatingSummary {
  rankingScore: number;
}

export function calculateAdjustedScore(
  averageRating: number | null,
  reviewCount: number,
  globalMean: number,
  priorStrength = DEFAULT_RANKING_PRIOR_STRENGTH,
): number {
  if (!Number.isSafeInteger(reviewCount) || reviewCount < 0) {
    throw new RangeError("Review count must be a non-negative safe integer.");
  }
  if (!Number.isFinite(globalMean)) {
    throw new RangeError("Global mean must be finite.");
  }
  if (!Number.isFinite(priorStrength) || priorStrength <= 0) {
    throw new RangeError("Prior strength must be a positive finite number.");
  }
  if (
    reviewCount > 0 &&
    (averageRating === null || !Number.isFinite(averageRating))
  ) {
    throw new RangeError("Places with reviews must have a finite average.");
  }

  if (reviewCount === 0) {
    return globalMean;
  }

  if (averageRating === null) {
    throw new RangeError("Places with reviews must have an average rating.");
  }

  const score =
    (reviewCount / (reviewCount + priorStrength)) * averageRating +
    (priorStrength / (reviewCount + priorStrength)) * globalMean;

  if (!Number.isFinite(score)) {
    throw new RangeError("Adjusted rating score must be finite.");
  }

  return score;
}

export function rankPlaces(
  places: readonly PlaceRatingSummary[],
  priorStrength = DEFAULT_RANKING_PRIOR_STRENGTH,
): RankedPlace[] {
  if (!Number.isFinite(priorStrength) || priorStrength <= 0) {
    throw new RangeError("Prior strength must be a positive finite number.");
  }

  let totalReviews = 0;
  let totalRating = 0;

  for (const place of places) {
    if (!Number.isSafeInteger(place.reviewCount) || place.reviewCount < 0) {
      throw new RangeError("Review count must be a non-negative safe integer.");
    }
    if (
      place.reviewCount > 0 &&
      (place.averageRating === null ||
        !Number.isFinite(place.averageRating) ||
        place.averageRating < 1 ||
        place.averageRating > 5)
    ) {
      throw new RangeError("A place average must be between 1 and 5.");
    }

    totalReviews += place.reviewCount;
    totalRating += (place.averageRating ?? 0) * place.reviewCount;
  }

  if (!Number.isSafeInteger(totalReviews) || !Number.isFinite(totalRating)) {
    throw new RangeError("Review totals must be finite and safe.");
  }

  const globalMean =
    totalReviews === 0
      ? NO_REVIEW_GLOBAL_MEAN
      : totalRating / totalReviews;

  const ranked = places.map((place) => ({
    ...place,
    rankingScore: calculateAdjustedScore(
      place.averageRating,
      place.reviewCount,
      globalMean,
      priorStrength,
    ),
  }));

  ranked.sort((left, right) => {
    if (left.rankingScore !== right.rankingScore) {
      return right.rankingScore - left.rankingScore;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });

  return ranked;
}

interface PlaceRatingRow {
  id: string;
  name: string;
  category: string;
  description: string;
  openingHours: string;
  averageRating: number | null;
  reviewCount: number;
}

export function getRankedPlaces(
  db: SqliteDatabase,
  priorStrength = DEFAULT_RANKING_PRIOR_STRENGTH,
): RankedPlace[] {
  const places = db
    .prepare(
      `SELECT
         places.id,
         places.name,
         places.category,
         places.description,
         places.opening_hours AS openingHours,
         AVG(reviews.rating) AS averageRating,
         COUNT(reviews.id) AS reviewCount
       FROM places
       LEFT JOIN reviews ON reviews.place_id = places.id
       GROUP BY places.id
       ORDER BY places.id`,
    )
    .all() as PlaceRatingRow[];

  return rankPlaces(places, priorStrength);
}
