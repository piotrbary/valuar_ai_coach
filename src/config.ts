import "dotenv/config";
import path from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export const config = {
  clientId: requireEnv("STRAVA_CLIENT_ID"),
  clientSecret: requireEnv("STRAVA_CLIENT_SECRET"),
  redirectUri: process.env.STRAVA_REDIRECT_URI ?? "http://localhost:8080/callback",
  tokenFile: path.resolve(process.cwd(), ".strava-tokens.json"),
  scopes: "read,activity:read_all",
};
