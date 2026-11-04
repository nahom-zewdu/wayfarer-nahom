# Wayfarer

Wayfarer is a take-home assignment for place discovery, honest ratings, and
safe tour bookings. The repository includes the SQLite database foundation,
server-side API, and a desktop-first frontend for discovering Addis Ababa
places, sharing reviews, and booking available tour seats. Acting users are
demo identities from the seeded user list; authentication is not implemented.

## Technology

- Next.js 16.4.4 and React
- TypeScript and Node.js
- SQLite through `better-sqlite3`
- Vitest

The assignment requirements are in [`docs/PRD.md`](docs/PRD.md). Accepted
architecture and data-model decisions live in [`DECISIONS.md`](DECISIONS.md).

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

## API surface

The application exposes server-side route handlers for the data layer that is
implemented by the application:

```http
GET /api/places?category=Park&sort=top-rated
GET /api/places/:id
GET /api/users
POST /api/places/:id/reviews
POST /api/tour-slots/:id/bookings
```

Examples:

```http
GET /api/places
GET /api/places?category=Museum&sort=top-rated
GET /api/places/national-museum-of-ethiopia
GET /api/users

POST /api/places/national-museum-of-ethiopia/reviews
X-User-Id: user-001
Content-Type: application/json

{"rating":5,"body":"Excellent museum."}

POST /api/tour-slots/slot-entoto-001/bookings
X-User-Id: user-001
Content-Type: application/json

{"seats":1}
```

The list endpoint returns place metadata plus a `ratingSummary` block. The
place-details endpoint includes reviews, reviewer names, and tour-slot
summaries including booked seats and remaining seats. Review and booking
requests validate runtime input and return JSON error payloads with stable
status codes.

The frontend at `/` supports backend category filtering and top-rated or name
sorting. Select a demo user in the shared header, open a place for its reviews
and tour slots, then submit or update a review and book available seats.

## Checks

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
```

`npm test` runs the Vitest suite once and exits with its result.
