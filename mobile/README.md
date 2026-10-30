# GARP Tracker — Mobile (Expo / React Native / TypeScript)

Android-first mobile client for the existing GARP Tracker backend.
The backend is the source of truth: this app only calls the existing REST API.

## Run

```bash
# 1. start the GARP backend from the repo root
cd ..
DATA_DIR=./data node server.js          # listens on :3000

# 2. start the mobile app
cd mobile
npm install
npm run android        # Android emulator
npm start              # Expo dev server (scan with Expo Go)
```

## API base URL

Resolved in `src/config/env.ts`, first match wins:

1. `EXPO_PUBLIC_API_BASE_URL` env var
2. `expo.extra.apiBaseUrl` in `app.json` (default `http://10.0.2.2:3000`)
3. platform default

| Target | URL |
|---|---|
| Android emulator | `http://10.0.2.2:3000` (10.0.2.2 = host machine) |
| iOS simulator | `http://localhost:3000` |
| Physical device | `http://<your-LAN-IP>:3000` — same Wi-Fi |

Local only. Never point this at Railway/production, and never put backend secrets
(`JWT_SECRET`, `SMTP_PASS`, `WA_TOKEN`, DB credentials) in this app — the bundle ships to devices.

## Architecture

```
Mobile UI → src/api/client.ts → existing GARP REST API → server.js → local data/db.json
```

- **JWT** stored in the OS keystore via `expo-secure-store` (never AsyncStorage).
- **401 handling** is centralised: `SESSION_IDLE`, `SESSION_SUPERSEDED` and bad-credential
  responses clear the session and return the user to Login with an explanation.
- **Roles** in `src/auth/permissions.ts` decide what to *show*; the server still decides what is allowed.

## Backend behaviour that shapes this app

- **5-minute idle timeout** — backgrounding the app for longer signs you out.
- **Single session per account** — signing in here evicts the same account on the web.
- **No CORS middleware** on the server; fine for native, so avoid `npm run web`.
