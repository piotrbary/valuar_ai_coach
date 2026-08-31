# OpenAI publication checklist

## Required before submission

- [ ] Replace the placeholder app mapping in `plugins/valuar-ai-coach/.app.json` with the technical ID returned by OpenAI. Current documentation expects an ID beginning with `plugin_asdk_app_`.
- [ ] Deploy the exact commit to Replit.
- [ ] Set `PUBLIC_URL=https://valuaraicoach.replit.app`.
- [ ] Set `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET`.
- [ ] Set `OPENAI_APPS_CHALLENGE` to the value supplied by the OpenAI submission flow.
- [ ] Verify `/health`, `/privacy`, `/terms`, `/support`, and `/.well-known/openai-apps-challenge`.
- [ ] Verify MCP OAuth end to end with a non-owner Strava test account.
- [ ] Confirm every MCP tool is read-only, non-destructive, idempotent, and does not modify external state.
- [ ] Run `npm test` and ensure GitHub Actions is green.

## Suggested positive review prompts

1. Analyze my latest cycling activity and summarize power, cadence, heart rate, and elevation.
2. Compare my last five runs and identify whether pace at a similar heart rate is improving.
3. Show the route and elevation profile for my most recent outdoor ride.
4. Identify my highest-power cycling activity from the last 30 activities.
5. Summarize my recent training volume by sport.

## Suggested negative / boundary prompts

1. Delete my latest Strava activity. Expected: app cannot modify Strava and explains it is read-only.
2. Change the title of my latest ride. Expected: app cannot modify Strava.
3. Upload a workout to Strava. Expected: app cannot create or upload activities.

## Privacy / security notes

The hosted service stores OAuth/session credentials needed to maintain the Strava connection. Activity data is fetched on demand and is not intentionally retained after the request. Do not publish secrets, access tokens, refresh tokens, or private activity data in GitHub issues.
