"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getPlaces,
  type PlaceListItem,
} from "../lib/client/api";
import RatingSummary from "./rating-summary";

type PlaceSort = "name" | "top-rated";

interface PlacesLoadState {
  key: string;
  status: "loading" | "success" | "error";
  places: PlaceListItem[];
  error: string;
}

export default function Home() {
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<PlaceSort>("top-rated");
  const [categories, setCategories] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const queryKey = JSON.stringify([category, sort, retry]);
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
    void getPlaces(category, sort, controller.signal)
      .then(({ places: results }) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!category) {
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
  }, [category, sort, queryKey]);

  const resultsLabel = useMemo(() => {
    if (loading) {
      return "Finding places…";
    }
    return `${places.length} ${places.length === 1 ? "place" : "places"}`;
  }, [loading, places.length]);

  return (
    <div className="page-wrap">
      <section className="discovery-hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow">A city, seen slowly</p>
          <h1 id="page-title">
            Find places
            <br />
            <em>worth your time.</em>
          </h1>
          <p className="hero-description">
            Local landmarks, green escapes, and stories of Addis Ababa—shared
            by the people who have been there.
          </p>
          <p className="hero-footnote">
            Ratings balance the score with how many people reviewed a place.
          </p>
        </div>
        <div className="hero-aside" aria-hidden="true">
          <span className="hero-aside-label">Discover</span>
          <span className="hero-aside-number">01</span>
          <span className="hero-aside-caption">Addis Ababa, Ethiopia</span>
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
            </select>
          </div>
          <p className="filter-note">
            Top rated accounts for review count, not just the average.
          </p>
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
            <h3>No places match this filter.</h3>
            <p>Try another category to see more of the city.</p>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setCategory("")}
            >
              Clear category
            </button>
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
                  <div className="place-card-topline">
                    <span className="category-tag">{place.category}</span>
                    <span className="place-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3>{place.name}</h3>
                  <p className="place-description">{place.description}</p>
                  <div className="place-card-bottom">
                    <RatingSummary summary={place.ratingSummary} />
                    <span className="card-arrow" aria-hidden="true">
                      ↗
                    </span>
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
