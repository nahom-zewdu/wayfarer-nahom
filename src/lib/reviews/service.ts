import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "../db/database";
import { MAX_REVIEW_BODY_LENGTH } from "./constants";

export { MAX_REVIEW_BODY_LENGTH } from "./constants";

export interface SubmitReviewInput {
  placeId: string;
  userId: string;
  rating: number;
  body: string;
}

export interface Review {
  id: string;
  placeId: string;
  userId: string;
  rating: number;
  body: string;
  createdAt: string;
}

export type ReviewServiceErrorCode =
  | "INVALID_INPUT"
  | "PLACE_NOT_FOUND"
  | "USER_NOT_FOUND";

export class ReviewServiceError extends Error {
  constructor(
    public readonly code: ReviewServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReviewServiceError";
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function validateInput(input: unknown): SubmitReviewInput {
  if (!isRecord(input)) {
    throw new ReviewServiceError(
      "INVALID_INPUT",
      "Review input must be an object.",
    );
  }

  if (typeof input.placeId !== "string" || input.placeId.trim() === "") {
    throw new ReviewServiceError("INVALID_INPUT", "A place ID is required.");
  }
  if (input.placeId !== input.placeId.trim()) {
    throw new ReviewServiceError(
      "INVALID_INPUT",
      "Place ID cannot contain surrounding whitespace.",
    );
  }

  if (typeof input.userId !== "string" || input.userId.trim() === "") {
    throw new ReviewServiceError("INVALID_INPUT", "A user ID is required.");
  }
  if (input.userId !== input.userId.trim()) {
    throw new ReviewServiceError(
      "INVALID_INPUT",
      "User ID cannot contain surrounding whitespace.",
    );
  }

  if (
    typeof input.rating !== "number" ||
    !Number.isInteger(input.rating) ||
    input.rating < 1 ||
    input.rating > 5
  ) {
    throw new ReviewServiceError(
      "INVALID_INPUT",
      "Rating must be an integer from 1 to 5.",
    );
  }

  if (typeof input.body !== "string") {
    throw new ReviewServiceError("INVALID_INPUT", "Review body must be text.");
  }

  const body = input.body.trim();
  if (body.length === 0) {
    throw new ReviewServiceError(
      "INVALID_INPUT",
      "Review body cannot be empty.",
    );
  }

  if (Array.from(body).length > MAX_REVIEW_BODY_LENGTH) {
    throw new ReviewServiceError(
      "INVALID_INPUT",
      `Review body cannot exceed ${MAX_REVIEW_BODY_LENGTH} characters.`,
    );
  }

  return {
    placeId: input.placeId,
    userId: input.userId,
    rating: input.rating,
    body,
  };
}

export function submitReview(
  db: SqliteDatabase,
  input: SubmitReviewInput,
): Review {
  input = validateInput(input);
  const body = input.body;
  const createdAt = new Date().toISOString();
  const id = randomUUID();

  const submit = db.transaction((): Review => {
    const place = db
      .prepare("SELECT 1 AS found FROM places WHERE id = ?")
      .get(input.placeId);
    if (!place) {
      throw new ReviewServiceError(
        "PLACE_NOT_FOUND",
        `Place "${input.placeId}" does not exist.`,
      );
    }

    const user = db
      .prepare("SELECT 1 AS found FROM users WHERE id = ?")
      .get(input.userId);
    if (!user) {
      throw new ReviewServiceError(
        "USER_NOT_FOUND",
        `User "${input.userId}" does not exist.`,
      );
    }

    const review = db
      .prepare(
        `INSERT INTO reviews (id, place_id, user_id, rating, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (place_id, user_id) DO UPDATE
         SET rating = excluded.rating, body = excluded.body
         RETURNING
           id,
           place_id AS placeId,
           user_id AS userId,
           rating,
           body,
           created_at AS createdAt`,
      )
      .get(
        id,
        input.placeId,
        input.userId,
        input.rating,
        body,
        createdAt,
      ) as Review | undefined;

    if (!review) {
      throw new Error("Review upsert did not return a review.");
    }

    return review;
  });

  return submit.immediate();
}

export function deleteReview(
  db: SqliteDatabase,
  placeId: string,
  userId: string,
): boolean {
  if (typeof placeId !== "string" || placeId.trim() === "") {
    throw new ReviewServiceError("INVALID_INPUT", "A place ID is required.");
  }
  if (placeId !== placeId.trim()) {
    throw new ReviewServiceError(
      "INVALID_INPUT",
      "Place ID cannot contain surrounding whitespace.",
    );
  }
  if (typeof userId !== "string" || userId.trim() === "") {
    throw new ReviewServiceError("INVALID_INPUT", "A user ID is required.");
  }
  if (userId !== userId.trim()) {
    throw new ReviewServiceError(
      "INVALID_INPUT",
      "User ID cannot contain surrounding whitespace.",
    );
  }

  const remove = db.transaction(() => {
    const place = db
      .prepare("SELECT 1 AS found FROM places WHERE id = ?")
      .get(placeId);
    if (!place) {
      throw new ReviewServiceError(
        "PLACE_NOT_FOUND",
        `Place "${placeId}" does not exist.`,
      );
    }

    const user = db
      .prepare("SELECT 1 AS found FROM users WHERE id = ?")
      .get(userId);
    if (!user) {
      throw new ReviewServiceError(
        "USER_NOT_FOUND",
        `User "${userId}" does not exist.`,
      );
    }

    return db
      .prepare("DELETE FROM reviews WHERE place_id = ? AND user_id = ?")
      .run(placeId, userId).changes > 0;
  });

  return remove.immediate();
}
