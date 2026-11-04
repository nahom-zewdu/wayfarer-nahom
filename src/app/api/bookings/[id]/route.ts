import {
  getActingUserId,
  invalidId,
  jsonError,
  unexpectedApiError,
} from "../../../../lib/api/http";
import { cancelBooking, BookingServiceError } from "../../../../lib/bookings/service";
import { getServerDatabase } from "../../../../lib/db/server";

interface BookingRouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(
  request: Request,
  context: BookingRouteContext,
): Promise<Response> {
  const { id: bookingId } = await context.params;
  if (invalidId(bookingId)) {
    return jsonError(400, "INVALID_INPUT", "A valid booking ID is required.");
  }

  const userId = getActingUserId(request);
  if (userId instanceof Response) {
    return userId;
  }

  try {
    return Response.json(
      cancelBooking(getServerDatabase(), { bookingId, userId }),
    );
  } catch (error) {
    if (error instanceof BookingServiceError) {
      if (error.code === "BOOKING_NOT_FOUND") {
        return jsonError(404, error.code, error.message);
      }
      return jsonError(400, error.code, error.message);
    }

    return unexpectedApiError(error);
  }
}
