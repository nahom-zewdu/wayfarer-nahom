import {
  getActingUserId,
  invalidId,
  jsonError,
  readJsonObject,
  unexpectedApiError,
} from "../../../../../lib/api/http";
import { getServerDatabase } from "../../../../../lib/db/server";
import {
  deleteReview,
  ReviewServiceError,
  submitReview,
} from "../../../../../lib/reviews/service";

interface ReviewRouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(
  request: Request,
  context: ReviewRouteContext,
): Promise<Response> {
  const { id: placeId } = await context.params;
  if (invalidId(placeId)) {
    return jsonError(400, "INVALID_INPUT", "A valid place ID is required.");
  }

  const userId = getActingUserId(request);
  if (userId instanceof Response) {
    return userId;
  }

  try {
    const deleted = deleteReview(getServerDatabase(), placeId, userId);
    return Response.json({ deleted });
  } catch (error) {
    if (error instanceof ReviewServiceError) {
      if (error.code === "PLACE_NOT_FOUND" || error.code === "USER_NOT_FOUND") {
        return jsonError(404, error.code, error.message);
      }
      return jsonError(400, error.code, error.message);
    }

    return unexpectedApiError(error);
  }
}

export async function POST(
  request: Request,
  context: ReviewRouteContext,
): Promise<Response> {
  const { id: placeId } = await context.params;
  if (invalidId(placeId)) {
    return jsonError(400, "INVALID_INPUT", "A valid place ID is required.");
  }

  const userId = getActingUserId(request);
  if (userId instanceof Response) {
    return userId;
  }

  const body = await readJsonObject(request);
  if (!body.ok) {
    return body.response;
  }
  if (typeof body.value.rating !== "number" || typeof body.value.body !== "string") {
    return jsonError(
      400,
      "INVALID_INPUT",
      "Rating must be a number and review body must be text.",
    );
  }

  try {
    const review = submitReview(getServerDatabase(), {
      placeId,
      userId,
      rating: body.value.rating,
      body: body.value.body,
    });

    return Response.json({ review }, { status: 200 });
  } catch (error) {
    if (error instanceof ReviewServiceError) {
      if (error.code === "PLACE_NOT_FOUND" || error.code === "USER_NOT_FOUND") {
        return jsonError(404, error.code, error.message);
      }
      return jsonError(400, error.code, error.message);
    }

    return unexpectedApiError(error);
  }
}
