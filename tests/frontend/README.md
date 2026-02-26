# Frontend Test Strategy

## Stack
- `vitest` + `jsdom` for fast logic/unit tests of browser scripts.
- `@testing-library/*` + `@testing-library/jest-dom` for DOM assertions and interaction behavior.
- `playwright` for end-to-end browser flows.
- `msw` reserved for future API contract mocking in shared integration-style tests.

## Commands
- `npm run test:frontend:setup`
- `npm run test:frontend:setup:ci`
- `npm run test:frontend:unit`
- `npm run test:frontend:unit:watch`
- `npm run test:frontend:coverage`
- `npm run test:frontend:e2e`
- `npm run test:frontend:flow`
- `npm run test:frontend:flow:quick`
- `npm run test:frontend:flow:ci`

## Full Test Flow
1. `test:frontend:setup` (or `test:frontend:setup:ci`) installs Chromium for Playwright.
2. `test:frontend:unit` validates logic and browser-script behavior in `jsdom`.
3. `test:frontend:coverage` enforces minimum coverage thresholds.
4. `test:frontend:e2e` runs end-to-end browser tests against the deterministic local test server.
5. `test:frontend:flow` executes all stages in sequence via `tests/frontend/scripts/run-flow.mjs`.

## Current Coverage Scope
- `frontend/frontendA-it-console/public/judges-auth.js`
  - API key hydration/persistence, session checks, logout event behavior, storage failure handling.
- `frontend/frontendA-it-console/public/judges-http.js`
  - Request headers/credentials, retry behavior, parse failures, status/error propagation.
- `frontend/frontendC-marketing-download-site/public/landing.js`
  - Sign-in/sign-up validation, unsafe redirect prevention, payload correctness, error-state UI, forgot-password flow.
- `frontend/frontendB-desktop-app/app/desktop-ui.js`
  - Runtime status rendering, control actions, bridge fallback, polling degradation behavior, update banner/install failures.

## E2E Harness
- Default Playwright runs against a deterministic local server:
  - `tests/frontend/e2e/test-server.mjs`
  - Serves `landing.html` + static assets and mock auth API responses.
- Override target app by setting:
  - `FRONTEND_BASE_URL=http://127.0.0.1:3000 npm run test:frontend:e2e`

## Online-Validated Testing Standards
- Testing Library emphasizes tests that resemble real user behavior and prioritizing accessible queries (`getByRole`, labels) over implementation details:
  - https://testing-library.com/docs/guiding-principles
  - https://testing-library.com/docs/queries/about
- Prefer `user-event` for realistic multi-event interactions over low-level `fireEvent` in interaction-heavy tests:
  - https://testing-library.com/docs/user-event/intro/
- Playwright best practices recommend resilient locators, web-first assertions, and trace-first debugging:
  - https://playwright.dev/docs/best-practices
  - https://playwright.dev/docs/trace-viewer
- Playwright test isolation is context-per-test; keep state independent and parallel-safe:
  - https://playwright.dev/docs/browser-contexts
- Playwright + axe is the recommended automated accessibility path, with manual checks still required:
  - https://playwright.dev/docs/accessibility-testing
- Vitest recommends V8 coverage for speed and accuracy, with explicit include/exclude control:
  - https://vitest.dev/guide/coverage
  - https://vitest.dev/config/coverage
- MSW supports client-agnostic, reusable network mocks across unit/integration/e2e environments:
  - https://mswjs.io/
- jsdom does not implement full navigation; redirect assertions are better validated in browser e2e tests:
  - https://github.com/jsdom/jsdom

## Implementation Plan (Complete)
1. Stabilize baseline
   - Keep unit and e2e test commands green on every PR.
   - Generate coverage report and track branch/line trends weekly.
2. Expand highest-risk logic coverage
   - Add unit tests for `judges.js` helper logic via extracted pure functions.
   - Add tests for topology/policy rendering and guardrail action edge cases.
3. Add API-contract frontend tests
   - Introduce `msw` handlers shared across unit/integration tests.
   - Validate frontend behavior for auth expiry, throttling, and malformed payloads.
4. Deepen e2e confidence
   - Add role-based auth scenarios (login/logout/session expiry).
   - Add desktop-shell e2e smoke tests for bridge availability/fallback.
   - Add accessibility assertions on critical pages.
5. Enforce quality gates in CI
   - Upload coverage artifacts and Playwright traces on failure.
   - Add minimum coverage thresholds after one stable baseline cycle.
   - Block merge on failing frontend test suites.

## Implementation Plan (Operational Detail)
1. Foundation (week 1)
   - Keep this test harness as the single entry point.
   - Add CI jobs for `test:frontend:unit` and `test:frontend:e2e`.
   - Acceptance: both suites run automatically on PRs.
2. Coverage hardening (week 1-2)
   - Add threshold gates after one baseline run (`lines`, `branches`, `functions`).
   - Keep coverage includes scoped to frontend browser scripts.
   - Acceptance: CI fails when thresholds regress.
3. Contract-driven API behavior (week 2)
   - Add shared `msw` handlers for auth, timeout, throttling, malformed payloads.
   - Reuse handlers between unit and integration-like tests.
   - Acceptance: deterministic tests for all critical API failure classes.
4. E2E depth expansion (week 2-3)
   - Add auth session lifecycle tests (login, expired session, logout, re-login).
   - Add role/permission path coverage and unsafe redirect/path tampering tests.
   - Acceptance: critical user flows covered end-to-end with stable retries.
5. Accessibility gate (week 3)
   - Introduce targeted `@axe-core/playwright` checks on landing/judge critical paths.
   - Track known violations separately and reduce over time.
   - Acceptance: zero new automated critical/high accessibility violations.
6. Flakiness controls and observability (ongoing)
   - Keep Playwright traces/videos/screenshots on failure.
   - Add a flaky-test triage checklist and quarantine policy.
   - Acceptance: stable CI signal with documented failure diagnostics.
