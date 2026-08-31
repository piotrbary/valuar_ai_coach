# Replit setup

## Run configuration

The configured `Start application` workflow runs:

```bash
npm run hosted
```

The hosted API listens on port `5000` in the Replit preview. Its main routes are:

- `/health` — service health check
- `/mcp` — Streamable HTTP MCP endpoint
- `/activities` — authenticated Strava activity API
- `/openapi.json` — ChatGPT Custom GPT Action schema

## Required Secrets

Set these in the Replit Secrets panel:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`

`PUBLIC_URL` is configured as a shared environment variable for the current Replit development URL. Before deploying, update it to the final HTTPS deployment URL and set the Strava API app's callback domain to that deployment domain.

The optional ChatGPT Action setup additionally uses `CHATGPT_CLIENT_SECRET` and `CHATGPT_REDIRECT_URIS`; see `README.md` for the one-time configuration steps.

For public ChatGPT plugin submission, also set the temporary verification value shown by the OpenAI submission portal:

- `OPENAI_APPS_CHALLENGE` — served verbatim at `/.well-known/openai-apps-challenge`
- `SUPPORT_URL` — optional support destination; defaults to the repository's Issues page

## Checks

```bash
npm run typecheck
npm run build
```
