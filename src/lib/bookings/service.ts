import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "../db/database";

export interface CreateBookingInput {
  slotId: string;
  userId: string;
  seats: number;
  idempotencyKey: string;
}

export interface Booking {
  id: string;
  slotId: string;
  userId: string;
  seats: number;
  createdAt: string;
}

export interface BookingResult {
  booking: Booking;
  remainingSeats: number;
}

export type BookingServiceErrorCode =
  | "INVALID_INPUT"
  | "SLOT_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "SLOT_FULL"
  | "INSUFFICIENT_CAPACITY"
  | "IDEMPOTENCY_KEY_REUSED"
  | "BOOKING_NOT_FOUND";

export class BookingServiceError extends Error {
  constructor(
    public readonly code: BookingServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BookingServiceError";
  }
}

interface ValidatedBookingInput {
  slotId: string;
  userId: string;
  seats: number;
  idempotencyKey: string;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function validateInput(input: unknown): ValidatedBookingInput {
  if (!isRecord(input)) {
    throw new BookingServiceError(
      "INVALID_INPUT",
      "Booking input must be an object.",
    );
  }

  if (typeof input.slotId !== "string" || input.slotId.trim() === "") {
    throw new BookingServiceError("INVALID_INPUT", "A slot ID is required.");
  }
  if (input.slotId !== input.slotId.trim()) {
    throw new BookingServiceError(
      "INVALID_INPUT",
      "Slot ID cannot contain surrounding whitespace.",
    );
  }

  if (typeof input.userId !== "string" || input.userId.trim() === "") {
    throw new BookingServiceError("INVALID_INPUT", "A user ID is required.");
  }
  if (input.userId !== input.userId.trim()) {
    throw new BookingServiceError(
      "INVALID_INPUT",
      "User ID cannot contain surrounding whitespace.",
    );
  }

  if (
    typeof input.seats !== "number" ||
    !Number.isSafeInteger(input.seats) ||
    input.seats <= 0
  ) {
    throw new BookingServiceError(
      "INVALID_INPUT",
      "Seats must be a positive integer.",
    );
  }
  if (
    typeof input.idempotencyKey !== "string" ||
    !/^[\x21-\x7e]{1,128}$/.test(input.idempotencyKey)
  ) {
    throw new BookingServiceError(
      "INVALID_INPUT",
      "A valid Idempotency-Key is required.",
    );
  }

  return {
    slotId: input.slotId,
    userId: input.userId,
    seats: input.seats,
    idempotencyKey: input.idempotencyKey,
  };
}

interface SlotRow {
  capacity: number;
}

interface OccupiedSeatsRow {
  occupiedSeats: number;
}

interface ExistingBookingRow extends Booking {
  idempotencyKey: string;
  remainingSeats: number | null;
}

export function createBooking(
  db: SqliteDatabase,
  input: CreateBookingInput,
): BookingResult {
  const validatedInput = validateInput(input);

  const book = db.transaction((): BookingResult => {
    const existing = db
      .prepare(
        `SELECT
           id,
           slot_id AS slotId,
           user_id AS userId,
           seats,
           created_at AS createdAt,
           idempotency_key AS idempotencyKey,
           remaining_seats AS remainingSeats
         FROM bookings
         WHERE user_id = ? AND idempotency_key = ?`,
      )
      .get(validatedInput.userId, validatedInput.idempotencyKey) as
      | ExistingBookingRow
      | undefined;

    if (existing) {
      if (
        existing.slotId !== validatedInput.slotId ||
        existing.seats !== validatedInput.seats
      ) {
        throw new BookingServiceError(
          "IDEMPOTENCY_KEY_REUSED",
          "This Idempotency-Key was already used for a different booking request.",
        );
      }
      if (existing.remainingSeats === null) {
        throw new Error("Idempotent booking is missing its original result.");
      }
      const { id, slotId, userId, seats, createdAt, remainingSeats } = existing;
      const booking: Booking = { id, slotId, userId, seats, createdAt };
      return { booking, remainingSeats };
    }

    const slot = db
      .prepare("SELECT capacity FROM tour_slots WHERE id = ?")
      .get(validatedInput.slotId) as SlotRow | undefined;
    if (!slot) {
      throw new BookingServiceError(
        "SLOT_NOT_FOUND",
        `Tour slot "${validatedInput.slotId}" does not exist.`,
      );
    }

    const user = db
      .prepare("SELECT 1 AS found FROM users WHERE id = ?")
      .get(validatedInput.userId);
    if (!user) {
      throw new BookingServiceError(
        "USER_NOT_FOUND",
        `User "${validatedInput.userId}" does not exist.`,
      );
    }

    const occupancy = db
      .prepare(
        `SELECT COALESCE(SUM(seats), 0) AS occupiedSeats
         FROM bookings
         WHERE slot_id = ? AND cancelled_at IS NULL`,
      )
      .get(validatedInput.slotId) as OccupiedSeatsRow;
    const remainingSeats = slot.capacity - occupancy.occupiedSeats;

    if (validatedInput.seats > remainingSeats) {
      if (remainingSeats <= 0) {
        throw new BookingServiceError(
          "SLOT_FULL",
          "This tour slot is full.",
        );
      }

      throw new BookingServiceError(
        "INSUFFICIENT_CAPACITY",
        `Only ${remainingSeats} seat(s) remain in this tour slot.`,
      );
    }

    const createdAt = new Date().toISOString();
    const bookingId = randomUUID();
    const bookingRemainingSeats = remainingSeats - validatedInput.seats;
    const booking = db
      .prepare(
        `INSERT INTO bookings (
           id, slot_id, user_id, seats, created_at, idempotency_key, remaining_seats
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING
           id,
           slot_id AS slotId,
           user_id AS userId,
           seats,
           created_at AS createdAt`,
      )
      .get(
        bookingId,
        validatedInput.slotId,
        validatedInput.userId,
        validatedInput.seats,
        createdAt,
        validatedInput.idempotencyKey,
        bookingRemainingSeats,
      ) as Booking | undefined;

    if (!booking) {
      throw new Error("Booking insert did not return a booking.");
    }

    return {
      booking,
      remainingSeats: bookingRemainingSeats,
    };
  });

  return book.immediate();
}

export function cancelBooking(
  db: SqliteDatabase,
  input: unknown,
): { cancelled: boolean } {
  if (
    !isRecord(input) ||
    typeof input.bookingId !== "string" ||
    input.bookingId.trim() === "" ||
    input.bookingId !== input.bookingId.trim() ||
    typeof input.userId !== "string" ||
    input.userId.trim() === "" ||
    input.userId !== input.userId.trim()
  ) {
    throw new BookingServiceError(
      "INVALID_INPUT",
      "A valid booking ID and user ID are required.",
    );
  }

  const cancel = db.transaction(() => {
    const booking = db
      .prepare(
        `SELECT cancelled_at AS cancelledAt
         FROM bookings
         WHERE id = ? AND user_id = ?`,
      )
      .get(input.bookingId, input.userId) as
      | { cancelledAt: string | null }
      | undefined;

    if (!booking) {
      throw new BookingServiceError(
        "BOOKING_NOT_FOUND",
        "Booking was not found for this acting user.",
      );
    }
    if (booking.cancelledAt !== null) {
      return { cancelled: false };
    }

    const result = db
      .prepare(
        `UPDATE bookings
         SET cancelled_at = ?
         WHERE id = ? AND user_id = ? AND cancelled_at IS NULL`,
      )
      .run(new Date().toISOString(), input.bookingId, input.userId);

    return { cancelled: result.changes === 1 };
  });

  return cancel.immediate();
}
