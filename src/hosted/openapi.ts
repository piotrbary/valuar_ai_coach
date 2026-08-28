import { hostedConfig } from "./config.js";

export function buildOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "ValuarAICoach Strava API",
      version: "1.0.0",
      description: "Read-only access to your Strava training activities.",
    },
    servers: [{ url: hostedConfig.publicUrl }],
    paths: {
      "/activities": {
        get: {
          operationId: "getActivities",
          summary: "List recent Strava training activities",
          parameters: [
            {
              name: "page",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "perPage",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            "200": {
              description: "Recent activities",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      activities: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            Date: { type: "string" },
                            Name: { type: "string" },
                            Type: { type: "string" },
                            "Distance (km)": { type: "string" },
                            Time: { type: "string" },
                            Pace: { type: "string" },
                            "Avg HR": {},
                            "Elev Gain (m)": {},
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          security: [{ stravaOAuth: ["read", "activity:read_all"] }],
        },
      },
    },
    components: {
      securitySchemes: {
        stravaOAuth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${hostedConfig.publicUrl}/authorize`,
              tokenUrl: `${hostedConfig.publicUrl}/token`,
              scopes: {
                read: "Read public Strava data",
                "activity:read_all": "Read all activities including private ones",
              },
            },
          },
        },
      },
    },
  };
}
