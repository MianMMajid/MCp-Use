# Lockfile Policy

To avoid cross-surface dependency churn, lockfiles are scoped to approved surfaces:

- `/package-lock.json` (root backend/integration orchestration)
- `/frontend/frontendA-it-console/template-runtime/package-lock.json`
- `/frontend/frontendB-desktop-app/package-lock.json`
- `/frontend/frontendB-desktop-app/template-runtime/package-lock.json`
- `/frontend/frontendC-marketing-download-site/template-runtime/package-lock.json`

Guard command:

```bash
npm run check:lockfile-policy
```

CI runs this guard in backend, frontend, and K8s release-gate workflows.
