# Frontend A Template Runtime

This package is the canonical frontend A runtime. The operator product target is the SvelteKit `/maple` workspace, not the legacy `public/judges.*` console and not the older React-like `src/app/maple/*` reference views.

## Canonical ownership

- Route entry: `src/routes/maple/+layout.svelte` with real route ownership under `src/routes/maple/*/+page.svelte`
- Shell and route host: `src/lib/svelte-workspace/MapleShell.svelte` and `src/lib/svelte-workspace/MapleRoutePage.svelte`
- Route metadata: `src/lib/maple-workspace/route-registry.js`
- Machine-readable parity matrix: `src/lib/maple-workspace/frontendA-parity-spec.js`

## Security-vision parity

Frontend A parity is defined at four layers:
- operator abilities and workflows
- Svelte `/maple` route and GUI reachability
- backend API coverage
- CLI command coverage for the same operator actions

Use these checks when working on the workspace:

```bash
npm run check:route-conflicts
npm run check
npm run check:parity
npm run test
```

## Legacy reference intake

- `../../public/judges.html`
- `../../public/judges.css`
- `../../public/judges.js`

Those files are reference-only inputs for parity decisions. Every still-needed capability must be absorbed into the Svelte `/maple` workspace or explicitly marked retired in the parity matrix.
