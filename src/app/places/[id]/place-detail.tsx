"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ApiClientError,
  bookTourSlot,
  cancelTourBooking,
  deleteReview,
  getPlace,
  getSlotBookings,
  saveReview,
  type PlaceResponse,
  type PlaceTourSlot,
  type UserSlotBooking,
} from "../../../lib/client/api";
import { useAvailabilitySync } from "../../../lib/client/availability-sync";
import { MAX_REVIEW_BODY_LENGTH } from "../../../lib/reviews/constants";
import { useActingUser } from "../../app-shell";
import PlaceImage from "../../place-image";
import RatingSummary from "../../rating-summary";

const reviewRatingOptions = [
  { value: 5, label: "5 — Excellent" },
  { value: 4, label: "4 — Very good" },
  { value: 3, label: "3 — Good" },
  { value: 2, label: "2 — Fair" },
  { value: 1, label: "1 — Poor" },
];

interface PlaceLoadState {
  placeId: string;
  version: number;
  status: "loading" | "success" | "error";
  error: unknown;
}

export default function PlaceDetail({ placeId }: { placeId: string }) {
  const [detail, setDetail] = useState<PlaceResponse | null>(null);
  const [refresh, setRefresh] = useState({ version: 0, quiet: false });
  const [loadState, setLoadState] = useState<PlaceLoadState>({
    placeId: "",
    version: -1,
    status: "loading",
    error: null,
  });
  const { userId, userName } = useActingUser();
  const broadcastAvailabilityChanged = useAvailabilitySync(() =>
    setRefresh((current) => ({ version: current.version + 1, quiet: true })),
  );

  useEffect(() => {
    const controller = new AbortController();
    void getPlace(placeId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) {
          setDetail(response);
          setLoadState({
            placeId,
            version: refresh.version,
            status: "success",
            error: null,
          });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setLoadState({
            placeId,
            version: refresh.version,
            status: "error",
            error: cause,
          });
        }
      });
    return () => controller.abort();
  }, [placeId, refresh.version]);

  const retryLoading = () =>
    setRefresh((current) => ({ version: current.version + 1, quiet: false }));
  const refreshAfterMutation = () =>
    setRefresh((current) => ({ version: current.version + 1, quiet: true }));

  const isCurrentRequest =
    loadState.placeId === placeId && loadState.version === refresh.version;
  const error =
    isCurrentRequest && loadState.status === "error" ? loadState.error : null;
  const loading =
    !detail || (!refresh.quiet && !isCurrentRequest);

  if (loading && !error) {
    return (
      <div className="page-wrap">
        <div className="state-panel" role="status" aria-live="polite">
          <span className="loading-mark" aria-hidden="true" />
          <p>Loading place details…</p>
        </div>
      </div>
    );
  }

  if (!detail && error instanceof ApiClientError && error.status === 404) {
    return (
      <div className="page-wrap">
        <Link className="back-link" href="/">
          ← All places
        </Link>
        <div className="state-panel">
          <p className="eyebrow">Not found</p>
          <h1>This place isn’t in the guide.</h1>
          <p>It may have moved or the link may be incorrect.</p>
          <Link className="button button-primary" href="/">
            Return to places
          </Link>
        </div>
      </div>
    );
  }

  if (!detail && error) {
    return (
      <div className="page-wrap">
        <Link className="back-link" href="/">
          ← All places
        </Link>
        <div className="state-panel state-error" role="alert">
          <h1>We couldn’t load this place.</h1>
          <p>
            {error instanceof Error
              ? error.message
              : "Something went wrong while loading place details."}
          </p>
          <button
            className="button button-secondary"
            type="button"
            onClick={retryLoading}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!detail) {
    return null;
  }

  const myReview = detail.reviews.find((review) => review.userId === userId);

  return (
    <div className="page-wrap detail-page">
      <Link className="back-link" href="/">
        ← All places
      </Link>
      {error !== null && (
        <div className="inline-error" role="alert">
          Place details could not be refreshed. The displayed information may
          be out of date.{" "}
          <button className="text-button" type="button" onClick={retryLoading}>
            Retry
          </button>
        </div>
      )}
      <article>
        <header className="detail-hero">
          <PlaceImage
            placeId={detail.place.id}
            name={detail.place.name}
            category={detail.place.category}
            className="detail-hero-image"
            sizes="(max-width: 620px) 100vw, 44vw"
            preload
          />
          <div className="detail-hero-copy">
            <Link className="detail-guide-link" href="/">
              <span aria-hidden="true">←</span> The Addis guide
            </Link>
            <p className="eyebrow">{detail.place.category}</p>
            <h1>{detail.place.name}</h1>
            <p className="detail-description">{detail.place.description}</p>
            <RatingSummary summary={detail.ratingSummary} />
          </div>
        </header>

        <div className="detail-meta">
          <div>
            <span className="meta-label">Opening hours</span>
            <span>{detail.place.openingHours}</span>
            <small>Illustrative sample hours; verify locally.</small>
          </div>
          <div>
            <span className="meta-label">Visitor notes</span>
            <span>
              {detail.reviews.length
                ? `${detail.reviews.length} shared ${
                    detail.reviews.length === 1 ? "experience" : "experiences"
                  }`
                : "Be the first to share an experience"}
            </span>
          </div>
        </div>

        <section className="detail-section" aria-labelledby="tours-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Plan a visit</p>
              <h2 id="tours-heading">Guided experiences</h2>
            </div>
          </div>
          {detail.tourSlots.length === 0 ? (
            <div className="quiet-panel">
              No tour slots are currently listed for this place.
            </div>
          ) : (
            <div className="tour-list">
              {detail.tourSlots.map((slot) => (
                <TourSlotCard
                  key={slot.id}
                  slot={slot}
                  refreshVersion={refresh.version}
                  onBooked={refreshAfterMutation}
                  broadcastAvailabilityChanged={broadcastAvailabilityChanged}
                />
              ))}
            </div>
          )}
        </section>

        <section className="detail-section review-layout" aria-labelledby="reviews-heading">
          <div className="review-list-column">
            <div className="section-heading">
              <div>
                <p className="eyebrow">From visitors</p>
                <h2 id="reviews-heading">Reviews</h2>
              </div>
              <RatingSummary summary={detail.ratingSummary} />
            </div>
            {detail.reviews.length === 0 ? (
              <div className="quiet-panel">
                No reviews yet. Your perspective can help someone plan a visit.
              </div>
            ) : (
              <div className="review-list">
                {detail.reviews.map((review) => (
                  <article className="review-card" key={review.id}>
                    <div className="review-card-heading">
                      <strong>{review.reviewerName}</strong>
                      <span className="review-rating">
                        {review.rating} <span aria-hidden="true">/</span> 5
                      </span>
                    </div>
                    <p>{review.body}</p>
                    <time dateTime={review.createdAt}>
                      {formatDate(review.createdAt)}
                    </time>
                  </article>
                ))}
              </div>
            )}
          </div>
          <ReviewForm
            key={`${placeId}:${userId}`}
            placeId={placeId}
            userId={userId}
            userName={userName}
            existingReview={myReview}
            onSaved={refreshAfterMutation}
            onDeleted={refreshAfterMutation}
          />
        </section>
      </article>
    </div>
  );
}

