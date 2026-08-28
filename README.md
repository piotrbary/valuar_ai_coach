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
4. Connect your Strava account (opens a browser to authorize, then saves tokens locally to `.strava-tokens.json`, which is gitignored):
   ```
   npm run auth
   ```
5. Fetch your recent activities:
   ```
   npm run activities
   ```
   Options: `--page <n>` and `--per-page <n>` (default 30).

Access tokens are refreshed automatically using the stored refresh token.
