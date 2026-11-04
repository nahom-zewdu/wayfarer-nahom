import {
  getActingUserId,
  invalidId,
  jsonError,
  readJsonObject,
  unexpectedApiError,
} from "../../../../../lib/api/http";
import { getServerDatabase } from "../../../../../lib/db/server";
import {
  BookingServiceError,
  createBooking,
} from "../../../../../lib/bookings/service";

interface BookingRouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  context: BookingRouteContext,
): Promise<Response> {
  const { id: slotId } = await context.params;
  if (invalidId(slotId)) {
    return jsonError(400, "INVALID_INPUT", "A valid tour slot ID is required.");
  }

  const userId = getActingUserId(request);
  if (userId instanceof Response) {
    return userId;
  }

  const body = await readJsonObject(request);
  if (!body.ok) {
    return body.response;
  }
  if (typeof body.value.seats !== "number") {
    return jsonError(400, "INVALID_INPUT", "Seats must be a positive integer.");
  }
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey === null) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "A valid Idempotency-Key header is required.",
    );
  }

  try {
    const result = createBooking(getServerDatabase(), {
      slotId,
      userId,
      seats: body.value.seats,
      idempotencyKey,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof BookingServiceError) {
      if (error.code === "IDEMPOTENCY_KEY_REUSED") {
        return jsonError(409, error.code, error.message);
      }
      if (error.code === "SLOT_NOT_FOUND" || error.code === "USER_NOT_FOUND") {
        return jsonError(404, error.code, error.message);
      }
      if (
        error.code === "SLOT_FULL" ||
        error.code === "INSUFFICIENT_CAPACITY"
      ) {
        return jsonError(409, error.code, error.message);
      }
      return jsonError(400, error.code, error.message);
    }

    return unexpectedApiError(error);
  }
}

export async function GET(
  request: Request,
  context: BookingRouteContext,
): Promise<Response> {
  const { id: slotId } = await context.params;
  if (invalidId(slotId)) {
    return jsonError(400, "INVALID_INPUT", "A valid tour slot ID is required.");
  }

  const userId = getActingUserId(request);
  if (userId instanceof Response) {
    return userId;
  }

  try {
    const db = getServerDatabase();
    if (!db.prepare("SELECT 1 FROM tour_slots WHERE id = ?").get(slotId)) {
      return jsonError(404, "SLOT_NOT_FOUND", "Tour slot was not found.");
    }
    if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId)) {
      return jsonError(404, "USER_NOT_FOUND", `User "${userId}" does not exist.`);
    }

    const bookings = db
      .prepare(
        `SELECT
           id,
           slot_id AS slotId,
           user_id AS userId,
           seats,
           created_at AS createdAt,
           cancelled_at AS cancelledAt
         FROM bookings
         WHERE slot_id = ? AND user_id = ?
         ORDER BY created_at DESC, id ASC`,
      )
      .all(slotId, userId) as Array<{
      id: string;
      slotId: string;
      userId: string;
      seats: number;
      createdAt: string;
      cancelledAt: string | null;
    }>;

    return Response.json({
      bookings: bookings.map((booking) => ({
        ...booking,
        status: booking.cancelledAt === null ? "active" : "cancelled",
      })),
    });
  } catch (error) {
    return unexpectedApiError(error);
  }
}
