import crypto from "node:crypto";
import type { Response } from "express";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { clientsStore } from "./clients.js";
import {
  CODE_TTL_MS,
  codeStore,
  findSessionByRefreshToken,
  pendingStore,
  sessionStore,
  type SessionRecord,
} from "./records.js";
import { buildStravaAuthorizeUrl, exchangeStravaCode, refreshStravaToken } from "./stravaAuth.js";

const ACCESS_TOKEN_TTL_SECONDS = 6 * 60 * 60;

function issueToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * OAuth authorization server that fronts Strava. Strava has no dynamic client
 * registration and no PKCE support, so this provider terminates PKCE and
 * client registration itself, and only uses Strava as the upstream identity
 * step (see /oauth/strava/callback in server.ts for the other half of the
 * authorize() redirect below).
 */
export class StravaHostedOAuthProvider implements OAuthServerProvider {
  skipLocalPkceValidation = false;

  get clientsStore() {
    return clientsStore;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const state = crypto.randomUUID();
    pendingStore.set(state, {
      mcpClientId: client.client_id,
      originalRedirectUri: params.redirectUri,
      originalState: params.state,
      codeChallenge: params.codeChallenge,
      scopes: params.scopes ?? [],
      resource: params.resource?.href,
      createdAt: Date.now(),
    });
    res.redirect(buildStravaAuthorizeUrl(state));
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const record = codeStore.get(authorizationCode);
    if (!record) {
      throw new InvalidGrantError("Unknown or expired authorization code");
    }
    return record.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<OAuthTokens> {
    const record = codeStore.get(authorizationCode);
    if (!record || Date.now() - record.createdAt > CODE_TTL_MS) {
      if (record) codeStore.delete(authorizationCode);
      throw new InvalidGrantError("Unknown or expired authorization code");
    }
    if (record.mcpClientId !== client.client_id) {
      throw new InvalidGrantError("Authorization code was not issued to this client");
    }

    codeStore.delete(authorizationCode);

    const refreshToken = issueToken();
    const accessTokenExpiresAt = nowSeconds() + ACCESS_TOKEN_TTL_SECONDS;
    const accessToken = issueToken();

    const session: SessionRecord = {
      clientId: client.client_id,
      refreshToken,
      accessTokenExpiresAt,
      scopes: record.scopes,
      resource: record.resource,
      stravaAccessToken: record.stravaAccessToken,
      stravaRefreshToken: record.stravaRefreshToken,
      stravaExpiresAt: record.stravaExpiresAt,
    };
    sessionStore.set(accessToken, session);

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: record.scopes.join(" "),
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
  ): Promise<OAuthTokens> {
    const entry = findSessionByRefreshToken(refreshToken);
    if (!entry) {
      throw new InvalidGrantError("Unknown or expired refresh token");
    }
    const [oldAccessToken, session] = entry;
    if (session.clientId !== client.client_id) {
      throw new InvalidGrantError("Refresh token was not issued to this client");
    }

    let { stravaAccessToken, stravaRefreshToken, stravaExpiresAt } = session;
    if (stravaExpiresAt - nowSeconds() < 60) {
      const refreshed = await refreshStravaToken(stravaRefreshToken);
      stravaAccessToken = refreshed.access_token;
      stravaRefreshToken = refreshed.refresh_token;
      stravaExpiresAt = refreshed.expires_at;
    }

    sessionStore.delete(oldAccessToken);

    const newAccessToken = issueToken();
    const newRefreshToken = issueToken();
    const accessTokenExpiresAt = nowSeconds() + ACCESS_TOKEN_TTL_SECONDS;

    sessionStore.set(newAccessToken, {
      clientId: session.clientId,
      refreshToken: newRefreshToken,
      accessTokenExpiresAt,
      scopes: session.scopes,
      resource: session.resource,
      stravaAccessToken,
      stravaRefreshToken,
      stravaExpiresAt,
    });

    return {
      access_token: newAccessToken,
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: newRefreshToken,
      scope: session.scopes.join(" "),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const session = sessionStore.get(token);
    if (!session || session.accessTokenExpiresAt < nowSeconds()) {
      throw new InvalidTokenError("Access token is invalid or expired");
    }
    return {
      token,
      clientId: session.clientId,
      scopes: session.scopes,
      expiresAt: session.accessTokenExpiresAt,
    };
  }
}

/**
 * Resolves a valid Strava access token for an already-authenticated request,
 * refreshing the underlying Strava token transparently if it's close to expiry.
 */
export async function getStravaAccessTokenForBearer(bearerToken: string): Promise<string> {
  const session = sessionStore.get(bearerToken);
  if (!session) {
    throw new Error("No Strava session for this access token");
  }

  if (session.stravaExpiresAt - nowSeconds() < 60) {
    const refreshed = await refreshStravaToken(session.stravaRefreshToken);
    sessionStore.set(bearerToken, {
      ...session,
      stravaAccessToken: refreshed.access_token,
      stravaRefreshToken: refreshed.refresh_token,
      stravaExpiresAt: refreshed.expires_at,
    });
    return refreshed.access_token;
  }

  return session.stravaAccessToken;
}
