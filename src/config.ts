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

const redirectUri = process.env.STRAVA_REDIRECT_URI ?? "http://localhost:8080/auth/callback";

export const config = {
  clientId: requireEnv("STRAVA_CLIENT_ID"),
  clientSecret: requireEnv("STRAVA_CLIENT_SECRET"),
  redirectUri,
  port: Number(new URL(redirectUri).port) || 8080,
  tokenFile: path.resolve(process.cwd(), ".strava-tokens.json"),
  scopes: "read,activity:read_all",
};
