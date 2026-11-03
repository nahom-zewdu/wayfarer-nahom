import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "../db/database";

export interface CreateBookingInput {
  slotId: string;
  userId: string;
  seats: number;
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
  | "INSUFFICIENT_CAPACITY";

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

  return {
    slotId: input.slotId,
    userId: input.userId,
    seats: input.seats,
  };
}

interface SlotRow {
  capacity: number;
}

interface OccupiedSeatsRow {
  occupiedSeats: number;
}

export function createBooking(
  db: SqliteDatabase,
  input: CreateBookingInput,
): BookingResult {
  const validatedInput = validateInput(input);

  const book = db.transaction((): BookingResult => {
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
        "SELECT COALESCE(SUM(seats), 0) AS occupiedSeats FROM bookings WHERE slot_id = ?",
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
    const booking = db
      .prepare(
        `INSERT INTO bookings (id, slot_id, user_id, seats, created_at)
         VALUES (?, ?, ?, ?, ?)
         RETURNING
           id,
           slot_id AS slotId,
           user_id AS userId,
           seats,
           created_at AS createdAt`,
      )
      .get(
        randomUUID(),
        validatedInput.slotId,
        validatedInput.userId,
        validatedInput.seats,
        createdAt,
      ) as Booking | undefined;

    if (!booking) {
      throw new Error("Booking insert did not return a booking.");
    }

    return {
      booking,
      remainingSeats: remainingSeats - validatedInput.seats,
    };
  });

  return book.immediate();
}
