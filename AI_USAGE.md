# AI usage

## Tools and work supported

AI assistance was used to implement and review the API milestone. Workspace
file-reading and search tools (`view`, `rg`, and `bash`) were used to inspect
the repository instructions, PRD, existing services, tests, and installed
Next.js documentation. `apply_patch` was used for focused source and
documentation edits. The existing npm scripts and TypeScript compiler were
used to validate the changes.

The implementation work added Next.js route handlers for places, reviews,
users, and bookings, shared JSON/error helpers, and a lazy server-side database
accessor. Tests exercise those routes with temporary SQLite databases and the
existing services. This review adds route tests for unknown acting users,
partial-capacity rejection without writes, malformed review JSON, and accurate
booked/remaining-seat summaries.

## Prompt examples and verification

Two actual instructions that guided the work were:

1. “Expose the existing places, review, ranking, and booking capabilities
   through Next.js route handlers. This milestone is API-only: do not build the
   frontend yet.” The route handlers were checked against the PRD, existing
   service contracts, and the installed Next.js 16 route-handler documentation;
   route-level tests then exercised their responses using isolated SQLite data.
2. “A valid but unknown `X-User-Id` cannot create a review or booking.” The
   review and booking routes delegate identity existence checks to their
   existing services. New route tests assert `USER_NOT_FOUND` responses and
   confirm neither operation persists data for the unknown user.

## Unhelpful generated output

An earlier AI-generated place-detail test asserted that the number of tour
slots was greater than or equal to zero. That assertion was vacuous and did
not verify either the empty-slot case or any capacity values. The review
identified the gap. It has been replaced with an exact empty-array assertion
for a place without slots and a separate test that checks persisted booked
seats and the resulting remaining-seat count for a seeded slot.

## Verification

For the API review changes:

- `npm test` — passed; 42 tests across 4 files.
- `npm run lint` — passed.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed with a non-blocking Turbopack warning about dynamic
  filesystem access from `src/lib/db/database.ts`.
- `git diff --check` — passed.
