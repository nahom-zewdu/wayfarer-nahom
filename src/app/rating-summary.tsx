import type { PlaceListItem } from "../lib/client/api";

export default function RatingSummary({
  summary,
}: {
  summary: PlaceListItem["ratingSummary"];
}) {
  return (
    <span className="rating-summary">
      {summary.averageRating === null ? (
        <span className="rating-empty">Not reviewed yet</span>
      ) : (
        <>
          <span className="rating-value">{summary.averageRating.toFixed(1)}</span>
          <span className="rating-scale">/ 5</span>
        </>
      )}
      <span className="review-count">
        {summary.reviewCount}{" "}
        {summary.reviewCount === 1 ? "review" : "reviews"}
      </span>
    </span>
  );
}
