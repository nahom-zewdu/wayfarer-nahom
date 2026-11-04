import { randomUUID } from "node:crypto";
import { parentPort, workerData } from "node:worker_threads";
import { openDatabase } from "../src/lib/db/database";
import {
  BookingServiceError,
  cancelBooking,
  createBooking,
  type BookingServiceErrorCode,
} from "../src/lib/bookings/service";

interface WorkerData {
  databasePath: string;
  slotId: string;
  userId: string;
  operation: {
    type: "book" | "cancel";
    seats?: number;
    idempotencyKey?: string;
    bookingId?: string;
  };
}

if (!parentPort) {
  throw new Error("Booking worker requires a parent port.");
}

const port = parentPort;
const { databasePath, slotId, userId, operation } = workerData as WorkerData;
const db = openDatabase(databasePath);

port.postMessage({ type: "ready" });
port.once("message", (message: { type: string }) => {
  if (message.type !== "run") {
    db.close();
    throw new Error(`Unexpected worker command: ${message.type}`);
  }

  try {
    if (operation.type === "cancel") {
      const result = cancelBooking(db, {
        bookingId: operation.bookingId ?? "",
        userId,
      });
      port.postMessage({ type: "operation-result", result });
    } else {
      const result = createBooking(db, {
        slotId,
        userId,
        seats: operation.seats ?? 1,
        idempotencyKey: operation.idempotencyKey ?? randomUUID(),
      });
      port.postMessage({
        type: "operation-result",
        result: {
          bookingId: result.booking.id,
          remainingSeats: result.remainingSeats,
        },
      });
    }
  } catch (error) {
    if (error instanceof BookingServiceError) {
      port.postMessage({
        type: "operation-result",
        result: { errorCode: error.code satisfies BookingServiceErrorCode },
      });
    } else {
      port.postMessage({
        type: "failure",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } finally {
    db.close();
  }
});
