import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { config } from "./config.js";

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix seconds
}

export function loadTokens(): TokenSet | null {
  if (!existsSync(config.tokenFile)) return null;
  return JSON.parse(readFileSync(config.tokenFile, "utf8")) as TokenSet;
}

export function saveTokens(tokens: TokenSet): void {
  writeFileSync(config.tokenFile, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
}
