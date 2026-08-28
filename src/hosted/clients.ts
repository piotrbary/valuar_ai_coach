import crypto from "node:crypto";
import path from "node:path";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { JsonStore } from "./jsonStore.js";
import { hostedConfig } from "./config.js";

const store = new JsonStore<OAuthClientInformationFull>(
  path.join(hostedConfig.dataDir, "oauth-clients.json"),
);

// ChatGPT's Custom GPT Action editor has no dynamic client registration flow: you
// paste a fixed Client ID/Secret into its UI. So we pre-seed one static client here,
// configured via env vars, alongside normal dynamic registration for MCP clients
// (Claude) that do support it.
const CHATGPT_CLIENT_ID = "chatgpt-action";

function seedChatGptClient(): void {
  if (!hostedConfig.chatgptClientSecret) return;

  const existing = store.get(CHATGPT_CLIENT_ID);
  const redirectUris =
    hostedConfig.chatgptRedirectUris.length > 0
      ? hostedConfig.chatgptRedirectUris
      : (existing?.redirect_uris ?? []);

  store.set(CHATGPT_CLIENT_ID, {
    client_id: CHATGPT_CLIENT_ID,
    client_secret: hostedConfig.chatgptClientSecret,
    client_id_issued_at: existing?.client_id_issued_at ?? Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_post",
    client_name: "ChatGPT",
  });
}

seedChatGptClient();

export const clientsStore: OAuthRegisteredClientsStore = {
  getClient: async (clientId) => store.get(clientId),

  registerClient: async (client) => {
    const provided = client as Partial<
      Pick<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
    >;
    const clientId = provided.client_id ?? crypto.randomUUID();
    const clientIdIssuedAt = provided.client_id_issued_at ?? Math.floor(Date.now() / 1000);

    const full: OAuthClientInformationFull = {
      ...client,
      client_id: clientId,
      client_id_issued_at: clientIdIssuedAt,
    };

    store.set(clientId, full);
    return full;
  },
};
