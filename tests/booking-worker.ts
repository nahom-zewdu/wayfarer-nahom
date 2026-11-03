import { parentPort, workerData } from "node:worker_threads";
import { openDatabase } from "../src/lib/db/database";
import {
  BookingServiceError,
  createBooking,
} from "../src/lib/bookings/service";

interface WorkerData {
  databasePath: string;
  slotId: string;
  userId: string;
}

if (!parentPort) {
  throw new Error("Booking worker requires a parent port.");
}

const port = parentPort;
const { databasePath, slotId, userId } = workerData as WorkerData;
const db = openDatabase(databasePath);

port.postMessage({ type: "ready" });
port.once("message", (message: { type: string }) => {
  if (message.type !== "book") {
    db.close();
    throw new Error(`Unexpected worker command: ${message.type}`);
  }

  try {
    const result = createBooking(db, { slotId, userId, seats: 1 });
    port.postMessage({ type: "success", result });
  } catch (error) {
    if (error instanceof BookingServiceError) {
      port.postMessage({
        type: "booking-error",
        code: error.code,
        message: error.message,
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
