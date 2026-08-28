import { runAuthorizationFlow, getValidAccessToken } from "./auth.js";
import { fetchActivities, toSummaryRow } from "./strava.js";

function parseIntArg(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return Number(process.argv[index + 1]) || fallback;
}

async function main() {
  const command = process.argv[2];

  if (command === "auth") {
    await runAuthorizationFlow();
    return;
  }

  if (command === "activities") {
    const page = parseIntArg("--page", 1);
    const perPage = parseIntArg("--per-page", 30);

    const accessToken = await getValidAccessToken();
    const activities = await fetchActivities(accessToken, { page, perPage });

    if (activities.length === 0) {
      console.log("No activities found.");
      return;
    }

    console.table(activities.map(toSummaryRow));
    return;
  }

  console.log("Usage:");
  console.log("  npm run auth        Connect your Strava account");
  console.log("  npm run activities  Fetch and print recent training activities");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
