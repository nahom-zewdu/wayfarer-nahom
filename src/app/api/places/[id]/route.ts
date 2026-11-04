import {
  invalidId,
  jsonError,
  unexpectedApiError,
} from "../../../../lib/api/http";
import { getServerDatabase } from "../../../../lib/db/server";

interface PlaceRow {
  id: string;
  name: string;
  category: string;
  description: string;
  openingHours: string;
  averageRating: number | null;
  reviewCount: number;
}

interface ReviewRow {
  id: string;
  userId: string;
  reviewerName: string;
  rating: number;
  body: string;
  createdAt: string;
}

interface TourSlotRow {
  id: string;
  startsAt: string;
  capacity: number;
  bookedSeats: number;
}

interface PlaceRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: PlaceRouteContext,
): Promise<Response> {
  const { id } = await context.params;
  if (invalidId(id)) {
    return jsonError(400, "INVALID_INPUT", "A valid place ID is required.");
  }

  try {
    const db = getServerDatabase();
    const place = db
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
         WHERE places.id = ?
         GROUP BY places.id`,
      )
      .get(id) as PlaceRow | undefined;

    if (!place) {
      return jsonError(404, "PLACE_NOT_FOUND", "Place was not found.");
    }

    const reviews = db
      .prepare(
        `SELECT
           reviews.id,
           reviews.user_id AS userId,
           users.name AS reviewerName,
           reviews.rating,
           reviews.body,
           reviews.created_at AS createdAt
         FROM reviews
         JOIN users ON users.id = reviews.user_id
         WHERE reviews.place_id = ?
         ORDER BY reviews.created_at DESC, reviews.id ASC`,
      )
      .all(id) as ReviewRow[];

    const tourSlots = db
      .prepare(
        `SELECT
           tour_slots.id,
           tour_slots.starts_at AS startsAt,
           tour_slots.capacity,
           COALESCE(SUM(bookings.seats), 0) AS bookedSeats
         FROM tour_slots
         LEFT JOIN bookings ON bookings.slot_id = tour_slots.id
         WHERE tour_slots.place_id = ?
         GROUP BY tour_slots.id
         ORDER BY tour_slots.starts_at ASC, tour_slots.id ASC`,
      )
      .all(id) as TourSlotRow[];

    const {
      averageRating,
      reviewCount,
      ...placeDetails
    } = place;

    return Response.json({
      place: placeDetails,
      ratingSummary: { averageRating, reviewCount },
      reviews,
      tourSlots: tourSlots.map((slot) => ({
        ...slot,
        remainingSeats: Math.max(0, slot.capacity - slot.bookedSeats),
      })),
    });
  } catch (error) {
    return unexpectedApiError(error);
  }
}
