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

## Hosted server (recommended — works with both Claude and ChatGPT)

`src/hosted/server.ts` is a standalone, multi-client server meant to be deployed once
(e.g. on Replit) and then used from **both** Claude and ChatGPT, from any device, with
no local setup on your end. It implements:

- Its own OAuth 2.1 authorization server that proxies the actual login to Strava
  (Strava supports neither dynamic client registration nor PKCE, so this server
  handles both itself and only uses Strava for the identity/login step)
- `/mcp` — a Streamable HTTP MCP endpoint for Claude (Settings → Connectors → Add
  custom connector)
- `/activities` + `/openapi.json` — a REST endpoint and OpenAPI schema for a ChatGPT
  Custom GPT Action
- Dynamic client registration, so Claude can add the connector with just a URL — no
  manual Client ID/Secret

### Deploy to Replit

1. On Replit: **Create App** → **Import from GitHub** → this repository
   (`piotrbary/valuar_ai_coach`).
2. In the Replit **Secrets** panel, set:
   - `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` — from your Strava API app
   - `PUBLIC_URL` — your Replit deployment's URL (you'll get/confirm this after the
     first deploy, e.g. `https://valuar-ai-coach.yourname.repl.co`)
3. In the Strava API app settings (https://www.strava.com/settings/api), set
   **Authorization Callback Domain** to your Replit domain (no `https://`, no path).
4. Deploy using a **Reserved VM** deployment (Deploy tab) with run command
   `npm run hosted` — a Reserved VM keeps a persistent disk, which this server needs
   to remember registered clients and Strava sessions across restarts. The included
   `.replit` file already points at this run command.
5. Once deployed and you have the final public URL, make sure `PUBLIC_URL` in
   Secrets matches it exactly, then redeploy.

### Connect Claude

Settings → Connectors → Add custom connector → paste `https://<your-app>/mcp` →
Connect. Claude registers itself automatically and walks you through the Strava
login.

### Connect ChatGPT

ChatGPT's Custom GPT Action editor doesn't support dynamic client registration, so
this needs one extra one-time step:

1. Generate a random secret: `openssl rand -hex 32`. Set it as the `CHATGPT_CLIENT_SECRET`
   Replit secret and redeploy.
2. In ChatGPT: create a Custom GPT → Configure → Actions → **Import from URL**:
   `https://<your-app>/openapi.json`.
3. In the Action's Authentication settings, choose **OAuth** and fill in:
   - Client ID: `chatgpt-action`
   - Client Secret: the value you generated in step 1
   - Authorization URL: `https://<your-app>/authorize`
   - Token URL: `https://<your-app>/token`
   - Scope: `read activity:read_all`
4. ChatGPT will now show you its callback URL. Copy it, set it as the
   `CHATGPT_REDIRECT_URIS` Replit secret (comma-separate if there's more than one),
   and redeploy.
5. Back in the GPT, click **Sign in** to complete the Strava login.

## Connect to Claude via MCP locally (alternative, single-device)

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
