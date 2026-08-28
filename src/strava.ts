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
  map?: {
    summary_polyline?: string;
  };
}

/**
 * Decodes a Google/Strava encoded polyline (precision 5) into [lat, lng] pairs.
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
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

export function toRoute(activity: StravaActivity) {
  const polyline = activity.map?.summary_polyline;
  return {
    id: activity.id,
    name: activity.name,
    date: activity.start_date_local.slice(0, 10),
    type: activity.sport_type || activity.type,
    distanceKm: Number((activity.distance / 1000).toFixed(2)),
    points: polyline ? decodePolyline(polyline) : [],
  };
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
