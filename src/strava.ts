const ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date_local: string;
  distance: number; // meters
  moving_time: number; // seconds
  total_elevation_gain: number; // meters
  average_speed: number; // meters/second
  average_heartrate?: number;
}

export async function fetchActivities(
  accessToken: string,
  { page = 1, perPage = 30 }: { page?: number; perPage?: number } = {},
): Promise<StravaActivity[]> {
  const url = new URL(ACTIVITIES_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch activities: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as StravaActivity[];
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [hours, minutes, seconds]
    .map((unit, index) => (index === 0 && unit === 0 ? null : String(unit).padStart(2, "0")))
    .filter((part): part is string => part !== null)
    .join(":");
}

function formatPacePerKm(metersPerSecond: number): string {
  if (!metersPerSecond) return "-";
  const secondsPerKm = 1000 / metersPerSecond;
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

export function toSummaryRow(activity: StravaActivity) {
  return {
    Date: activity.start_date_local.slice(0, 10),
    Name: activity.name,
    Type: activity.sport_type || activity.type,
    "Distance (km)": (activity.distance / 1000).toFixed(2),
    Time: formatDuration(activity.moving_time),
    Pace: formatPacePerKm(activity.average_speed),
    "Avg HR": activity.average_heartrate ? Math.round(activity.average_heartrate) : "-",
    "Elev Gain (m)": Math.round(activity.total_elevation_gain),
  };
}
