import path from "node:path";
import { JsonStore } from "./jsonStore.js";
import { hostedConfig } from "./config.js";

export interface PendingAuthorization {
  mcpClientId: string;
  originalRedirectUri: string;
  originalState?: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
  createdAt: number;
}

export interface AuthCodeRecord {
  mcpClientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
  stravaAccessToken: string;
  stravaRefreshToken: string;
  stravaExpiresAt: number;
  createdAt: number;
}

export interface SessionRecord {
  clientId: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  scopes: string[];
  resource?: string;
  stravaAccessToken: string;
  stravaRefreshToken: string;
  stravaExpiresAt: number;
}

export const PENDING_TTL_MS = 10 * 60 * 1000;
export const CODE_TTL_MS = 10 * 60 * 1000;

export const pendingStore = new JsonStore<PendingAuthorization>(
  path.join(hostedConfig.dataDir, "pending-authorizations.json"),
);

export const codeStore = new JsonStore<AuthCodeRecord>(
  path.join(hostedConfig.dataDir, "auth-codes.json"),
);

export const sessionStore = new JsonStore<SessionRecord>(
  path.join(hostedConfig.dataDir, "sessions.json"),
);

export function findSessionByRefreshToken(
  refreshToken: string,
): [string, SessionRecord] | undefined {
  return sessionStore.findEntry((session) => session.refreshToken === refreshToken);
}
