# GARP Tracker

GARP Tracker is an HRMS and assignment tracking system with a web application and a separate mobile client.

## Applications

- **Web app and backend:** Node.js and Express, served from the repository root. The server uses JSON files under `data/` for local data.
- **Mobile app:** Expo, React Native, and TypeScript in [`mobile/`](mobile/). It connects to the existing backend REST API.

## Features

The applications support assignment and task tracking, attendance, client and compliance workflows, reports, approvals, and notifications. Available features depend on the signed-in user's role.

## Local setup

Requirements: Node.js 18 or newer and npm. Configure the backend environment variables in a local `.env` file; do not commit credentials.

```sh
npm install
npm start
```

In another terminal, start the mobile app:

```sh
cd mobile
npm install
npm start
```

For Android or iOS, use the corresponding Expo run command from `mobile/README.md`. Set `EXPO_PUBLIC_API_BASE_URL` when the default API address is not appropriate for your device or emulator.
