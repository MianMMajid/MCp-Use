# Backend D: Desktop Runtime Bridge

Owner: Backend engineer.

Purpose:
- Local runtime bridge and backend integration layer used by desktop distributions.

Folders:
- `bridge/`

Implemented:
- `bridge/runtime-controller.cjs`: lifecycle manager used by desktop `.exe/.dmg` to:
  - probe backend health
  - optionally start/stop managed local runtime (`MAPLE_DESKTOP_RUNTIME_MODE=managed`)
  - expose rolling runtime logs
