import { jsonError, unexpectedApiError } from "../../../lib/api/http";
import { getServerDatabase } from "../../../lib/db/server";
import { getRankedPlaces } from "../../../lib/places/ranking";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const categories = query.getAll("category");
  const sorts = query.getAll("sort");

  if (categories.length > 1 || sorts.length > 1) {
    return jsonError(
      400,
      "INVALID_QUERY",
      "The category and sort parameters may each be specified only once.",
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

  const sort = sorts[0] ?? "name";
  if (sort !== "name" && sort !== "top-rated") {
    return jsonError(
      400,
      "INVALID_QUERY",
      'Sort must be either "name" or "top-rated".',
    );
  }

  try {
    const rankedPlaces = getRankedPlaces(getServerDatabase());
    const filteredPlaces =
      category === undefined
        ? rankedPlaces
        : rankedPlaces.filter((place) => place.category === category);
    const places =
      sort === "top-rated"
        ? filteredPlaces
        : filteredPlaces.sort(
            (left, right) =>
              compareText(left.name, right.name) ||
              compareText(left.id, right.id),
          );

    return Response.json({
      places: places.map(
        ({
          id,
          name,
          category: placeCategory,
          description,
          openingHours,
          averageRating,
          reviewCount,
        }) => ({
          id,
          name,
          category: placeCategory,
          description,
          openingHours,
          ratingSummary: { averageRating, reviewCount },
        }),
      ),
    });
  } catch (error) {
    return unexpectedApiError(error);
  }
}
