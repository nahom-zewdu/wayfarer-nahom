# Wayfarer — honest ratings, fair bookings

## Product and purpose

Wayfarer is a small place-discovery and tour-booking application demonstrating
full-stack engineering, honest rating aggregation, and safe booking under
concurrent requests. This document is the authoritative source for product
requirements. It describes the intended assignment, not a claim that every
feature has been implemented.

## Required stack

- React-based frontend.
- Node.js backend; Next.js route handlers are acceptable.
- SQLite or PostgreSQL.

The current repository uses Next.js 16.4.4, React, Node.js, and SQLite. See the
root `README.md` for current implementation status and developer commands.

## Functional requirements

### A. Places

- Seed approximately ten places.
- Every place has reviews; at least one place has only one or two reviews.
- The places list supports backend category filtering and top-rated sorting.
- Each place has a detail page.
- Seed three users and provide an acting-as user switcher. Authentication is
  not required.
- The backend receives the acting user, for example through an
  `X-User-Id` header.

### B. Reviews and ranking

- Users can submit a rating from 1 to 5 and short review text.
- A user can have at most one review per place.
- Submitting another review for the same place updates the existing review.
- Top-rated ranking accounts for review count; it must not use an unadjusted
  arithmetic average.
- The ranking formula and rationale must be documented in `DECISIONS.md` and
  covered by unit tests before ranking is considered complete.

### C. Tour booking

- Some places have tour slots with a start time and capacity.
- Users can book seats.
- The UI displays remaining seats.
- Concurrent booking requests must never exceed a slot's capacity.
- An automated test issues many parallel booking requests against a nearly
  full slot and verifies the final booking count never exceeds capacity.
- A full slot produces a clear user-facing message rather than an unhandled
  error page.

### D. User experience and developer experience

- Desktop UX is required; mobile optimization is optional.
- Provide loading and error states.
- Ranking and parallel booking tests run with one command.
- A fresh clone is runnable in no more than three commands, with instructions
  documented in `README.md`.

## Suggested data model

This is the assignment's starting model, not an inflexible mandate. Any
departure must solve a concrete requirement and its rationale, trade-offs,
risks, and testing implications must be documented in `DECISIONS.md`.

- **User:** `id`, `name`
- **Place:** `id`, `name`, `category`, `description`, `opening_hours`
- **Review:** `id`, `place_id`, `user_id`, `rating`, `body`, `created_at`;
  unique `(place_id, user_id)`
- **TourSlot:** `id`, `place_id`, `starts_at`, `capacity`
- **Booking:** `id`, `slot_id`, `user_id`, `seats`, `created_at`

Place opening hours supplied as sample data must not be presented as verified
real-world operating hours unless they have been independently verified.

## Optional bonus

Only after all required functionality is complete, implement at most one
optional bonus:

- Mobile optimization.
- Double-click booking safety.
- One well-justified original improvement.

## Submission requirements

- Include `README.md`, `DECISIONS.md`, and `AI_USAGE.md`.
- Add `.env.example` only if environment variables are required.
- Do not commit secrets, `node_modules`, or build output.
- Use meaningful Git commits; do not squash or rewrite the final history.
- Test from a fresh clone.
- If the repository is private, invite `KenaGetachew` with read access.
- Email `hey@ragosoftware.tech` with subject
  `[Intern Take-Home] Your Full Name`, the repository URL, approximate hours
  spent, and relevant notes.
- An optional `v1.0-submission` tag may be added.
