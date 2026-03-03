# A/B/C Cutover Release-Readiness Checklist

Use this checklist before merging to `main` for the cutover hardening stream.

## Merge Gates

- [ ] `bash scripts/run-full-matrix.sh --all` passes.
- [ ] `artifacts/matrix/full-matrix-summary.json` reports `"ok": true`.
- [ ] `scripts/check-no-legacy-modifier-endpoints.sh` passes.
- [ ] `scripts/check-source-backed-packages.sh` passes.
- [ ] `scripts/check-repo-hygiene.sh` passes.
- [ ] `scripts/check-lockfile-policy.sh` passes.
- [ ] `scripts/check-deprecated-command-aliases.mjs` passes.
- [ ] Frontend B surface guard (`npm run check:frontendB:surface`) passes.
- [ ] No direct `@maple/*/src/...` runtime imports remain.
- [ ] No transient artifact pollution appears in `git status` (for example `ERROR`, `.next.bak.*`, `dist 2`).

## PR Slice Policy

Changes should be split into one of these tracks:

1. Package boundary + shared import cleanup.
2. Test determinism and flaky test hardening.
3. CI/matrix/guardrail hardening.
4. Frontend warning/noise cleanup and dependency hygiene.

## Required Evidence In PR Description

- Matrix summary JSON snippet (`stages` + `flakeMarker`).
- Any live-suite skip artifact (`artifacts/matrix/live-suite-skip.json`) when secrets are absent.
- Explicit note of changed guard scripts/workflows.
