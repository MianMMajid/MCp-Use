# Frontend A: IT / Console

Owner: Frontend engineer.

Canonical implementation:
- `template-runtime/` is the canonical frontend A runtime
- `template-runtime/src/routes/maple/+layout.svelte` and `template-runtime/src/routes/maple/*/+page.svelte` are the canonical frontend A route entrypoints
- `template-runtime/src/lib/svelte-workspace/` owns the Maple shell, route layout, and Svelte GUI surfaces
- `public/judges.*` is legacy reference material only; it is not the shipping frontend A surface

Run locally through canonical root loops:
- Fast local: `npm run dev`
- K8s validation: `npm run validate:k8s`

Parity and security-vision source of truth:
- machine-readable capability matrix: `template-runtime/src/lib/maple-workspace/frontendA-parity-spec.js`
- canonical route metadata: `template-runtime/src/lib/maple-workspace/route-registry.js`
- dedicated checker: `node scripts/check-frontendA-cli-parity.mjs`