function ReviewForm({
  placeId,
  userId,
  userName,
  existingReview,
  onSaved,
  onDeleted,
}: {
  placeId: string;
  userId: string;
  userName: string;
  existingReview: PlaceResponse["reviews"][number] | undefined;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [rating, setRating] = useState(
    String(existingReview?.rating ?? 5),
  );
  const [body, setBody] = useState(existingReview?.body ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const reviewRemoved = deleteConfirmed && !existingReview;
  const displayedRating = reviewRemoved ? "5" : rating;
  const displayedBody = reviewRemoved ? "" : body;
  const bodyLength = useMemo(
    () => Array.from(displayedBody.trim()).length,
    [displayedBody],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || deleting) {
      return;
    }
    setError("");
    setSuccess("");

    if (!userId) {
      setError("Choose an acting user before submitting a review.");
      return;
    }
    if (!body.trim()) {
      setError("Write a few words about your visit before submitting.");
      return;
    }
    if (bodyLength > MAX_REVIEW_BODY_LENGTH) {
      setError(`Keep your review to ${MAX_REVIEW_BODY_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      await saveReview(placeId, userId, {
        rating: Number(rating),
        body,
      });
      setSuccess(
        existingReview
          ? "Your review has been updated."
          : "Your review has been added. Thank you for sharing.",
      );
      setBody(body.trim());
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your review could not be saved. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!existingReview || !userId || deleting || submitting) {
      return;
    }
    if (
      !window.confirm(
        "Delete your review? Your review and rating for this place will be removed.",
      )
    ) {
      return;
    }

    setError("");
    setSuccess("");
    setDeleting(true);
    try {
      await deleteReview(placeId, userId);
      setDeleteConfirmed(true);
      setSuccess("Review deleted. Refreshing the place details…");
      onDeleted();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your review could not be deleted. Please try again.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form className="review-form" onSubmit={handleSubmit} noValidate>
      <p className="eyebrow">{existingReview ? "Your review" : "Your turn"}</p>
      <h3>{existingReview ? "Update your thoughts" : "Share your experience"}</h3>
      {userId ? (
        <p className="form-context">Writing as {userName}</p>
      ) : (
        <p className="form-context">Choose a demo user in the header to write.</p>
      )}
      <label htmlFor="review-rating">Your rating</label>
      <select
        id="review-rating"
        value={displayedRating}
        onChange={(event) => {
          setDeleteConfirmed(false);
          setRating(event.target.value);
        }}
        disabled={submitting || deleting}
      >
        {reviewRatingOptions.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <label htmlFor="review-body">Review</label>
      <textarea
        id="review-body"
        value={displayedBody}
        onChange={(event) => {
          setDeleteConfirmed(false);
          setBody(event.target.value);
        }}
        rows={5}
        aria-describedby="review-length review-help"
        disabled={submitting || deleting}
        placeholder="What should another visitor know?"
      />
      <div className="field-note-row">
        <small id="review-help">Please keep your review respectful and useful.</small>
        <small id="review-length">{bodyLength}/{MAX_REVIEW_BODY_LENGTH}</small>
      </div>
      {error && (
        <p className="form-message form-error" role="alert">
          {error}
        </p>
      )}
      {(reviewRemoved ? "Your review has been deleted." : success) && (
        <p className="form-message form-success" role="status" aria-live="polite">
          {reviewRemoved ? "Your review has been deleted." : success}
        </p>
      )}
      {existingReview && (
        <button
          className="button button-secondary button-full"
          type="button"
          onClick={() => void handleDelete()}
          disabled={submitting || deleting || !userId}
        >
          {deleting ? "Deleting review…" : "Delete my review"}
        </button>
      )}
      <button
        className="button button-primary button-full"
        type="submit"
        disabled={submitting || deleting || !userId}
      >
        {submitting
          ? "Saving…"
          : existingReview
            ? "Update review"
            : "Post review"}
      </button>
    </form>
  );
}

function TourSlotCard({
  slot,
  refreshVersion,
  onBooked,
  broadcastAvailabilityChanged,
}: {
  slot: PlaceTourSlot;
  refreshVersion: number;
  onBooked: () => void;
  broadcastAvailabilityChanged: () => void;
}) {
  const { userId } = useActingUser();
  const [seats, setSeats] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [bookings, setBookings] = useState<UserSlotBooking[]>([]);
  const [bookingsUserId, setBookingsUserId] = useState("");
  const [bookingsStatus, setBookingsStatus] = useState<
    "loading" | "success" | "error"
  >("loading");
  const [bookingsRefresh, setBookingsRefresh] = useState(0);
  const [bookingsError, setBookingsError] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  const [cancellationError, setCancellationError] = useState("");
  const [cancellationSuccess, setCancellationSuccess] = useState("");
  const bookingAttempt = useRef<{
    idempotencyKey: string;
    slotId: string;
    userId: string;
    seats: number;
  } | null>(null);
  const isFull = slot.remainingSeats <= 0;
  const visibleBookings =
    userId && bookingsUserId === userId ? bookings : [];
  const visibleBookingsStatus = !userId
    ? "success"
    : bookingsUserId === userId
      ? bookingsStatus
      : "loading";
  const visibleBookingsError =
    bookingsUserId === userId ? bookingsError : "";

  useEffect(() => {
    if (!userId) {
      return;
    }

    const controller = new AbortController();
    void getSlotBookings(slot.id, userId, controller.signal)
      .then(({ bookings: userBookings }) => {
        if (!controller.signal.aborted) {
          setBookings(userBookings);
          setBookingsUserId(userId);
          setBookingsError("");
          setBookingsStatus("success");
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setBookingsUserId(userId);
          setBookingsError(
            cause instanceof Error
              ? cause.message
              : "Your bookings could not be loaded.",
          );
          setBookingsStatus("error");
        }
      });

    return () => controller.abort();
  }, [slot.id, userId, refreshVersion, bookingsRefresh]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const seatCount = Number(seats);
    if (!Number.isSafeInteger(seatCount) || seatCount < 1) {
      setError("Choose a positive whole number of seats.");
      return;
    }
    if (seatCount > slot.remainingSeats) {
      setError(
        `Only ${slot.remainingSeats} ${
          slot.remainingSeats === 1 ? "seat is" : "seats are"
        } currently available.`,
      );
      return;
    }
    if (!userId) {
      setError("Choose an acting user before booking.");
      return;
    }

    setSubmitting(true);
    const currentAttempt = bookingAttempt.current;
    const idempotencyKey =
      currentAttempt?.slotId === slot.id &&
      currentAttempt.userId === userId &&
      currentAttempt.seats === seatCount
        ? currentAttempt.idempotencyKey
        : crypto.randomUUID();
    bookingAttempt.current = {
      idempotencyKey,
      slotId: slot.id,
      userId,
      seats: seatCount,
    };
    try {
      const result = await bookTourSlot(
        slot.id,
        userId,
        { seats: seatCount },
        idempotencyKey,
      );
      bookingAttempt.current = null;
      setSuccess(
        `Booking confirmed for ${result.booking.seats} ${
          result.booking.seats === 1 ? "seat" : "seats"
        }. ${result.remainingSeats} remain.`,
      );
      setSeats("1");
      setBookingsRefresh((version) => version + 1);
      broadcastAvailabilityChanged();
      onBooked();
    } catch (cause) {
      if (
        cause instanceof ApiClientError &&
        cause.status >= 400 &&
        cause.status < 500
      ) {
        bookingAttempt.current = null;
      }
      if (cause instanceof ApiClientError && cause.status === 409) {
        setError(
          cause.code === "SLOT_FULL"
            ? "This tour has just filled up. Please choose another experience."
            : cause.message,
        );
        onBooked();
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : "Your booking could not be completed. Please try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancellation(bookingId: string) {
    if (!userId || cancellingId) {
      return;
    }
    setCancellationError("");
    setCancellationSuccess("");
    setCancellingId(bookingId);
    try {
      const result = await cancelTourBooking(bookingId, userId);
      setCancellationSuccess(
        result.cancelled
          ? "Booking cancelled. Seats released."
          : "This booking was already cancelled.",
      );
      setBookingsRefresh((version) => version + 1);
      broadcastAvailabilityChanged();
      onBooked();
    } catch (cause) {
      setCancellationError(
        cause instanceof Error
          ? cause.message
          : "Your booking could not be cancelled. Please try again.",
      );
    } finally {
      setCancellingId("");
    }
  }

  return (
    <article className="tour-card">
      <div className="tour-card-info">
        <p className="eyebrow">Guided tour</p>
        <h3>
          <time dateTime={slot.startsAt}>{formatDateTime(slot.startsAt)}</time>
        </h3>
        <p className="availability-line">
          {slot.bookedSeats} booked <span aria-hidden="true">·</span>{" "}
          {slot.capacity} seats total
        </p>
        <p className={isFull ? "availability-full" : "availability-open"}>
          {isFull
            ? "Fully booked"
            : `${slot.remainingSeats} ${
                slot.remainingSeats === 1 ? "seat" : "seats"
              } available`}
        </p>
      </div>
      <form className="booking-form" onSubmit={handleSubmit}>
        <label htmlFor={`seats-${slot.id}`}>Seats</label>
        <div className="booking-controls">
          <input
            id={`seats-${slot.id}`}
            type="number"
            min={1}
            max={slot.remainingSeats}
            step={1}
            value={seats}
            onChange={(event) => setSeats(event.target.value)}
            disabled={isFull || submitting || !userId}
          />
          <button
            className="button button-primary"
            type="submit"
            disabled={isFull || submitting || !userId}
          >
            {submitting ? "Booking…" : "Book seats"}
          </button>
        </div>
        {!userId && (
          <small className="field-help">Choose a demo user to book.</small>
        )}
        {error && (
          <p className="form-message form-error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="form-message form-success" role="status" aria-live="polite">
            {success}
          </p>
        )}
      </form>
      {visibleBookingsStatus === "loading" && (
        <p className="user-bookings-status" role="status">
          Loading your bookings…
        </p>
      )}
      {visibleBookingsStatus === "error" && (
        <div className="user-bookings-status" role="alert">
          {visibleBookingsError}{" "}
          <button
            className="text-button"
            type="button"
            onClick={() => setBookingsRefresh((version) => version + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {visibleBookings.length > 0 && (
        <div className="user-bookings" aria-label="Your bookings">
          <p className="user-bookings-heading">Your bookings</p>
          {visibleBookings.map((booking) => (
            <div className="user-booking-row" key={booking.id}>
              <span>
                {booking.status === "active" ? "Active" : "Cancelled"} ·{" "}
                {booking.seats} {booking.seats === 1 ? "seat" : "seats"}
              </span>
              {booking.status === "active" && (
                <button
                  className="text-button"
                  type="button"
                  disabled={cancellingId !== ""}
                  onClick={() => void handleCancellation(booking.id)}
                >
                  {cancellingId === booking.id
                    ? "Cancelling…"
                    : "Cancel booking"}
                </button>
              )}
            </div>
          ))}
          {cancellationError && (
            <p className="form-message form-error" role="alert">
              {cancellationError}
            </p>
          )}
          {cancellationSuccess && (
            <p className="form-message form-success" role="status" aria-live="polite">
              {cancellationSuccess}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function formatDateTime(value: string): string {
  return `${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
