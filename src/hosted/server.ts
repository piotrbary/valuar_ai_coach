import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { hostedConfig } from "./config.js";
import { StravaHostedOAuthProvider, getStravaAccessTokenForBearer } from "./provider.js";
import { CODE_TTL_MS, codeStore, pendingStore } from "./records.js";
import { exchangeStravaCode } from "./stravaAuth.js";
import { buildOpenApiSpec } from "./openapi.js";
import { fetchActivities, fetchActivitiesInRange, fetchActivity, fetchActivityStreams, fetchAthlete, fetchAthleteStats, summarizeActivities, toRoute, toSummaryRow } from "../strava.js";

const provider = new StravaHostedOAuthProvider();
const mcpResourceUrl = new URL(`${hostedConfig.publicUrl}/mcp`);

const app = express();
app.set("trust proxy", 1);

const READ_ONLY_TOOL = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function legalPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | ValuarAICoach</title><style>
body{font:16px/1.6 system-ui,sans-serif;max-width:780px;margin:40px auto;padding:0 20px;color:#18202a}
a{color:#c63d00}h1,h2{line-height:1.2}nav{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:32px}
.notice{padding:14px 18px;background:#f4f6f8;border-radius:10px}footer{margin-top:40px;color:#59636e}
</style></head><body><nav><a href="/">Home</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a></nav>${body}<footer>ValuarAICoach · Effective 31 August 2026</footer></body></html>`;
}

app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: new URL(hostedConfig.publicUrl),
    resourceServerUrl: mcpResourceUrl,
    scopesSupported: hostedConfig.scopes,
    resourceName: "ValuarAICoach Strava",
  }),
);

app.get("/", (_req, res) => {
  res.type("html").send(
    legalPage(
      "Strava training data for AI coaching",
      `<h1>ValuarAICoach</h1><p>Connect your Strava account to ChatGPT and analyze your runs, rides, swims, routes, heart rate, cadence, power and elevation data.</p><p class="notice">ValuarAICoach provides read-only access. It cannot create, edit or delete Strava activities.</p><h2>Service endpoints</h2><ul><li><code>/mcp</code> — MCP server</li><li><code>/openapi.json</code> — OpenAPI schema</li><li><code>/health</code> — health check</li></ul>`,
    ),
  );
});

app.get("/privacy", (_req, res) => {
  res.type("html").send(
    legalPage(
      "Privacy policy",
      `<h1>Privacy policy</h1><h2>Data we process</h2><p>When you connect Strava, ValuarAICoach receives OAuth tokens and the Strava data requested through its read-only tools. This may include activity names, dates, locations and GPS routes, heart rate, cadence, power, speed and elevation.</p><h2>Purpose and storage</h2><p>OAuth and session credentials are stored on the hosted service so that authenticated requests can be completed and tokens can be refreshed. Training activity data is fetched from Strava when requested and is not intentionally retained by ValuarAICoach after the response is produced.</p><h2>Sharing</h2><p>Data is sent to Strava to fulfill API requests and to the AI client you chose to connect. Hosting infrastructure may process service traffic. ValuarAICoach does not sell personal data.</p><h2>Retention and deletion</h2><p>Session credentials are retained while the connection remains active. You can revoke ValuarAICoach in Strava's application settings. For deletion or privacy requests, use the support channel below.</p><h2>Contact</h2><p><a href="${hostedConfig.supportUrl}">Contact ValuarAICoach support</a>.</p>`,
    ),
  );
});

app.get("/terms", (_req, res) => {
  res.type("html").send(
    legalPage(
      "Terms of service",
      `<h1>Terms of service</h1><p>ValuarAICoach provides read-only access to training information from a Strava account that you authorize. You must have the right to access the connected account and must use the service lawfully.</p><h2>Coaching information</h2><p>Analyses and suggestions are informational. They are not medical advice, diagnosis, emergency support or a substitute for a qualified coach or healthcare professional.</p><h2>Availability</h2><p>The service depends on Strava, hosting providers and connected AI clients. Availability and completeness are not guaranteed. Do not rely on the service as the only copy of training data.</p><h2>Acceptable use</h2><p>Do not attempt to bypass authorization, access another person's data, interfere with the service or use it in violation of Strava's terms.</p><h2>Support</h2><p><a href="${hostedConfig.supportUrl}">Contact ValuarAICoach support</a>.</p>`,
    ),
  );
});

app.get("/support", (_req, res) => {
  res.type("html").send(
    legalPage(
      "Support",
      `<h1>Support</h1><p>Report connection problems, request deletion or ask a privacy question through the public project support channel.</p><p><a href="${hostedConfig.supportUrl}">Open ValuarAICoach support</a></p><p>Do not include access tokens, refresh tokens, passwords or private activity data in a public issue.</p>`,
    ),
  );
});

