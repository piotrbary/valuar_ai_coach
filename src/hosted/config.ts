import "dotenv/config";
import path from "node:path";

function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

export const hostedConfig = {
  stravaClientId: need("STRAVA_CLIENT_ID"),
  stravaClientSecret: need("STRAVA_CLIENT_SECRET"),
  // Public HTTPS base URL this server is reachable at, e.g. https://valuar-ai-coach.example.repl.co
  publicUrl: need("PUBLIC_URL").replace(/\/+$/, ""),
  port: Number(process.env.PORT) || 3000,
  dataDir: path.resolve(process.cwd(), "data"),
  scopes: ["read", "activity:read_all"],
  // Optional: lets a pre-configured ChatGPT Custom GPT Action authenticate without
  // dynamic client registration (which ChatGPT's Action auth UI does not support).
  chatgptClientSecret: process.env.CHATGPT_CLIENT_SECRET,
  chatgptRedirectUris: (process.env.CHATGPT_REDIRECT_URIS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  supportUrl:
    process.env.SUPPORT_URL ?? "https://github.com/piotrbary/valuar_ai_coach/issues",
  openaiAppsChallenge: process.env.OPENAI_APPS_CHALLENGE?.trim(),
};

export const stravaOAuthCallbackUrl = `${hostedConfig.publicUrl}/oauth/strava/callback`;
