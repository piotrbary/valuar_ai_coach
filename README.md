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

## Connect to Claude via MCP (simplest way to let Claude read your data)

This repo includes an MCP server (`src/mcp-server.ts`) that exposes two tools to Claude:

- `strava_connect` — one-time authorization (opens your browser, saves tokens locally)
- `strava_list_activities` — fetches recent activities, so Claude can read and discuss them directly in chat

This only works with a **Claude client running on your own machine** (Claude Desktop, or a local Claude Code session) — it opens a browser and listens on `localhost` for the OAuth redirect, which a cloud/remote session can't do.

**Claude Desktop**: add this to your `claude_desktop_config.json` (Settings → Developer → Edit Config), using the absolute path to this repo:

```json
{
  "mcpServers": {
    "valuar-strava": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/valuar_ai_coach/src/mcp-server.ts"],
      "env": {
        "STRAVA_CLIENT_ID": "your_client_id",
        "STRAVA_CLIENT_SECRET": "your_client_secret",
        "STRAVA_REDIRECT_URI": "http://localhost:8080/auth/callback"
      }
    }
  }
}
```

**Claude Code (CLI)**, from this repo's directory:

```
claude mcp add valuar-strava -- npx tsx src/mcp-server.ts
```

(then set `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI` in `.env` in this directory, since Claude Code inherits your shell's working directory and `dotenv` picks it up)

Restart the client, then just ask Claude something like "connect to Strava" or "show my recent runs" — it will call the tools itself.

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
