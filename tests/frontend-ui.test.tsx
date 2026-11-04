// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppShell from "../src/app/app-shell";
import Home from "../src/app/page";
import PlaceDetail from "../src/app/places/[id]/place-detail";
import type { PlaceAvailability } from "../src/lib/places/types";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("Wayfarer frontend journeys", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("requests filtered and sorted places from the backend", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/places?")) {
        return jsonResponse({
          places: url.includes("category=Museum")
            ? [place("museum", "Museum")]
            : [place("market", "Market"), place("museum", "Museum")],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Home />);
    expect(await screen.findByRole("heading", { name: "National Museum" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Museum" },
    });
    expect(
      await screen.findByRole("heading", { name: "National Museum" }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/places?sort=top-rated&category=Museum",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "name" },
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/places?sort=name&category=Museum",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.change(screen.getByLabelText("Minimum seats"), {
      target: { value: "4" },
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/places?sort=name&category=Museum&minSeats=4",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "soonest-available" },
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/places?sort=soonest-available&category=Museum&minSeats=4",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "most-available" },
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/places?sort=most-available&category=Museum&minSeats=4",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  it("recovers from a place-list failure and then displays empty results", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ places: [] }));

    render(<Home />);
    expect(
      await screen.findByRole("heading", { name: "We couldn’t load the places." }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "No places are available yet." }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows available, fully booked, and no-upcoming-tour availability on cards", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        places: [
          place("available", "Nature", {
            nextAvailableSlot: {
              startsAt: "2028-05-01T10:00:00.000Z",
              remainingSeats: 2,
            },
            nextUpcomingSlot: {
              startsAt: "2028-05-01T10:00:00.000Z",
              remainingSeats: 2,
            },
            availableSlotCount: 1,
            maxAvailableSeats: 2,
          }),
          place("full", "Museum", {
            nextAvailableSlot: null,
            nextUpcomingSlot: {
              startsAt: "2028-05-02T10:00:00.000Z",
              remainingSeats: 0,
            },
            availableSlotCount: 0,
            maxAvailableSeats: 0,
          }),
          place("none", "Market"),
        ],
      }),
    );

    render(<Home />);

    expect(await screen.findByText("2 seats available")).toBeTruthy();
    expect(screen.getByText("May 1, 2028 · 1:00 PM GMT+3")).toBeTruthy();
    expect(screen.getByText("Upcoming tours fully booked")).toBeTruthy();
    expect(screen.getByText("No upcoming tours")).toBeTruthy();
    expect(screen.getAllByText("4.5")).toHaveLength(3);
  });

  it("resets filters when seat-availability results are empty", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/places?")) {
        return jsonResponse({
          places: url.includes("minSeats=4")
            ? []
            : [place("market", "Market")],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<Home />);
    expect(await screen.findByRole("heading", { name: "Market" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Minimum seats"), {
      target: { value: "4" },
    });
    expect(
      await screen.findByRole("heading", {
        name: "No places match these filters.",
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(await screen.findByRole("heading", { name: "Market" })).toBeTruthy();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/places?sort=top-rated",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  it("prefills and updates the acting user's existing review", async () => {
    const updatedBody = "The galleries were even better on a second visit.";
    let reviewUpdated = false;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/users") {
        return jsonResponse({ users: users() });
      }
      if (url === "/api/places/museum") {
        return jsonResponse(placeDetail({
          reviews: [
            {
              id: "review-one",
              userId: "user-001",
              reviewerName: "Mekdes Tadesse",
              rating: reviewUpdated ? 5 : 4,
              body: reviewUpdated ? updatedBody : "A thoughtful collection.",
              createdAt: "2026-10-01T10:00:00.000Z",
            },
          ],
        }));
      }
      if (url === "/api/places/museum/reviews" && init?.method === "POST") {
        expect(
          (init.headers as Record<string, string>)["X-User-Id"],
        ).toBe("user-001");
        expect(JSON.parse(String(init.body))).toEqual({
          rating: 5,
          body: updatedBody,
        });
        reviewUpdated = true;
        return jsonResponse({
          review: {
            id: "review-one",
            placeId: "museum",
            userId: "user-001",
            rating: 5,
            body: updatedBody,
            createdAt: "2026-10-01T10:00:00.000Z",
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(
      <AppShell>
        <PlaceDetail placeId="museum" />
      </AppShell>,
    );

    const reviewField = await screen.findByLabelText("Review");
    await waitFor(() => {
      expect((reviewField as HTMLTextAreaElement).value).toBe(
        "A thoughtful collection.",
      );
      expect(screen.getByRole("button", { name: "Update review" })).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("Your rating"), {
      target: { value: "5" },
    });
    fireEvent.change(reviewField, { target: { value: updatedBody } });
    fireEvent.click(screen.getByRole("button", { name: "Update review" }));

    expect(
      await screen.findByText("Your review has been updated."),
    ).toBeTruthy();
    expect(
      await screen.findByText(updatedBody, { selector: ".review-card p" }),
    ).toBeTruthy();
  });

  it("confirms successful bookings, prevents duplicate submission, and refreshes availability", async () => {
    let resolveBooking: ((response: Response) => void) | undefined;
    let bookingRequests = 0;
    let refreshed = false;
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url === "/api/users") {
        return Promise.resolve(jsonResponse({ users: users() }));
      }
      if (url === "/api/places/entoto") {
        return Promise.resolve(
          jsonResponse(
            placeDetail({
              tourSlots: [
                tourSlot({
                  bookedSeats: refreshed ? 3 : 1,
                  remainingSeats: refreshed ? 1 : 3,
                }),
              ],
            }),
          ),
        );
      }
      if (url === "/api/tour-slots/slot-entoto/bookings" && init?.method === "POST") {
        bookingRequests += 1;
        return new Promise<Response>((resolve) => {
          resolveBooking = resolve;
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(
      <AppShell>
        <PlaceDetail placeId="entoto" />
      </AppShell>,
    );

    const seats = await screen.findByLabelText("Seats");
    fireEvent.change(seats, { target: { value: "2" } });
    const bookButton = screen.getByRole("button", { name: "Book seats" });
    fireEvent.click(bookButton);
    fireEvent.click(bookButton);

    expect(bookingRequests).toBe(1);
    await waitFor(() => {
      expect(resolveBooking).toBeDefined();
    });
    refreshed = true;
    resolveBooking?.(
    jsonResponse({
        booking: {
          id: "booking-one",
          slotId: "slot-entoto",
          userId: "user-001",
          seats: 2,
          createdAt: "2026-11-04T00:00:00.000Z",
        },
        remainingSeats: 1,
      }),
    );

    expect(
      await screen.findByText("Booking confirmed for 2 seats. 1 remain."),
    ).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/3 booked/)).toBeTruthy();
      expect(screen.getByText("1 seat available")).toBeTruthy();
    });
  });

  it("shows clear feedback when a slot fills after it was displayed as available", async () => {
    let placeRequests = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/users") {
        return jsonResponse({ users: users() });
      }
      if (url === "/api/places/entoto") {
        placeRequests += 1;
        return jsonResponse(placeDetail({
          tourSlots: [
            tourSlot({
              bookedSeats: placeRequests === 1 ? 2 : 4,
              remainingSeats: placeRequests === 1 ? 2 : 0,
            }),
          ],
        }));
      }
      if (url === "/api/tour-slots/slot-entoto/bookings" && init?.method === "POST") {
        return jsonResponse(
          {
            error: {
              code: "SLOT_FULL",
              message: "This tour slot is full.",
            },
          },
          409,
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(
      <AppShell>
        <PlaceDetail placeId="entoto" />
      </AppShell>,
    );

    const slot = await screen.findByText("Guided tour");
    const card = slot.closest(".tour-card");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("2 seats available")).toBeTruthy();
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Book seats" }));

    expect(
      await screen.findByText(
        "This tour has just filled up. Please choose another experience.",
      ),
    ).toBeTruthy();
    await waitFor(() => {
      expect(placeRequests).toBe(2);
      expect(
        card?.querySelector(".availability-line")?.textContent,
      ).toContain("4 booked");
      expect(within(card as HTMLElement).getByText("Fully booked")).toBeTruthy();
      expect(
        (within(card as HTMLElement).getByLabelText("Seats") as HTMLInputElement)
          .disabled,
      ).toBe(true);
      expect(
        (
          within(card as HTMLElement).getByRole("button", {
            name: "Book seats",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });
    expect(
      screen.getByText(
        "This tour has just filled up. Please choose another experience.",
      ),
    ).toBeTruthy();
  });

  it("refreshes availability after an insufficient-capacity conflict", async () => {
    let placeRequests = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/users") {
        return jsonResponse({ users: users() });
      }
      if (url === "/api/places/entoto") {
        placeRequests += 1;
        return jsonResponse(placeDetail({
          tourSlots: [
            tourSlot({
              bookedSeats: placeRequests === 1 ? 1 : 3,
              remainingSeats: placeRequests === 1 ? 3 : 1,
            }),
          ],
        }));
      }
      if (url === "/api/tour-slots/slot-entoto/bookings" && init?.method === "POST") {
        return jsonResponse(
          {
            error: {
              code: "INSUFFICIENT_CAPACITY",
              message: "Only 1 seat(s) remain in this tour slot.",
            },
          },
          409,
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(
      <AppShell>
        <PlaceDetail placeId="entoto" />
      </AppShell>,
    );

    const slot = await screen.findByText("Guided tour");
    const card = slot.closest(".tour-card");
    expect(card).not.toBeNull();
    const seats = within(card as HTMLElement).getByLabelText("Seats");
    expect(seats.getAttribute("max")).toBe("3");
    fireEvent.change(seats, { target: { value: "2" } });
    fireEvent.click(
      within(card as HTMLElement).getByRole("button", { name: "Book seats" }),
    );

    expect(
      await screen.findByText("Only 1 seat(s) remain in this tour slot."),
    ).toBeTruthy();
    await waitFor(() => {
      expect(placeRequests).toBe(2);
      expect(
        card?.querySelector(".availability-line")?.textContent,
      ).toContain("3 booked");
      expect(within(card as HTMLElement).getByText("1 seat available")).toBeTruthy();
      expect(seats.getAttribute("max")).toBe("1");
    });
    expect((seats as HTMLInputElement).disabled).toBe(false);
    expect(
      (
        within(card as HTMLElement).getByRole("button", {
          name: "Book seats",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);

    fireEvent.change(seats, { target: { value: "1" } });
    expect((seats as HTMLInputElement).value).toBe("1");
    expect(
      screen.getByText("Only 1 seat(s) remain in this tour slot."),
    ).toBeTruthy();
  });
});

function users() {
  return [
    { id: "user-001", name: "Mekdes Tadesse" },
    { id: "user-002", name: "Yonas Bekele" },
    { id: "user-003", name: "Sara Alemu" },
  ];
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function place(
  id: string,
  category: string,
  availability: PlaceAvailability = {
    nextAvailableSlot: null,
    nextUpcomingSlot: null,
    availableSlotCount: 0,
    maxAvailableSeats: 0,
  },
) {
  return {
    id,
    name: id === "museum" ? "National Museum" : "Market",
    category,
    description: "A place to explore.",
    openingHours: "Illustrative",
    ratingSummary: { averageRating: 4.5, reviewCount: 2 },
    availability,
  };
}

function placeDetail(
  overrides: Partial<{
    reviews: Array<{
      id: string;
      userId: string;
      reviewerName: string;
      rating: number;
      body: string;
      createdAt: string;
    }>;
    tourSlots: Array<{
      id: string;
      startsAt: string;
      capacity: number;
      bookedSeats: number;
      remainingSeats: number;
    }>;
  }> = {},
) {
  return {
    place: {
      id: "museum",
      name: "National Museum",
      category: "Museum",
      description: "A place to explore.",
      openingHours: "Tue-Sun 09:00-17:00 (illustrative; verify locally)",
    },
    ratingSummary: { averageRating: 4, reviewCount: overrides.reviews?.length ?? 0 },
    reviews: overrides.reviews ?? [],
    tourSlots: overrides.tourSlots ?? [],
  };
}

function tourSlot(
  overrides: Partial<{
    bookedSeats: number;
    remainingSeats: number;
  }> = {},
) {
  return {
    id: "slot-entoto",
    startsAt: "2027-02-06T07:00:00.000Z",
    capacity: 4,
    bookedSeats: overrides.bookedSeats ?? 2,
    remainingSeats: overrides.remainingSeats ?? 2,
  };
}
