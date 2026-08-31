import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const pluginRoot = path.join(root, "plugins", "valuar-ai-coach");
const manifest = JSON.parse(
  await readFile(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
);
const appMap = JSON.parse(await readFile(path.join(pluginRoot, ".app.json"), "utf8"));
const serverSource = await readFile(path.join(root, "src", "hosted", "server.ts"), "utf8");

const requiredUrls = [
  "websiteURL",
  "privacyPolicyURL",
  "termsOfServiceURL",
];

if (manifest.name !== "valuar-ai-coach") throw new Error("Unexpected plugin name");
if (manifest.apps !== "./.app.json") throw new Error("Plugin must reference ./.app.json");
if (!appMap.apps?.["valuar-ai-coach"]?.id?.startsWith("asdk_app_")) {
  throw new Error("Missing registered MCP app mapping");
}
for (const field of requiredUrls) {
  const value = manifest.interface?.[field];
  if (typeof value !== "string" || !value.startsWith("https://")) {
    throw new Error(`Missing public HTTPS ${field}`);
  }
}
for (const annotation of [
  "readOnlyHint: true",
  "destructiveHint: false",
  "idempotentHint: true",
  "openWorldHint: true",
]) {
  if (!serverSource.includes(annotation)) throw new Error(`Missing ${annotation}`);
}
for (const route of ["/privacy", "/terms", "/support", "/.well-known/openai-apps-challenge"]) {
  if (!serverSource.includes(`app.get(\"${route}\"`)) throw new Error(`Missing ${route} route`);
}

console.log("ValuarAICoach plugin package is structurally valid.");
