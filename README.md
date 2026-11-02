# Wayfarer

Wayfarer is a take-home assignment for place discovery, honest ratings, and
safe tour bookings. The current implementation is **only the database
foundation**: SQLite schema initialization, deterministic sample data, and
database tests are present. Place browsing, reviews, ranking, booking, APIs,
and application UI are not implemented yet; the homepage remains the framework
starter page.

## Technology

- Next.js 16.4.4 and React
- TypeScript and Node.js
- SQLite through `better-sqlite3`
- Vitest

The intended product requirements are in [`docs/PRD.md`](docs/PRD.md).
Architectural and data-model decisions are in
[`DECISIONS.md`](DECISIONS.md).

## Prerequisites

- Node.js 20.9 or later
- npm

## Install and run locally

From a fresh clone, run these commands:

```sh
npm ci
npm run db:seed
npm run dev
```

The development server starts at <http://localhost:3000>. The seed command
creates the default local database and inserts stable sample records. It can
be run again safely; it does not replace existing records.

## Database

The default SQLite file is `data/wayfarer.sqlite`; the directory and database
file are ignored by Git. Opening the database initializes the schema.

To select another database file, set `DATABASE_PATH` before running the seed
command or application. For example:

```sh
DATABASE_PATH=/tmp/wayfarer.sqlite npm run db:seed
```

`DATABASE_PATH` is optional, so no `.env.example` is needed. Tests use isolated
temporary SQLite files and do not depend on the local development database.
Seed place opening hours are illustrative sample values, not verified
real-world schedules.

## Checks

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
```

`npm test` runs the Vitest suite once and exits with its result.
