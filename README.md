# ValuarAICoach

Reads your Strava training data, as a foundation for an AI coaching app.

## Setup

1. Create a Strava API app at https://www.strava.com/settings/api.
   - Set **Authorization Callback Domain** to `localhost`.
2. Copy `.env.example` to `.env` and fill in your Client ID and Client Secret:
   ```
   cp .env.example .env
   ```
3. Install dependencies:
   ```
   npm install
   ```
## CLI usage

1. Connect your Strava account (opens a browser to authorize, then saves tokens locally to `.strava-tokens.json`, which is gitignored):
   ```
   npm run auth
   ```
2. Fetch your recent activities:
   ```
   npm run activities
   ```
   Options: `--page <n>` and `--per-page <n>` (default 30).

Access tokens are refreshed automatically using the stored refresh token.

## Web app (PWA)

A small Express server serves an installable PWA that shows your training data in the browser.

```
npm run web
```

Then open http://localhost:8080 (or whatever port your `STRAVA_REDIRECT_URI` uses) and click **Connect to Strava**. The server handles the OAuth callback itself, so no separate `npm run auth` step is needed for the web flow.

- Installable: on desktop Chrome/Edge, click the install icon in the address bar; on mobile, use "Add to Home Screen".
- Offline shell: the static app shell (HTML/CSS/JS/icons) is cached by a service worker; activity data itself always comes fresh from `/api/activities` and requires a network connection.
- Icons live in `public/icons/`, generated with `npm run generate-icons` (edit `scripts/generate-icons.mjs` to change the design).
