import { jsonError, unexpectedApiError } from "../../../lib/api/http";
import { getServerDatabase } from "../../../lib/db/server";
import { getRankedPlaces } from "../../../lib/places/ranking";
import type { PlaceAvailability, PlaceSort } from "../../../lib/places/types";

const maximumMinimumSeats = 1_000;
const placeSorts: readonly PlaceSort[] = [
  "name",
  "top-rated",
  "soonest-available",
  "most-available",
];

function isPlaceSort(value: string): value is PlaceSort {
  return placeSorts.some((sort) => sort === value);
}

interface UpcomingSlotRow {
  placeId: string;
  startsAt: string;
  capacity: number;
  bookedSeats: number;
}

interface PlaceWithAvailability {
  id: string;
  name: string;
  category: string;
  description: string;
  openingHours: string;
  averageRating: number | null;
  reviewCount: number;
  rankingScore: number;
  availability: PlaceAvailability;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareByName(
  left: PlaceWithAvailability,
  right: PlaceWithAvailability,
): number {
  return compareText(left.name, right.name) || compareText(left.id, right.id);
}

function getAvailability(
  db: ReturnType<typeof getServerDatabase>,
  now: string,
): Map<string, PlaceAvailability> {
  const rows = db
    .prepare(
      `SELECT
         tour_slots.place_id AS placeId,
         tour_slots.starts_at AS startsAt,
         tour_slots.capacity,
         COALESCE(SUM(bookings.seats), 0) AS bookedSeats
       FROM tour_slots
       LEFT JOIN bookings ON bookings.slot_id = tour_slots.id
       WHERE tour_slots.starts_at > ?
       GROUP BY tour_slots.id
       ORDER BY tour_slots.place_id ASC, tour_slots.starts_at ASC, tour_slots.id ASC`,
    )
    .all(now) as UpcomingSlotRow[];

  const availability = new Map<string, PlaceAvailability>();

  for (const row of rows) {
    let summary = availability.get(row.placeId);
    if (!summary) {
      summary = {
        nextAvailableSlot: null,
        nextUpcomingSlot: null,
        availableSlotCount: 0,
        maxAvailableSeats: 0,
      };
      availability.set(row.placeId, summary);
    }

    const remainingSeats = Math.max(0, row.capacity - row.bookedSeats);
    const slot = { startsAt: row.startsAt, remainingSeats };
    summary.nextUpcomingSlot ??= slot;

    if (remainingSeats > 0) {
      summary.nextAvailableSlot ??= slot;
      summary.availableSlotCount += 1;
      summary.maxAvailableSeats = Math.max(
        summary.maxAvailableSeats,
        remainingSeats,
      );
    }
  }

  return availability;
}

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const categories = query.getAll("category");
  const sorts = query.getAll("sort");
  const minimumSeatValues = query.getAll("minSeats");

  if (
    categories.length > 1 ||
    sorts.length > 1 ||
    minimumSeatValues.length > 1
  ) {
    return jsonError(
      400,
      "INVALID_QUERY",
      "The category, sort, and minSeats parameters may each be specified only once.",
    );
  }

  const category = categories[0];
  if (category !== undefined && (category.trim() === "" || category !== category.trim())) {
    return jsonError(
      400,
      "INVALID_QUERY",
      "Category must be a non-empty value without surrounding whitespace.",
    );
  }

  const sortValue = sorts[0] ?? "name";
  if (!isPlaceSort(sortValue)) {
    return jsonError(
      400,
      "INVALID_QUERY",
      'Sort must be "name", "top-rated", "soonest-available", or "most-available".',
    );
  }
  const sort = sortValue;

  const minimumSeatValue = minimumSeatValues[0];
  let minSeats: number | undefined;
  if (minimumSeatValue !== undefined) {
    const parsedMinimum = Number(minimumSeatValue);
    if (
      !/^\d+$/.test(minimumSeatValue) ||
      !Number.isSafeInteger(parsedMinimum) ||
      parsedMinimum < 1 ||
      parsedMinimum > maximumMinimumSeats
    ) {
      return jsonError(
        400,
        "INVALID_QUERY",
        `minSeats must be a positive integer no greater than ${maximumMinimumSeats}.`,
      );
    }
    minSeats = parsedMinimum;
  }

  try {
    const db = getServerDatabase();
    const availabilityByPlace = getAvailability(db, new Date().toISOString());
    const placesWithAvailability = getRankedPlaces(db).map((place) => ({
      ...place,
      availability: availabilityByPlace.get(place.id) ?? {
        nextAvailableSlot: null,
        nextUpcomingSlot: null,
        availableSlotCount: 0,
        maxAvailableSeats: 0,
      },
    }));
    const filteredPlaces = placesWithAvailability.filter(
      (place) =>
        (category === undefined || place.category === category) &&
        (minSeats === undefined ||
          place.availability.maxAvailableSeats >= minSeats),
    );

    switch (sort) {
      case "name":
        filteredPlaces.sort(compareByName);
        break;
      case "soonest-available":
        filteredPlaces.sort((left, right) => {
          const leftStart = left.availability.nextAvailableSlot?.startsAt;
          const rightStart = right.availability.nextAvailableSlot?.startsAt;
          if (leftStart === undefined || rightStart === undefined) {
            if (leftStart === rightStart) {
              return compareByName(left, right);
            }
            return leftStart === undefined ? 1 : -1;
          }
          return compareText(leftStart, rightStart) || compareByName(left, right);
        });
        break;
      case "most-available":
        filteredPlaces.sort((left, right) => {
          const leftHasAvailability =
            left.availability.availableSlotCount > 0;
          const rightHasAvailability =
            right.availability.availableSlotCount > 0;
          if (leftHasAvailability !== rightHasAvailability) {
            return leftHasAvailability ? -1 : 1;
          }
          return (
            right.availability.maxAvailableSeats -
              left.availability.maxAvailableSeats ||
            compareByName(left, right)
          );
        });
        break;
    }

    return Response.json({
      places: filteredPlaces.map(
        ({
          id,
          name,
          category: placeCategory,
          description,
          openingHours,
          averageRating,
          reviewCount,
          availability,
        }) => ({
          id,
          name,
          category: placeCategory,
          description,
          openingHours,
          ratingSummary: { averageRating, reviewCount },
          availability,
        }),
      ),
    });
  } catch (error) {
    return unexpectedApiError(error);
  }
}
