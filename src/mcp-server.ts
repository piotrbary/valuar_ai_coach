import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runAuthorizationFlow, getValidAccessToken } from "./auth.js";
import { fetchActivities, toSummaryRow } from "./strava.js";
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
      "Fetch recent Strava training activities (runs, rides, swims, etc.) with date, type, distance, moving time, pace, average heart rate, and elevation gain. Requires strava_connect to have been run first.",
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

const transport = new StdioServerTransport();
await server.connect(transport);
