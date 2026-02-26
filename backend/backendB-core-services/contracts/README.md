# Contracts

Canonical protocol contract location.

Place protobuf and API contracts in:
- `proto/`

Contract files are generated from the checked-in `maple-proto-ts` stubs:

- Generate/update: `npm run contracts:generate`
- Drift guard: `npm run typecheck:mesh` (runs proto sync validation)
- Canonical source: `backend/backendB-core-services/contracts/proto`
- Runtime sync targets:
  - `backend/proto`
  - `backend/backendB-core-services/proto`
  - `backend/backendB-core-services/admin-console-api/proto`
