# eWeLink / Sonoff local-control PoC

[![Build](https://github.com/GuilhermeStracini/POC-eWeLink/actions/workflows/build.yml/badge.svg)](https://github.com/GuilhermeStracini/POC-eWeLink/actions/workflows/build.yml)
[![Release](https://github.com/GuilhermeStracini/POC-eWeLink/actions/workflows/release.yml/badge.svg)](https://github.com/GuilhermeStracini/POC-eWeLink/actions/workflows/release.yml)
[![GitHub release](https://img.shields.io/github/v/release/GuilhermeStracini/POC-eWeLink?sort=semver)](https://github.com/GuilhermeStracini/POC-eWeLink/releases/latest)

A local React + Node.js dashboard for listing and controlling Sonoff/eWeLink devices. Credentials stay in the Express backend and are never delivered to the browser. The backend uses the [`baugp/ewelink-api`](https://github.com/baugp/ewelink-api) fork directly from GitHub.

## Architecture

```text
React / Vite → REST API → Node.js / Express → ewelink-api → eWeLink API → Sonoff devices
```

## Requirements

- Node.js 22 or newer
- An eWeLink account and its API region

## Configuration

Copy `backend/.env.example` to `backend/.env`, then pick one of the two login modes. `backend/.env` is ignored by Git. Do not use `VITE_` variables for these values.

### OAuth with your own app (needed to switch devices)

1. Create an app on the [eWeLink developer platform](https://dev.ewelink.cc) and register `http://localhost:3000/api/oauth/callback` as its redirect URL.
2. Set its credentials:

   ```env
   EWELINK_APP_ID=your-app-id
   EWELINK_APP_SECRET=your-app-secret
   ```

3. Start the app and click **Connect eWeLink** on the dashboard (or open http://localhost:3000/api/oauth/login), then sign in with your eWeLink account.

The backend stores the resulting tokens in `backend/.ewelink-token.json` (ignored by Git) and refreshes them automatically. Access tokens last 30 days and refresh tokens 60; if the refresh token expires, the dashboard asks you to connect again. `EWELINK_OAUTH_REDIRECT_URL` and `FRONTEND_URL` override the callback URL and where the browser lands afterwards.

eWeLink refuses email/password login for developer apps (error `407`), which is why this mode needs the browser step.

### Password login (read-only)

```env
EWELINK_REGION=eu
EWELINK_USERNAME=you@example.com
EWELINK_PASSWORD=your-password
```

This uses the app ID built into `ewelink-api`, which eWeLink only allows on read paths: listing devices works, but turning them on or off fails with `eWeLink error 407`.

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

## Tests and coverage

```bash
npm test               # backend (node:test) and frontend (Vitest) suites, both with coverage
npm run coverage:report  # one Markdown table from both lcov reports
```

The backend uses Node's built-in test runner against the real `ewelink-api` module with its network layer stubbed, so the eWeLink v2 response shapes (the `thingList` wrapper, the wrong-region answer, token rejection) are exercised exactly as the cloud sends them. The frontend uses Vitest with jsdom and React Testing Library. Coverage lands in `backend/coverage/lcov.info` and `frontend/coverage/lcov.info`.

## CI and releases

- **Build** (`.github/workflows/build.yml`) runs on every pull request: install, frontend build, both test suites, and a coverage table posted to the job summary and as a comment on the pull request.
- **Release** (`.github/workflows/release.yml`) runs on every push to `main`: the same build and tests, then [GitVersion](https://gitversion.net/) computes the next version from the tags on `main` (`GitVersion.yml`), the commit is tagged `vX.Y.Z`, and a GitHub release is created with generated notes and the frontend build attached as a zip.

## API documentation

With the backend running, open [Scalar API Reference](http://localhost:3000/api-docs). The raw OpenAPI document is available at `http://localhost:3000/openapi.json`.

## REST API

- `GET /api/health` – verifies eWeLink connectivity without revealing secrets
- `GET /api/oauth/login` – starts eWeLink authorization (OAuth mode)
- `GET /api/oauth/callback` – receives the authorization code from eWeLink and stores the tokens
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
