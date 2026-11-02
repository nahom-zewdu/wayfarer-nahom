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
