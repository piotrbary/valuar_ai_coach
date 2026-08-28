const ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string; // UTC ISO8601
  start_date_local: string; // local ISO8601
  timezone?: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds, includes stops
  total_elevation_gain: number; // meters
  elev_high?: number;
  elev_low?: number;
  average_speed: number; // meters/second
  max_speed?: number; // meters/second
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  device_watts?: boolean; // true if average_watts came from a real power meter, not an estimate
  gear_id?: string;
  private?: boolean;
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

export interface StravaStreams {
  latlng?: [number, number][];
  heartrate?: number[];
  cadence?: number[];
  altitude?: number[];
  distance?: number[];
  time?: number[];
  velocity_smooth?: number[];
  watts?: number[];
  temp?: number[];
  grade_smooth?: number[];
  moving?: boolean[];
}

const STREAM_KEYS = [
  "latlng",
  "heartrate",
  "cadence",
  "altitude",
  "distance",
  "time",
  "velocity_smooth",
  "watts",
  "temp",
  "grade_smooth",
  "moving",
] as const;

export async function fetchActivityStreams(
  accessToken: string,
  activityId: number,
  keys: readonly string[] = STREAM_KEYS,
): Promise<StravaStreams> {
  const url = new URL(`https://www.strava.com/api/v3/activities/${activityId}/streams`);
  url.searchParams.set("keys", keys.join(","));
  url.searchParams.set("key_by_type", "true");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch activity streams: ${response.status} ${await response.text()}`);
  }

  const raw = (await response.json()) as Record<string, { data: unknown[] }>;
  const streams: StravaStreams = {};
  for (const key of keys) {
    if (raw[key]) {
      (streams as Record<string, unknown[]>)[key] = raw[key].data;
    }
  }
  return streams;
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
  const startLocal = new Date(activity.start_date_local);
  const endLocal = new Date(startLocal.getTime() + activity.elapsed_time * 1000);

  return {
    Id: activity.id,
    Name: activity.name,
    Type: activity.sport_type || activity.type,
    "Start (local)": activity.start_date_local,
    "End (local)": endLocal.toISOString().replace(/\.\d{3}Z$/, "Z"),
    "Distance (km)": (activity.distance / 1000).toFixed(2),
    "Moving Time": formatDuration(activity.moving_time),
    "Elapsed Time": formatDuration(activity.elapsed_time),
    Pace: formatPacePerKm(activity.average_speed),
    "Avg HR": activity.average_heartrate ? Math.round(activity.average_heartrate) : "-",
    "Max HR": activity.max_heartrate ?? "-",
    "Avg Cadence": activity.average_cadence ? Math.round(activity.average_cadence) : "-",
    "Avg Power (W)": activity.average_watts ? Math.round(activity.average_watts) : "-",
    "Weighted Avg Power (W)": activity.weighted_average_watts
      ? Math.round(activity.weighted_average_watts)
      : "-",
    "Max Power (W)": activity.max_watts ?? "-",
    "Power Source": activity.average_watts
      ? activity.device_watts
        ? "power meter"
        : "estimated"
      : "-",
    "Energy (kJ)": activity.kilojoules ? Math.round(activity.kilojoules) : "-",
    "Elev Gain (m)": Math.round(activity.total_elevation_gain),
    "Elev High (m)": activity.elev_high != null ? Math.round(activity.elev_high) : "-",
    "Elev Low (m)": activity.elev_low != null ? Math.round(activity.elev_low) : "-",
    Private: Boolean(activity.private),
  };
}
