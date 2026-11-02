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

The schema keeps IDs and timestamps as non-empty text and canonical UTC
timestamps (`YYYY-MM-DDTHH:mm:ss.sssZ`). Review uniqueness, foreign keys,
integer ratings, and positive capacity/seat constraints are enforced by
SQLite rather than relying only on application code.
