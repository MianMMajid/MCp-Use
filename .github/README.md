# GitHub Automation Notes

- `.github/settings.yml` defines the intended branch protection baseline for `main`.
- This file is applied automatically only when a repository settings automation app (for example, Probot Settings) is enabled.
- Required CI gates for backend integrity are enforced in `.github/workflows/backend-service-mesh-ci.yml`.
- Branch protection is also actively verified in CI via `npm run branch-protection:check` using the GitHub GraphQL API, so drift is detected even when settings automation is not installed.
