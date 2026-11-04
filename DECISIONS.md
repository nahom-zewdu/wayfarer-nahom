# Database decisions

Wayfarer uses SQLite through `better-sqlite3`. A local file keeps this small,
single-instance assignment simple to run and test without a hosted service,
ORM, or separate database process. SQLite provides the required relational
constraints and transactions with very little operational setup. The database
opens lazily through `openDatabase()`; callers can pass an explicit filename,
and `DATABASE_PATH` can select a local file other than the default
`data/wayfarer.sqlite`. Relative configured or explicit filenames are resolved
by the SQLite driver against the process working directory; absolute paths are
used as supplied, and `:memory:` creates an in-memory database. The default
path is `<process working directory>/data/wayfarer.sqlite`.

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
capacity handling is implemented in the booking service as described below.

## API layer

The repository uses Next.js Route Handlers for server-only API access. The
handlers validate request headers, query parameters, and JSON bodies before
calling the existing SQLite-backed services. This keeps the API thin: route
handlers translate HTTP concerns (status codes, headers, JSON bodies) into the
already-tested service and database logic instead of re-implementing business
rules. A consistent JSON error wrapper is used for malformed input, missing
resources, invalid IDs, and service-level rejections, while unexpected issues
return a generic 500 response without exposing stack traces.

The read-only users endpoint awaits Next.js `connection()` before querying
SQLite. With Cache Components enabled, a synchronous `better-sqlite3` query can
otherwise run during prerendering; the acting-user list must reflect the
database at request time rather than a build-time snapshot. The call stays
outside the route's error wrapper so Next.js can handle its prerender
suspension rather than treating it as an application error.

## Frontend

The root layout provides one client-side acting-user context so the selected
demo user remains consistent while navigating between the list and detail
pages. Interactive list and detail components call the HTTP API through a
small typed client adapter; ranking, review upsert, and booking-capacity rules
remain in the existing backend. Review and booking success trigger a detail
refresh so the displayed summary reflects persisted data.

The frontend interaction tests use React Testing Library and jsdom as
development-only dependencies. The repository previously had no DOM test
environment; these tools allow tests to exercise actual filter changes, acting
user headers, review updates, capacity errors, and duplicate-submit disabling
without adding runtime dependencies.

Tailwind CSS v4 is processed with its documented PostCSS plugin while the
application's editorial styles remain ordinary global CSS. The previous
Turbopack loader integration replaced the input stylesheet with generated
Tailwind output, dropping those authored rules in the browser.

## Booking capacity

The booking service validates the request, then uses a short SQLite
`BEGIN IMMEDIATE` transaction to read slot capacity, sum all booked seats, and
insert only when the requested seats fit. `IMMEDIATE` acquires SQLite's write
reservation before the occupancy read; competing writers wait (subject to the
configured busy timeout) and then see the preceding committed booking before
checking capacity. The occupancy check and insert therefore cannot race past
capacity on this database. This protects the capacity invariant, but does not
make retries idempotent: the service generates a new booking ID for each
accepted request and has no client-supplied idempotency key.

The browser disables booking controls while a request is in flight to prevent
accidental repeat clicks in that page. This is client-side duplicate-submit
prevention only; it is not server-side idempotency and cannot deduplicate a
retry after an uncertain network result. The database's positive-seat check
and foreign keys remain the final integrity boundary.

The concurrency test uses a disposable file-backed SQLite database and
independent Node worker threads, each opening its own connection. All workers
wait until their connections are ready before simultaneous single-seat
attempts against a slot with two seats remaining. The test verifies two
successes, capacity errors for the other attempts, and a final occupied-seat
total equal to capacity; worker errors, early exits, and timeouts fail the
test.

SQLite permits only one writer at a time. This is appropriate for this local,
single-instance assignment, but does not provide a shared coordination
mechanism for multiple application instances using separate database files or
hosts. A multi-instance deployment should use a shared database and an
appropriate transaction/locking strategy.
