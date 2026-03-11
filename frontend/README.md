# Frontend

This is a small Vite + React + TypeScript dashboard for a local multi-tenant EKS monitor.

## Expected backend contract

- `GET /api/v1/tenants` returns `Tenant[]`
- `GET /api/v1/snapshots` returns `ClusterSnapshot[]`
- `GET /ws` upgrades to a WebSocket and streams backend event envelopes such as `system.connected`, `snapshot.bootstrap`, and `snapshot.updated`

The concrete TypeScript types live in `src/types.ts` and should stay aligned with the Go DTOs.

## Development

1. Install dependencies with `npm install`
2. Run the dev server with `npm run dev`
3. Start the Go backend on `http://localhost:42069`

The frontend calls the backend directly on port `42069` for WebSockets and REST data.
