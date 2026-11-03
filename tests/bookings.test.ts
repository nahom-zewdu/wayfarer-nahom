import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Worker } from "node:worker_threads";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BookingServiceError,
  createBooking,
  type BookingServiceErrorCode,
  type CreateBookingInput,
} from "../src/lib/bookings/service";
import {
  openDatabase,
  type SqliteDatabase,
} from "../src/lib/db/database";

interface BookingWorkerResult {
  bookingId?: string;
  errorCode?: BookingServiceErrorCode;
}

describe("booking service", () => {
  let directory: string;
  let db: SqliteDatabase;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "wayfarer-bookings-test-"));
    db = openDatabase(join(directory, "test.sqlite"));
    createBookingFixtures(db, 5);
  });

  afterEach(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("creates a single-seat booking and returns the remaining seats", () => {
    const result = createBooking(db, {
      slotId: "booking-slot",
      userId: "booking-user",
      seats: 1,
    });

    expect(result.booking).toMatchObject({
      slotId: "booking-slot",
      userId: "booking-user",
      seats: 1,
    });
    expect(result.booking.id).toBeTruthy();
    expect(result.remainingSeats).toBe(4);
    expect(readOccupiedSeats(db)).toBe(1);
  });

  it("creates a multi-seat booking and returns the remaining capacity", () => {
    const result = createBooking(db, {
      slotId: "booking-slot",
      userId: "booking-user",
      seats: 3,
    });

    expect(result.booking.seats).toBe(3);
    expect(result.remainingSeats).toBe(2);
    expect(readOccupiedSeats(db)).toBe(3);
  });

  it("allows bookings to fill a slot exactly to capacity", () => {
    const result = createBooking(db, {
      slotId: "booking-slot",
      userId: "booking-user",
      seats: 5,
    });

    expect(result.remainingSeats).toBe(0);
    expect(readOccupiedSeats(db)).toBe(5);
  });

  it("rejects an over-capacity request without inserting a booking", () => {
    expectBookingError(
      () =>
        createBooking(db, {
          slotId: "booking-slot",
          userId: "booking-user",
          seats: 6,
        }),
      "INSUFFICIENT_CAPACITY",
    );

    expect(countBookings(db)).toBe(0);
    expect(readOccupiedSeats(db)).toBe(0);
  });

  it("returns SLOT_FULL when no seats remain", () => {
    occupySlot(db, 5);

    expectBookingError(
      () =>
        createBooking(db, {
          slotId: "booking-slot",
          userId: "booking-user",
          seats: 1,
        }),
      "SLOT_FULL",
    );

    expect(countBookings(db)).toBe(1);
    expect(readOccupiedSeats(db)).toBe(5);
  });

  it("counts seats across multiple existing bookings", () => {
    occupySlot(db, 2);
    occupySlot(db, 1, "existing-booking-2");

    const result = createBooking(db, {
      slotId: "booking-slot",
      userId: "booking-user",
      seats: 1,
    });

    expect(result.remainingSeats).toBe(1);
    expect(readOccupiedSeats(db)).toBe(4);
  });

  it("rejects null, undefined, arrays, malformed inputs, and invalid seat counts", () => {
    const invalidInputs: unknown[] = [
      null,
      undefined,
      [],
      {},
      { slotId: "booking-slot", userId: 7, seats: 1 },
      { slotId: "booking-slot", userId: "booking-user", seats: "1" },
      { slotId: "booking-slot", userId: "booking-user", seats: 0 },
      { slotId: "booking-slot", userId: "booking-user", seats: -1 },
      { slotId: "booking-slot", userId: "booking-user", seats: 1.5 },
      {
        slotId: "booking-slot",
        userId: "booking-user",
        seats: Number.MAX_SAFE_INTEGER + 1,
      },
    ];

    for (const input of invalidInputs) {
      expectBookingError(
        () => createBookingWithRuntimeInput(db, input),
        "INVALID_INPUT",
      );
    }

    expect(countBookings(db)).toBe(0);
  });

  it("rejects empty or surrounding-whitespace slot and user IDs", () => {
    for (const input of [
      { slotId: "", userId: "booking-user", seats: 1 },
      { slotId: " booking-slot", userId: "booking-user", seats: 1 },
      { slotId: "booking-slot ", userId: "booking-user", seats: 1 },
      { slotId: "booking-slot", userId: "", seats: 1 },
      { slotId: "booking-slot", userId: " booking-user", seats: 1 },
      { slotId: "booking-slot", userId: "booking-user ", seats: 1 },
    ]) {
      expectBookingError(
        () => createBookingWithRuntimeInput(db, input),
        "INVALID_INPUT",
      );
    }
  });

  it("distinguishes missing slots and users from capacity errors", () => {
    expectBookingError(
      () =>
        createBooking(db, {
          slotId: "missing-slot",
          userId: "booking-user",
          seats: 1,
        }),
      "SLOT_NOT_FOUND",
    );
    expectBookingError(
      () =>
        createBooking(db, {
          slotId: "booking-slot",
          userId: "missing-user",
          seats: 1,
        }),
      "USER_NOT_FOUND",
    );
    expectBookingError(
      () =>
        createBooking(db, {
          slotId: "booking-slot",
          userId: "booking-user",
          seats: 6,
        }),
      "INSUFFICIENT_CAPACITY",
    );
  });

  it("serializes concurrent bookings across worker-thread database connections", async () => {
    const capacity = 20;
    const alreadyBooked = 18;
    const workerCount = 16;
    db.prepare("UPDATE tour_slots SET capacity = ? WHERE id = ?").run(
      capacity,
      "booking-slot",
    );
    occupySlot(db, alreadyBooked);

    const outcomes = await runConcurrentAttempts(
      join(directory, "test.sqlite"),
      workerCount,
    );

    const accepted = outcomes.filter((outcome) => outcome.bookingId);
    const rejected = outcomes.filter((outcome) => outcome.errorCode);
    const successfulSeatCount = accepted.length;
    const persistedSeats = readOccupiedSeats(db);

    expect(successfulSeatCount).toBe(capacity - alreadyBooked);
    expect(rejected).toHaveLength(workerCount - successfulSeatCount);
    expect(rejected.every(({ errorCode }) => errorCode === "SLOT_FULL")).toBe(
      true,
    );
    expect(persistedSeats).toBe(alreadyBooked + successfulSeatCount);
    expect(persistedSeats).toBe(capacity);
    expect(countBookings(db)).toBe(1 + successfulSeatCount);
  }, 30_000);
});

