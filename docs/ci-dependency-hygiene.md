# CI Dependency Hygiene Checklist

Run this monthly (or before major release branches) to keep dependency debt from compounding.

## Monthly Checklist

1. Run `npm outdated` at repo root and in `frontend/frontendB-desktop-app`.
2. Refresh lockfiles with targeted updates, then run:
   1. `bash scripts/run-full-matrix.sh --all`
3. Check for deprecated transitive packages:
   1. `npm ls --all --omit=dev 2>/dev/null | rg -n "deprecated|invalid|extraneous" -i || true`
4. Record notable dependency upgrades and risk notes in PR description.
5. If coverage tooling regressions occur, keep `COVERAGE_POLICY=advisory` and open/follow an issue to return to `required`.

## CI Policy Defaults

- `COVERAGE_POLICY=advisory` is the current default for CI flow.
- Live-provider suites remain conditional-strict and must emit a skip artifact when secrets are missing.
