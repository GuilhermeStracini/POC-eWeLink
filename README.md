# eWeLink / Sonoff local-control PoC

A local React + Node.js dashboard for listing and controlling Sonoff/eWeLink devices. Credentials stay in the Express backend and are never delivered to the browser. The backend uses the [`baugp/ewelink-api`](https://github.com/baugp/ewelink-api) fork directly from GitHub.

## Architecture

```text
React / Vite → REST API → Node.js / Express → ewelink-api → eWeLink API → Sonoff devices
```

## Requirements

- Node.js 20 or newer
- An eWeLink account and its API region

## Configuration

Copy `backend/.env.example` to `backend/.env`, then add your credentials:

```env
EWELINK_REGION=eu
EWELINK_USERNAME=you@example.com
EWELINK_PASSWORD=your-password
```

`backend/.env` is ignored by Git. Do not use `VITE_` variables for these values.

`EWELINK_REGION` is the region the account was created in (`eu`, `us`, `as` or `cn`), which is not necessarily where you live: an account created in Brazil lives in `us`. If the region is wrong, eWeLink answers the login with the right one and the backend retries there automatically, logging the switch. Authentication failures are logged with the eWeLink error code and message in the backend console; the API responses stay generic.

## Install and run

```bash
npm install
npm run dev
```

The root install script installs backend and frontend dependencies. Open http://localhost:5173. The backend runs on http://localhost:3000.

To run the two services independently:

```bash
npm run dev:backend
npm run dev:frontend
```

Build the frontend with `npm run build`.

## API documentation

With the backend running, open [Scalar API Reference](http://localhost:3000/api-docs). The raw OpenAPI document is available at `http://localhost:3000/openapi.json`.

## REST API

- `GET /api/health` – verifies eWeLink connectivity without revealing secrets
- `GET /api/devices` – lists normalized devices
- `GET /api/devices/:deviceId` – retrieves one device
- `POST /api/devices/:deviceId/on` – turns a device on
- `POST /api/devices/:deviceId/off` – turns a device off

## Features

- Responsive smart-home dashboard (four, two, or one cards per row)
- Online/offline and ON/OFF state indicators
- Per-device accessible toggle controls and in-place switching status
- Skeleton loading, empty, and friendly error states
- Refresh control and a Vite `/api` development proxy

## Limitations

This is intentionally a PoC. It has no database, user authentication, multi-user support, persistent device configuration, cloud deployment, advanced automation, scheduling, scenes, or device grouping.
