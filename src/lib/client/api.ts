import type { PlaceAvailability, PlaceSort } from "../places/types";

export type { PlaceAvailability, PlaceSort } from "../places/types";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiClientError(
      0,
      "NETWORK_ERROR",
      "Could not reach Wayfarer. Check your connection and try again.",
    );
  }
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = isRecord(payload) ? payload.error : undefined;
    const errorDetails = isRecord(error) ? error : undefined;
    throw new ApiClientError(
      response.status,
      typeof errorDetails?.code === "string"
        ? errorDetails.code
        : "REQUEST_FAILED",
      typeof errorDetails?.message === "string"
        ? errorDetails.message
        : "The request could not be completed.",
    );
  }

  return payload as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface PlaceListItem {
  id: string;
  name: string;
  category: string;
  description: string;
  openingHours: string;
  ratingSummary: {
    averageRating: number | null;
    reviewCount: number;
  };
  availability: PlaceAvailability;
}

export interface PlaceReview {
  id: string;
  userId: string;
  reviewerName: string;
  rating: number;
  body: string;
  createdAt: string;
}

export interface PlaceTourSlot {
  id: string;
  startsAt: string;
  capacity: number;
  bookedSeats: number;
  remainingSeats: number;
}

export interface PlaceDetails
  extends Omit<PlaceListItem, "ratingSummary" | "availability"> {
  ratingSummary: PlaceListItem["ratingSummary"];
  reviews: PlaceReview[];
  tourSlots: PlaceTourSlot[];
}

export interface ApiUser {
  id: string;
  name: string;
}

export interface PlacesResponse {
  places: PlaceListItem[];
}

export interface PlaceResponse {
  place: Omit<PlaceDetails, "ratingSummary" | "reviews" | "tourSlots">;
  ratingSummary: PlaceDetails["ratingSummary"];
  reviews: PlaceReview[];
  tourSlots: PlaceTourSlot[];
}

export interface UsersResponse {
  users: ApiUser[];
}

export interface ReviewResponse {
  review: {
    id: string;
    placeId: string;
    userId: string;
    rating: number;
    body: string;
    createdAt: string;
  };
}

export interface DeleteReviewResponse {
  deleted: boolean;
}

export interface BookingResponse {
  booking: {
    id: string;
    slotId: string;
    userId: string;
    seats: number;
    createdAt: string;
  };
  remainingSeats: number;
}

export function buildPlacesUrl(
  category: string,
  sort: PlaceSort,
  minSeats?: number,
): string {
  const query = new URLSearchParams({ sort });
  if (category) {
    query.set("category", category);
  }
  if (minSeats !== undefined) {
    query.set("minSeats", String(minSeats));
  }
  return `/api/places?${query.toString()}`;
}

export function getPlaces(
  category: string,
  sort: PlaceSort,
  minSeats?: number,
  signal?: AbortSignal,
): Promise<PlacesResponse> {
  return requestJson(buildPlacesUrl(category, sort, minSeats), { signal });
}

export function getPlace(
  id: string,
  signal?: AbortSignal,
): Promise<PlaceResponse> {
  return requestJson(`/api/places/${encodeURIComponent(id)}`, { signal });
}

export function getUsers(signal?: AbortSignal): Promise<UsersResponse> {
  return requestJson("/api/users", { signal });
}

export function saveReview(
  placeId: string,
  userId: string,
  input: { rating: number; body: string },
): Promise<ReviewResponse> {
  return requestJson(
    `/api/places/${encodeURIComponent(placeId)}/reviews`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": userId,
      },
      body: JSON.stringify(input),
    },
  );
}

export function deleteReview(
  placeId: string,
  userId: string,
): Promise<DeleteReviewResponse> {
  return requestJson(
    `/api/places/${encodeURIComponent(placeId)}/reviews`,
    {
      method: "DELETE",
      headers: { "X-User-Id": userId },
    },
  );
}

export function bookTourSlot(
  slotId: string,
  userId: string,
  input: { seats: number },
): Promise<BookingResponse> {
  return requestJson(
    `/api/tour-slots/${encodeURIComponent(slotId)}/bookings`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": userId,
      },
      body: JSON.stringify(input),
    },
  );
}
