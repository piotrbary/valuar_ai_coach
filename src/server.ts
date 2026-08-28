import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./config.js";
import { buildAuthorizeUrl, exchangeCodeForTokens, getValidAccessToken } from "./auth.js";
import { saveTokens } from "./tokenStore.js";
import { fetchActivities, toSummaryRow } from "./strava.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");

const app = express();
app.use(express.static(publicDir));

app.get("/auth/login", (_req, res) => {
  res.redirect(buildAuthorizeUrl());
});

app.get("/auth/callback", async (req, res) => {
  const error = req.query.error;
  const code = req.query.code;

  if (error || typeof code !== "string") {
    res.status(400).send(`<h1>Authorization failed</h1><p>${error ?? "No code returned."}</p>`);
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    saveTokens(tokens);
    res.redirect("/");
  } catch (err) {
    res.status(500).send(`<h1>Authorization failed</h1><pre>${String(err)}</pre>`);
  }
});

app.get("/api/activities", async (req, res) => {
  const page = Number(req.query.page) || 1;
  const perPage = Number(req.query.perPage) || 30;

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch {
    res.json({ authenticated: false, activities: [] });
    return;
  }

  try {
    const activities = await fetchActivities(accessToken, { page, perPage });
    res.json({ authenticated: true, activities: activities.map(toSummaryRow) });
  } catch (err) {
    res.status(502).json({ authenticated: true, error: String(err) });
  }
});

app.listen(config.port, () => {
  console.log(`ValuarAICoach running at http://localhost:${config.port}`);
});
