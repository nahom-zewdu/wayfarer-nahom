import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  bookTourSlot,
  buildPlacesUrl,
  getPlaces,
  saveReview,
} from "../src/lib/client/api";

describe("frontend API adapter", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds backend list queries for category and ranking filters", async () => {
    expect(buildPlacesUrl("", "name")).toBe("/api/places?sort=name");
    expect(buildPlacesUrl("Park & Garden", "top-rated")).toBe(
      "/api/places?sort=top-rated&category=Park+%26+Garden",
    );

    fetchMock.mockResolvedValue(
      Response.json({
        places: [
          {
            id: "friendship-square",
            name: "Friendship Square",
            category: "Park",
            description: "A public garden.",
            openingHours: "Illustrative",
            ratingSummary: { averageRating: 5, reviewCount: 2 },
          },
        ],
      }),
    );

    const result = await getPlaces("Park", "top-rated");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/places?sort=top-rated&category=Park",
      { signal: undefined },
    );
    expect(result.places[0].id).toBe("friendship-square");
  });

  it("sends the selected acting user and review content to the review endpoint", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        review: {
          id: "review-created",
          placeId: "merkato",
          userId: "user-002",
          rating: 4,
          body: "Worth a visit.",
          createdAt: "2026-11-04T00:00:00.000Z",
        },
      }),
    );

    const response = await saveReview("merkato", "user-002", {
      rating: 4,
      body: "Worth a visit.",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/places/merkato/reviews",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": "user-002",
        },
        body: JSON.stringify({ rating: 4, body: "Worth a visit." }),
      }),
    );
    expect(response.review.userId).toBe("user-002");
  });

  it("sends acting user and seat count and preserves capacity error details", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          error: {
            code: "INSUFFICIENT_CAPACITY",
            message: "Only 1 seat(s) remain in this tour slot.",
          },
        },
        { status: 409 },
      ),
    );

    const bookingRequest = bookTourSlot("slot one", "user-003", { seats: 2 });
    await expect(bookingRequest).rejects.toMatchObject({
      status: 409,
      code: "INSUFFICIENT_CAPACITY",
      message: "Only 1 seat(s) remain in this tour slot.",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tour-slots/slot%20one/bookings",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": "user-003",
        },
        body: JSON.stringify({ seats: 2 }),
      }),
    );
    await expect(bookingRequest).rejects.toBeInstanceOf(ApiClientError);
  });

  it("maps network failures to a safe retry message", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(getPlaces("", "name")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message: "Could not reach Wayfarer. Check your connection and try again.",
    });
  });
});
