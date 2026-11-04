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

  try {
    const result = createBooking(getServerDatabase(), {
      slotId,
      userId,
      seats: body.value.seats,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof BookingServiceError) {
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