app.get("/.well-known/openai-apps-challenge", (_req, res) => {
  if (!hostedConfig.openaiAppsChallenge) {
    res.status(404).type("text").send("Not configured");
    return;
  }
  res.type("text").send(hostedConfig.openaiAppsChallenge);
});

// Strava redirects here after the user approves access. This completes the
// inner (Strava) OAuth leg and mints our own authorization code for the
// outer (MCP client / ChatGPT) OAuth leg that started in provider.authorize().
app.get("/oauth/strava/callback", async (req, res) => {
  const { state, code, error } = req.query;

  if (typeof state !== "string") {
    res.status(400).send("Missing state parameter.");
    return;
  }

  const pending = pendingStore.get(state);
  pendingStore.delete(state);

  if (!pending || Date.now() - pending.createdAt > CODE_TTL_MS) {
    res.status(400).send("This authorization request has expired. Please try connecting again.");
    return;
  }

  if (error || typeof code !== "string") {
    const redirect = new URL(pending.originalRedirectUri);
    redirect.searchParams.set("error", typeof error === "string" ? error : "access_denied");
    if (pending.originalState) redirect.searchParams.set("state", pending.originalState);
    res.redirect(redirect.toString());
    return;
  }

  try {
    const stravaTokens = await exchangeStravaCode(code);
    const authCode = crypto.randomUUID();
    codeStore.set(authCode, {
      mcpClientId: pending.mcpClientId,
      redirectUri: pending.originalRedirectUri,
      codeChallenge: pending.codeChallenge,
      scopes: pending.scopes,
      resource: pending.resource,
      stravaAccessToken: stravaTokens.access_token,
      stravaRefreshToken: stravaTokens.refresh_token,
      stravaExpiresAt: stravaTokens.expires_at,
      createdAt: Date.now(),
    });

    const redirect = new URL(pending.originalRedirectUri);
    redirect.searchParams.set("code", authCode);
    if (pending.originalState) redirect.searchParams.set("state", pending.originalState);
    res.redirect(redirect.toString());
  } catch (err) {
    res.status(502).send(`Failed to connect to Strava: ${String(err)}`);
  }
});

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "valuar-strava", version: "1.0.0" });

  server.registerTool(
    "strava_list_activities",
    {
      title: "List Strava activities",
      description:
        "Fetch recent Strava training activities (runs, rides, swims, etc.) with exact local start/end timestamps, type, distance, moving and elapsed time, pace, average/max heart rate, average cadence, average/weighted-average/max power in watts (when recorded by a power meter or estimated), energy in kJ, and elevation gain/high/low.",
      inputSchema: {
        page: z.number().int().min(1).optional().describe("Page number, defaults to 1"),
        perPage: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Activities per page, defaults to 30, max 100"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ page, perPage }, extra) => {
      const bearerToken = extra.authInfo?.token;
      if (!bearerToken) {
        return { isError: true, content: [{ type: "text", text: "Missing authentication." }] };
      }
      const stravaToken = await getStravaAccessTokenForBearer(bearerToken);
      const activities = await fetchActivities(stravaToken, { page, perPage });
      return { content: [{ type: "text", text: JSON.stringify(activities.map(toSummaryRow), null, 2) }] };
    },
  );


  server.registerTool(
    "strava_get_athlete_profile",
    {
      title: "Get Strava athlete profile",
      description:
        "Fetch the connected athlete's Strava profile and account-level training statistics. Use this when the user asks about their profile, long-term totals, year-to-date totals, biggest ride, or biggest climb.",
      inputSchema: {},
      annotations: READ_ONLY_TOOL,
    },
    async (_args, extra) => {
      const bearerToken = extra.authInfo?.token;
      if (!bearerToken) {
        return { isError: true, content: [{ type: "text", text: "Missing authentication." }] };
      }
      const stravaToken = await getStravaAccessTokenForBearer(bearerToken);
      const athlete = await fetchAthlete(stravaToken);
      const stats = await fetchAthleteStats(stravaToken, athlete.id);
      return {
        content: [{ type: "text", text: JSON.stringify({ athlete, stats }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "strava_get_activity_detail",
    {
      title: "Get full Strava activity detail",
      description:
        "Fetch full Strava details for one activity, including laps, splits, segments, device information and any extra fields returned by Strava. Get the activity ID from strava_list_activities first.",
      inputSchema: {
        activityId: z.number().int().describe("The Strava activity ID, from strava_list_activities"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ activityId }, extra) => {
      const bearerToken = extra.authInfo?.token;
      if (!bearerToken) {
        return { isError: true, content: [{ type: "text", text: "Missing authentication." }] };
      }
      const stravaToken = await getStravaAccessTokenForBearer(bearerToken);
      const activity = await fetchActivity(stravaToken, activityId);
      return { content: [{ type: "text", text: JSON.stringify(activity, null, 2) }] };
    },
  );

  server.registerTool(
    "strava_summarize_period",
    {
      title: "Summarize Strava training over a date range",
      description:
        "Fetch and aggregate all available Strava activities in a date range. Use this for questions about this week, this month, this year, recent training volume, sport mix, distance, moving time, elevation, average heart rate or average power. Dates are inclusive calendar dates in YYYY-MM-DD format.",
      inputSchema: {
        startDate: z.string().describe("Inclusive start date in YYYY-MM-DD format"),
        endDate: z.string().describe("Inclusive end date in YYYY-MM-DD format"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ startDate, endDate }, extra) => {
      const bearerToken = extra.authInfo?.token;
      if (!bearerToken) {
        return { isError: true, content: [{ type: "text", text: "Missing authentication." }] };
      }

      const start = new Date(`${startDate}T00:00:00Z`);
      const end = new Date(`${endDate}T23:59:59Z`);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        return { isError: true, content: [{ type: "text", text: "Invalid date range." }] };
      }

      const stravaToken = await getStravaAccessTokenForBearer(bearerToken);
      const activities = await fetchActivitiesInRange(stravaToken, {
        after: Math.floor(start.getTime() / 1000),
        before: Math.floor(end.getTime() / 1000),
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            {
              startDate,
              endDate,
              summary: summarizeActivities(activities),
              activities: activities.map(toSummaryRow),
            },
            null,
            2,
          ),
        }],
      };
    },
  );

  server.registerTool(
    "strava_get_activity_route",
    {
      title: "Get a Strava activity's GPS route",
      description:
        "Fetch the GPS route (as decoded [lat, lng] points) for a recent Strava activity, along with its name, date, type, and distance. Use position 1 (the default) for the most recent activity, 2 for the one before that, etc.",
      inputSchema: {
        position: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("1 = most recent activity, 2 = second most recent, etc. Defaults to 1."),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ position }, extra) => {
      const bearerToken = extra.authInfo?.token;
      if (!bearerToken) {
        return { isError: true, content: [{ type: "text", text: "Missing authentication." }] };
      }
      const stravaToken = await getStravaAccessTokenForBearer(bearerToken);
      const [activity] = await fetchActivities(stravaToken, { page: 1, perPage: position ?? 1 }).then(
        (activities) => activities.slice((position ?? 1) - 1),
      );
      if (!activity) {
        return { isError: true, content: [{ type: "text", text: "No activity found at that position." }] };
      }
      const route = toRoute(activity);
      if (route.points.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ ...route, note: "This activity has no GPS route." }, null, 2),
            },
          ],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(route, null, 2) }] };
    },
  );

  server.registerTool(
    "strava_get_activity_streams",
    {
      title: "Get a Strava activity's detailed data streams",
      description:
        "Fetch time-aligned detail streams for a specific Strava activity: GPS points, heart rate, cadence, power (watts), altitude, gradient, temperature, distance, elapsed time, speed, and whether moving at each point (whichever the activity recorded). Get the activity's numeric ID first from strava_list_activities. Use this for plotting heart rate/power/cadence/elevation over the route or over time.",
      inputSchema: {
        activityId: z.number().int().describe("The Strava activity ID, from strava_list_activities"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ activityId }, extra) => {
      const bearerToken = extra.authInfo?.token;
      if (!bearerToken) {
        return { isError: true, content: [{ type: "text", text: "Missing authentication." }] };
      }
      const stravaToken = await getStravaAccessTokenForBearer(bearerToken);
      const streams = await fetchActivityStreams(stravaToken, activityId);
      return { content: [{ type: "text", text: JSON.stringify(streams) }] };
    },
  );

  return server;
}

const mcpResourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(mcpResourceUrl);

app.post(
  "/mcp",
  express.json(),
  requireBearerAuth({ verifier: provider, resourceMetadataUrl: mcpResourceMetadataUrl }),
  async (req, res) => {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  },
);

app.get("/activities", requireBearerAuth({ verifier: provider }), async (req, res) => {
  const bearerToken = req.auth!.token;
  const page = Number(req.query.page) || 1;
  const perPage = Number(req.query.perPage) || 30;

  try {
    const stravaToken = await getStravaAccessTokenForBearer(bearerToken);
    const activities = await fetchActivities(stravaToken, { page, perPage });
    res.json({ activities: activities.map(toSummaryRow) });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

app.get("/openapi.json", (_req, res) => {
  res.json(buildOpenApiSpec());
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(hostedConfig.port, () => {
  console.log(`ValuarAICoach hosted server listening on port ${hostedConfig.port}`);
  console.log(`Public URL: ${hostedConfig.publicUrl}`);
});