function createBookingFixtures(db: SqliteDatabase, capacity: number): void {
  db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(
    "booking-user",
    "Booking User",
  );
  db.prepare(
    `INSERT INTO places (id, name, category, description, opening_hours)
     VALUES ('booking-place', 'Booking Place', 'Test', 'Test place', 'Daily 09:00-17:00')`,
  ).run();
  db.prepare(
    `INSERT INTO tour_slots (id, place_id, starts_at, capacity)
     VALUES ('booking-slot', 'booking-place', '2027-01-01T10:00:00.000Z', ?)`,
  ).run(capacity);
}

function occupySlot(
  db: SqliteDatabase,
  seats: number,
  id = `existing-booking-${countBookings(db) + 1}`,
): void {
  db.prepare(
    `INSERT INTO bookings (id, slot_id, user_id, seats, created_at)
     VALUES (?, 'booking-slot', 'booking-user', ?, '2026-01-01T00:00:00.000Z')`,
  ).run(id, seats);
}

function readOccupiedSeats(db: SqliteDatabase): number {
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(seats), 0) AS total FROM bookings WHERE slot_id = ?",
    )
    .get("booking-slot") as { total: number };

  return row.total;
}

function countBookings(db: SqliteDatabase): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM bookings")
    .get() as { count: number };

  return row.count;
}

function expectBookingError(
  action: () => unknown,
  code: BookingServiceErrorCode,
): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(BookingServiceError);
    expect((error as BookingServiceError).code).toBe(code);
    return;
  }

  throw new Error(`Expected booking service error ${code}.`);
}

function createBookingWithRuntimeInput(
  db: SqliteDatabase,
  input: unknown,
): ReturnType<typeof createBooking> {
  return createBooking(db, input as CreateBookingInput);
}

interface WorkerMessage {
  type: "ready" | "success" | "booking-error" | "failure";
  result?: { booking: { id: string }; remainingSeats: number };
  code?: BookingServiceErrorCode;
  message?: string;
}

async function runConcurrentAttempts(
  databasePath: string,
  workerCount: number,
): Promise<BookingWorkerResult[]> {
  const workers: Worker[] = [];

  try {
    return await new Promise<BookingWorkerResult[]>((resolve, reject) => {
      let readyCount = 0;
      let exitedCount = 0;
      const outcomes: BookingWorkerResult[] = [];
      let settled = false;
      const timeout = setTimeout(() => {
        fail(new Error("Timed out waiting for concurrent booking workers."));
      }, 20_000);

      function cleanup(): void {
        clearTimeout(timeout);
        for (const worker of workers) {
          void worker.terminate();
        }
      }

      function fail(error: Error): void {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      }

      function finishIfDone(): void {
        if (
          !settled &&
          outcomes.length === workerCount &&
          exitedCount === workerCount
        ) {
          settled = true;
          clearTimeout(timeout);
          resolve(outcomes);
        }
      }

      for (let index = 0; index < workerCount; index += 1) {
        const worker = new Worker(
          new URL("./booking-worker.ts", import.meta.url),
          {
            workerData: {
              databasePath,
              slotId: "booking-slot",
              userId: "booking-user",
            },
            execArgv: ["--import", "tsx"],
          },
        );
        workers.push(worker);
        let returnedResult = false;

        worker.on("message", (message: WorkerMessage) => {
          if (message.type === "ready") {
            readyCount += 1;
            if (readyCount === workerCount) {
              for (const readyWorker of workers) {
                readyWorker.postMessage({ type: "book" });
              }
            }
            return;
          }

          if (returnedResult) {
            fail(new Error("Booking worker returned more than one result."));
            return;
          }

          if (message.type === "success" && message.result) {
            returnedResult = true;
            outcomes.push({ bookingId: message.result.booking.id });
          } else if (
            message.type === "booking-error" &&
            (message.code === "SLOT_FULL" ||
              message.code === "INSUFFICIENT_CAPACITY")
          ) {
            returnedResult = true;
            outcomes.push({ errorCode: message.code });
          } else {
            fail(
              new Error(
                `Booking worker failed: ${message.message ?? message.type}`,
              ),
            );
            return;
          }
          finishIfDone();
        });

        worker.on("error", (error) => fail(error));
        worker.on("exit", (code) => {
          if (settled) {
            return;
          }
          if (code !== 0) {
            fail(new Error(`Booking worker exited with code ${code}.`));
          } else if (!returnedResult) {
            fail(
              new Error("Booking worker exited without returning a result."),
            );
          } else {
            exitedCount += 1;
            finishIfDone();
          }
        });
      }
    });
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}
