"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getPlaces,
  type PlaceListItem,
  type PlaceSort,
} from "../lib/client/api";
import { useAvailabilitySync } from "../lib/client/availability-sync";
import PlaceImage from "./place-image";
import RatingSummary from "./rating-summary";

interface PlacesLoadState {
  key: string;
  status: "loading" | "success" | "error";
  places: PlaceListItem[];
  error: string;
}

export default function Home() {
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<PlaceSort>("top-rated");
  const [minSeats, setMinSeats] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0);
  const queryKey = JSON.stringify([category, sort, minSeats, retry]);
  useAvailabilitySync(() =>
    setAvailabilityRefresh((version) => version + 1),
  );
  const [loadState, setLoadState] = useState<PlacesLoadState>({
    key: "",
    status: "loading",
    places: [],
    error: "",
  });
  const loading =
    loadState.key !== queryKey || loadState.status === "loading";
  const places = loadState.key === queryKey ? loadState.places : [];
  const error =
    loadState.key === queryKey && loadState.status === "error"
      ? loadState.error
      : "";

  useEffect(() => {
    const controller = new AbortController();
    void getPlaces(
      category,
      sort,
      minSeats === "" ? undefined : Number(minSeats),
      controller.signal,
    )
      .then(({ places: results }) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!category && minSeats === "") {
          setCategories(
            [...new Set(results.map((place) => place.category))].sort(),
          );
        }
        setLoadState({
          key: queryKey,
          status: "success",
          places: results,
          error: "",
        });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setLoadState({
            key: queryKey,
            status: "error",
            places: [],
            error:
              cause instanceof Error
                ? cause.message
                : "Could not load places.",
          });
        }
      });

    return () => controller.abort();
  }, [availabilityRefresh, category, minSeats, sort, queryKey]);

  const resultsLabel = useMemo(() => {
    if (loading) {
      return "Finding places…";
    }
    return `${places.length} ${places.length === 1 ? "place" : "places"}`;
  }, [loading, places.length]);
  const hasFilters = category !== "" || minSeats !== "";

  return (
    <div className="page-wrap">
      <section className="discovery-hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow">A city, seen slowly</p>
          <h1 id="page-title">
            Addis Ababa,
            <br />
            <em>at your own pace.</em>
          </h1>
          <p className="hero-description">
            Find storied landmarks, leafy escapes, and everyday city life —
            through the experiences of people who have been there.
          </p>
          <a className="hero-action" href="#places-heading">
            Explore the guide <span aria-hidden="true">↓</span>
          </a>
          <p className="hero-footnote">
            Thoughtful reviews. Availability that stays up to date.
          </p>
        </div>
        <div className="hero-visual" aria-label="Photographs of Addis Ababa places">
          <div className="hero-visual-main">
            <PlaceImage
              placeId="unity-park"
              name="Unity Park"
              category="Park & Culture"
              className="hero-photo"
              sizes="(max-width: 620px) 62vw, 38vw"
              preload
            />
            <span className="hero-photo-caption">Unity Park · Addis Ababa</span>
          </div>
          <div className="hero-visual-stack">
            <PlaceImage
              placeId="holy-trinity-cathedral"
              name="Holy Trinity Cathedral"
              category="Religious & Historic"
              className="hero-photo hero-photo-secondary"
              sizes="(max-width: 620px) 26vw, 16vw"
            />
            <PlaceImage
              placeId="national-museum-of-ethiopia"
              name="National Museum of Ethiopia"
              category="Museum"
              className="hero-photo hero-photo-tertiary"
              sizes="(max-width: 620px) 26vw, 16vw"
            />
          </div>
          <span className="hero-visual-index" aria-hidden="true">
            09°01′N&nbsp; 38°45′E
          </span>
        </div>
      </section>

      <section className="places-section" aria-labelledby="places-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The guide</p>
            <h2 id="places-heading">Places to begin</h2>
          </div>
          <p className="results-count" aria-live="polite">
            {resultsLabel}
          </p>
        </div>

        <div className="filters" aria-label="Filter places">
          <div className="filter-field">
            <label htmlFor="category-filter">Category</label>
            <select
              id="category-filter"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">All places</option>
              {categories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="sort-filter">Sort by</label>
            <select
              id="sort-filter"
              value={sort}
              onChange={(event) => setSort(event.target.value as PlaceSort)}
            >
              <option value="top-rated">Top rated</option>
              <option value="name">Name</option>
              <option value="soonest-available">Soonest available</option>
              <option value="most-available">Most available</option>
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="minimum-seats-filter">Minimum seats</label>
            <select
              id="minimum-seats-filter"
              value={minSeats}
              onChange={(event) => setMinSeats(event.target.value)}
            >
              <option value="">Any</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="4">4+</option>
              <option value="6">6+</option>
            </select>
          </div>
          <p className="filter-note">
            Top-rated ordering considers review count. Availability may change
            before booking.
          </p>
          <details className="ranking-explanation">
            <summary>How ranking works</summary>
            <p>
              The rating shown on each place is the arithmetic average of
              visitor ratings. Top-rated sorting instead uses a
              confidence-adjusted score: places with more reviews have
              stronger evidence, while places with few reviews are moderated
              toward the overall average. This keeps one isolated rating from
              dominating the list.
            </p>
            <p className="ranking-formula">
              score = (v / (v + m)) × R + (m / (v + m)) × C
            </p>
            <p>
              R is the place average, v its review count, C the overall
              review-weighted average, and m is the prior strength (5), a
              deliberate design parameter rather than an empirical calibration.
            </p>
          </details>
        </div>

        {loading ? (
          <div className="state-panel" role="status" aria-live="polite">
            <span className="loading-mark" aria-hidden="true" />
            <p>Gathering places for you…</p>
          </div>
        ) : error ? (
          <div className="state-panel state-error" role="alert">
            <h3>We couldn’t load the places.</h3>
            <p>{error}</p>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : places.length === 0 ? (
          <div className="state-panel">
            <h3>
              {hasFilters
                ? "No places match these filters."
                : "No places are available yet."}
            </h3>
            <p>
              {hasFilters
                ? "Try widening the category or seat-availability filters."
                : "Please check again later."}
            </p>
            {hasFilters && (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setCategory("");
                  setMinSeats("");
                  setSort("top-rated");
                }}
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <div className="place-grid">
            {places.map((place, index) => (
              <article className="place-card" key={place.id}>
                <Link
                  className="place-card-link"
                  href={`/places/${encodeURIComponent(place.id)}`}
                  aria-label={`Explore ${place.name}`}
                >
                  <PlaceImage
                    placeId={place.id}
                    name={place.name}
                    category={place.category}
                    className="place-card-image"
                  />
                  <div className="place-card-content">
                    <div className="place-card-topline">
                      <span className="category-tag">{place.category}</span>
                      <span className="place-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3>{place.name}</h3>
                    <p className="place-description">{place.description}</p>
                    <PlaceAvailability availability={place.availability} />
                    <div className="place-card-bottom">
                      <RatingSummary summary={place.ratingSummary} />
                      <span className="card-arrow" aria-hidden="true">
                        Explore <span>↗</span>
                      </span>
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PlaceAvailability({
  availability,
}: {
  availability: PlaceListItem["availability"];
}) {
  const availableSlot = availability.nextAvailableSlot;
  if (availableSlot) {
    return (
      <div className="place-availability place-availability-open">
        <span className="place-availability-status">
          {availableSlot.remainingSeats}{" "}
          {availableSlot.remainingSeats === 1 ? "seat" : "seats"} available
        </span>
        <time dateTime={availableSlot.startsAt}>
          {formatAvailabilityDateTime(availableSlot.startsAt)}
        </time>
      </div>
    );
  }

  if (availability.nextUpcomingSlot) {
    return (
      <div className="place-availability place-availability-full">
        <span className="place-availability-status">
          Upcoming tours fully booked
        </span>
      </div>
    );
  }

  return (
    <div className="place-availability place-availability-none">
      <span className="place-availability-status">No upcoming tours</span>
    </div>
  );
}

function formatAvailabilityDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "Time to be confirmed";
  }

  const dateText = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "Africa/Addis_Ababa",
  }).format(date);
  const timeText = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Addis_Ababa",
    timeZoneName: "short",
  }).format(date);
  return `${dateText} · ${timeText}`;
}
