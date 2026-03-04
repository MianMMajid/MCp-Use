# A/B/C Cutover Release-Readiness Checklist

Use this checklist before merging to `main` for the cutover hardening stream.

## Merge Gates

- [ ] `bash scripts/run-full-matrix.sh --all` passes.
- [ ] `artifacts/matrix/full-matrix-summary.json` reports `"ok": true`.
- [ ] `artifacts/matrix/full-matrix-summary.json` is valid JSON (`jq .`).
- [ ] `artifacts/matrix/k8s-validation-summary.json` is valid JSON (`jq .`).
- [ ] `artifacts/matrix/k8s-release-gate-summary.json` is valid JSON (`jq .`).
- [ ] Any present `artifacts/matrix/live-suite-skip.json` is valid JSON and includes `generatedAt`, `reason`, `missingEnv[]`, `policyMode`.
- [ ] `scripts/check-no-legacy-modifier-endpoints.sh` passes.
- [ ] `scripts/check-source-backed-packages.sh` passes.
- [ ] `scripts/check-repo-hygiene.sh` passes.
- [ ] `scripts/check-lockfile-policy.sh` passes.
- [ ] `scripts/check-deprecated-command-aliases.mjs` passes.
- [ ] `scripts/check-command-surface.mjs` passes (`<=60` root scripts).
- [ ] `scripts/check-docs-architecture-drift.mjs` passes.
- [ ] `scripts/dependency-security-pass.mjs` passes with zero High/Critical violations (or valid, unexpired allowlist exceptions).
- [ ] Frontend B surface guard (`npm run check:frontendB:surface`) passes.
- [ ] No direct `@maple/*/src/...` runtime imports remain.
- [ ] No transient artifact pollution appears in `git status` (for example `ERROR`, `.next.bak.*`, `dist 2`).
- [ ] Debt SLO status generated and reviewed (`artifacts/debt/debt-slo-status.json`).
- [ ] Debt register report generated and reviewed (`artifacts/debt/debt-register-report.json`).

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
