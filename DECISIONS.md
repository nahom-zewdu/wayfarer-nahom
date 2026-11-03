# Database decisions

Wayfarer uses SQLite through `better-sqlite3`. A local file keeps this small,
single-instance assignment simple to run and test without a hosted service,
ORM, or separate database process. SQLite provides the required relational
constraints and transactions with very little operational setup. The database
opens lazily through `openDatabase()`; callers can pass an explicit filename,
and `DATABASE_PATH` can select a local file other than the default
`data/wayfarer.sqlite`.

Seed the local database with `npm run db:seed`. The seed uses stable IDs,
fixed sample data, and inserts only missing records inside one transaction, so
re-running it preserves existing records. It creates three sample users,
ten Addis Ababa places, seventeen reviews, and four future tour slots.

SQLite is appropriate for local development and a small single-instance
assignment, but a multi-instance production deployment may need a shared
database such as PostgreSQL plus a concurrency strategy suited to concurrent
writers and distributed application instances.

The model follows the PRD fields: users have a name; places have a category,
description, and opening-hours display string; reviews have a body and
creation timestamp; tour slots have a start timestamp and capacity; bookings
refer to a slot. The seed opening hours are illustrative sample values, not
verified operating hours. City and address fields and a review update
timestamp are not part of this model. Updating a review body does not change
its original `created_at`.

IDs and timestamps are text, with timestamps stored as canonical UTC values
(`YYYY-MM-DDTHH:mm:ss.sssZ`). SQLite enforces review uniqueness, foreign keys,
integer ratings from 1 to 5, and positive integer slot capacity and booking
seat counts.

## Review and ranking

Review submission validates integer ratings from 1 to 5 and trims surrounding
whitespace from the body. Empty or whitespace-only bodies are rejected. A
review body is limited to 1,000 Unicode code points after trimming. The
database also enforces rating-range and non-empty-body checks, foreign keys,
and unique `(place_id, user_id)`. The service uses a single SQLite upsert for
create-or-update; updating changes only rating and body, preserving the
original ID and `created_at`. Place and user IDs with surrounding whitespace
are rejected rather than normalized, so lookup identity is explicit.

Places are ordered by the Bayesian weighted-average score:

`score = (v / (v + m)) * R + (m / (v + m)) * C`

`R` is the place's average rating, `v` is its review count, `C` is the average
rating across all reviews (weighted by review count), and `m` is the prior
strength. The default `m` is 5: an average of five hypothetical global-mean
reviews gives low-count places meaningful moderation while real reviews
increase the weight of the place's own average. This is a simple, interpretable
starting point, not an empirically tuned parameter.

A place with no reviews receives `C`, because it has no evidence to move away
from the prior. If the entire dataset has no reviews, `C` defaults to 3, the
midpoint of the 1–5 scale, so empty places receive a neutral finite score.
Ties sort by place ID in ascending lexical order for deterministic output.
The adjustment intentionally weights established review counts: individual
ratings are not equally represented in the global mean.

The pure ranking and database-backed ordering, including the zero-review,
empty-data, low-count, confidence, and tie cases, are covered by tests. Booking
capacity handling and its parallel-request test remain unimplemented.
