# AI usage

## Work and tools

AI assistance supported the database foundation, reviews/ranking, booking
capacity, API, API review, and frontend milestones. For the frontend milestone,
workspace file-reading and search tools (`view`, `rg`, and `bash`) were used to
inspect the PRD, existing API/service contracts, test setup, and installed
Next.js 16 documentation. `apply_patch` was used for focused implementation
and documentation changes. npm scripts, Vitest, ESLint, TypeScript, and the
Next.js production build were used for verification.

The frontend work added the Wayfarer shell and metadata, an acting-user
switcher, a backend-filtered places list, place details, review create/update
forms, and tour booking forms. React Testing Library and jsdom were added as
development-only dependencies to exercise real UI interactions; no runtime
dependency was added. The read-only users endpoint was made request-time
because the build showed it was otherwise prerendered under the repository's
Cache Components configuration. A subsequent production build exposed that the
dynamic place `params` read needed a `<Suspense>` boundary and that the
intentional `connection()` prerender suspension must remain outside the API
route's error catch. Both were corrected.

## Prompt examples and how output was checked

The frontend instructions included:

1. “Changing filters/sort must actually call or correctly query the backend
   endpoint, not merely reorder static sample data in the browser.” The list
   uses the typed client adapter to send category and sort query parameters.
   UI tests change both controls and assert the resulting backend request URLs.
2. “If the acting user already has a review for the place, identify it and let
   them edit/update it rather than implying they can create a second review.”
   The detail page compares the selected user ID with the reviews returned by
   the API, pre-fills the matching review, and submits via the existing review
   endpoint. A UI test verifies the prefill, acting-user header, update
   payload, confirmation, and refreshed review.

## An unhelpful initial draft and correction

An initial frontend draft imported `MAX_REVIEW_BODY_LENGTH` from the review
service into a Client Component. The service also imports `node:crypto`, so
that import would have pulled a server-side module into the client dependency
graph. The client/server-boundary review caught this before production build
validation. The length constant was moved to a dependency-free shared module;
the service re-exports it for existing tests, and the frontend imports only
the shared constant.

## Visual styling diagnosis and repair

The follow-up prompt reported that the browser showed stacked text on a black
background despite successful API responses. The root layout import and
stylesheet delivery were checked in the browser, then the served CSS and
computed styles were inspected. The CSS request returned 200, but omitted
`.site-header`, `.discovery-hero`, and the `--paper` token; the browser showed
default black/white styles. Inspection of the installed
`@tailwindcss/turbopack` loader showed that it returns generated Tailwind
output in place of its input, which discarded the stylesheet's ordinary CSS.

The styling pipeline was switched to Next.js 16's documented Tailwind v4
PostCSS integration. The production CSS was checked for the missing selectors
and tokens. Using an isolated, seeded temporary SQLite database, the home and
place-detail pages were inspected in the browser at 1440×1000 and 390×844;
computed styles applied and neither viewport had horizontal overflow.

The booking UI was also updated to refresh place details after HTTP 409
capacity conflicts while preserving the conflict message. Tests cover both a
slot becoming full and a reduced remaining-seat count.

The SQLite path-resolution change preserves relative `DATABASE_PATH` values
relative to the process working directory. Passing the path directly to
`better-sqlite3` instead of resolving it dynamically removed the Turbopack
filesystem-tracing warning. Default, relative, absolute, and in-memory database
paths and repeatable seeding were exercised with disposable databases.

## Verification

- `npm test` — passed; 53 tests across 6 files.
- `npm run lint` — passed.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed; `/api/users` is dynamic and `/places/[id]` uses
  partial prerendering. The previous Turbopack filesystem-tracing warning for
  `src/lib/db/database.ts` is resolved.
- `git diff --check` — passed.
