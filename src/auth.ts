import http from "node:http";
import open from "open";
import { config } from "./config.js";
import { loadTokens, saveTokens, type TokenSet } from "./tokenStore.js";

const AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const TOKEN_URL = "https://www.strava.com/oauth/token";

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

function buildAuthorizeUrl(): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", config.scopes);
  return url.toString();
}

function waitForAuthorizationCode(): Promise<string> {
  const { port, pathname } = new URL(config.redirectUri);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url ?? "/", config.redirectUri);
      if (requestUrl.pathname !== pathname) {
        res.writeHead(404).end();
        return;
      }

      const error = requestUrl.searchParams.get("error");
      const code = requestUrl.searchParams.get("code");

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        error
          ? "<h1>Authorization denied.</h1>You can close this tab."
          : "<h1>Strava connected.</h1>You can close this tab and return to the terminal.",
      );

      server.close();
      if (error || !code) {
        reject(new Error(`Strava authorization failed: ${error ?? "no code returned"}`));
      } else {
        resolve(code);
      }
    });

    server.listen(Number(port) || 80);
  });
}

async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as StravaTokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  };
}

async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as StravaTokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  };
}

export async function runAuthorizationFlow(): Promise<void> {
  const authorizeUrl = buildAuthorizeUrl();
  console.log("Opening Strava authorization page in your browser...");
  console.log(authorizeUrl);
  await open(authorizeUrl);

  const code = await waitForAuthorizationCode();
  const tokens = await exchangeCodeForTokens(code);
  saveTokens(tokens);
  console.log("Strava account connected. Tokens saved to .strava-tokens.json");
}

export async function getValidAccessToken(): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error('No saved Strava tokens found. Run "npm run auth" first.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt - nowSeconds > 60) {
    return tokens.accessToken;
  }

  const refreshed = await refreshTokens(tokens.refreshToken);
  saveTokens(refreshed);
  return refreshed.accessToken;
}
