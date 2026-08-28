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
import { fetchActivities, fetchActivityStreams, toRoute, toSummaryRow } from "../strava.js";

const provider = new StravaHostedOAuthProvider();
const mcpResourceUrl = new URL(`${hostedConfig.publicUrl}/mcp`);

const app = express();
app.set("trust proxy", 1);

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
  res.type("text/plain").send(
    "ValuarAICoach hosted API.\nMCP endpoint: /mcp\nOpenAPI schema: /openapi.json\n",
  );
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
