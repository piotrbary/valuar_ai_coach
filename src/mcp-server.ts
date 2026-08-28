import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runAuthorizationFlow, getValidAccessToken } from "./auth.js";
import { fetchActivities, fetchActivityStreams, toRoute, toSummaryRow } from "./strava.js";
import { loadTokens } from "./tokenStore.js";

const server = new McpServer({ name: "valuar-strava", version: "0.1.0" });

server.registerTool(
  "strava_connect",
  {
    title: "Connect Strava",
    description:
      "Authorize this tool with your Strava account. Opens a browser window for you to log in and approve access. Run this once before using strava_list_activities.",
  },
  async () => {
    if (loadTokens()) {
      return { content: [{ type: "text", text: "Already connected to Strava." }] };
    }
    await runAuthorizationFlow();
    return { content: [{ type: "text", text: "Connected to Strava successfully." }] };
  },
);

server.registerTool(
  "strava_list_activities",
  {
    title: "List Strava activities",
    description:
      "Fetch recent Strava training activities (runs, rides, swims, etc.) with exact local start/end timestamps, type, distance, moving and elapsed time, pace, average/max heart rate, average cadence, average/weighted-average/max power in watts (when recorded by a power meter or estimated), energy in kJ, and elevation gain/high/low. Requires strava_connect to have been run first.",
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
  async ({ page, perPage }) => {
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken();
    } catch {
      return {
        isError: true,
        content: [{ type: "text", text: "Not connected to Strava yet. Run strava_connect first." }],
      };
    }

    const activities = await fetchActivities(accessToken, { page, perPage });
    const rows = activities.map(toSummaryRow);
    return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
  },
);

server.registerTool(
  "strava_get_activity_route",
  {
    title: "Get a Strava activity's GPS route",
    description:
      "Fetch the GPS route (as decoded [lat, lng] points) for a recent Strava activity, along with its name, date, type, and distance. Use position 1 (the default) for the most recent activity, 2 for the one before that, etc. Requires strava_connect to have been run first.",
    inputSchema: {
      position: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("1 = most recent activity, 2 = second most recent, etc. Defaults to 1."),
    },
  },
  async ({ position }) => {
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken();
    } catch {
      return {
        isError: true,
        content: [{ type: "text", text: "Not connected to Strava yet. Run strava_connect first." }],
      };
    }

    const activities = await fetchActivities(accessToken, { page: 1, perPage: position ?? 1 });
    const activity = activities[(position ?? 1) - 1];
    if (!activity) {
      return { isError: true, content: [{ type: "text", text: "No activity found at that position." }] };
    }
    const route = toRoute(activity);
    if (route.points.length === 0) {
      return {
        content: [
          { type: "text", text: JSON.stringify({ ...route, note: "This activity has no GPS route." }, null, 2) },
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
      "Fetch time-aligned detail streams for a specific Strava activity: GPS points, heart rate, cadence, power (watts), altitude, gradient, temperature, distance, elapsed time, speed, and whether moving at each point (whichever the activity recorded). Get the activity's numeric ID first from strava_list_activities. Use this for plotting heart rate/power/cadence/elevation over the route or over time. Requires strava_connect to have been run first.",
    inputSchema: {
      activityId: z.number().int().describe("The Strava activity ID, from strava_list_activities"),
    },
  },
  async ({ activityId }) => {
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken();
    } catch {
      return {
        isError: true,
        content: [{ type: "text", text: "Not connected to Strava yet. Run strava_connect first." }],
      };
    }
    const streams = await fetchActivityStreams(accessToken, activityId);
    return { content: [{ type: "text", text: JSON.stringify(streams) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
