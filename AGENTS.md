# Wayfarer agent instructions

- Treat [`docs/PRD.md`](docs/PRD.md) as the product-requirements source of
  truth and [`DECISIONS.md`](DECISIONS.md) as the source of truth for accepted
  architectural and technical decisions.
- Follow the existing stack and architecture. Add dependencies or abstractions
  only for a concrete need, and document meaningful architectural or data-model
  decisions in `DECISIONS.md`.
- Do not silently change PRD requirements, schema contracts, or public API
  behavior. If requirements are ambiguous, inspect the existing code and
  documentation first; ask a specific question only when the ambiguity
  materially affects correctness.
- Prefer small, focused changes. Preserve existing behavior unless a change is
  intentional and tested.
- Validate inputs at API boundaries and enforce critical invariants at the
  database or service layer. Never rely on frontend checks alone for data
  integrity or booking capacity.
- Add or update tests for each meaningful behavior change.
- Run relevant tests, lint, type checking, and build before declaring work
  complete. Never claim a check passed unless it was actually run.
- Never fabricate data, real-world opening hours, benchmark results, or
  implementation status.
- Update `README.md` when setup or developer workflows change. Record actual AI
  assistance and verification in `AI_USAGE.md`; do not fabricate usage
  examples.
- Before using version-specific framework APIs, inspect the installed
  framework's documentation. This repository uses Next.js 16.4.4; do not
  assume older Next.js conventions apply.
