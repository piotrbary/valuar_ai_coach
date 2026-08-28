import { hostedConfig, stravaOAuthCallbackUrl } from "./config.js";

const AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const TOKEN_URL = "https://www.strava.com/oauth/token";

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export function buildStravaAuthorizeUrl(state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", hostedConfig.stravaClientId);
  url.searchParams.set("redirect_uri", stravaOAuthCallbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", hostedConfig.scopes.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeStravaCode(code: string): Promise<StravaTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: hostedConfig.stravaClientId,
      client_secret: hostedConfig.stravaClientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Strava code exchange failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as StravaTokenResponse;
}

export async function refreshStravaToken(refreshToken: string): Promise<StravaTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: hostedConfig.stravaClientId,
      client_secret: hostedConfig.stravaClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Strava token refresh failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as StravaTokenResponse;
}
