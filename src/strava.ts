const API_BASE = "https://www.strava.com/api/v3";
const ACTIVITIES_URL = `${API_BASE}/athlete/activities`;

export interface StravaAthlete {
  id: number;
  username?: string;
  firstname?: string;
  lastname?: string;
  city?: string;
  state?: string;
  country?: string;
  sex?: string;
  premium?: boolean;
  created_at?: string;
  updated_at?: string;
  profile_medium?: string;
  profile?: string;
}

export interface StravaAthleteStats {
  biggest_ride_distance?: number;
  biggest_climb_elevation_gain?: number;
  recent_ride_totals?: Record<string, number>;
  recent_run_totals?: Record<string, number>;
  recent_swim_totals?: Record<string, number>;
  ytd_ride_totals?: Record<string, number>;
  ytd_run_totals?: Record<string, number>;
  ytd_swim_totals?: Record<string, number>;
  all_ride_totals?: Record<string, number>;
  all_run_totals?: Record<string, number>;
  all_swim_totals?: Record<string, number>;
}

async function stravaGet<T>(url: URL | string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Strava API request failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export async function fetchAthlete(accessToken: string): Promise<StravaAthlete> {
  return stravaGet<StravaAthlete>(`${API_BASE}/athlete`, accessToken);
}

export async function fetchAthleteStats(
  accessToken: string,
  athleteId: number,
): Promise<StravaAthleteStats> {
  return stravaGet<StravaAthleteStats>(`${API_BASE}/athletes/${athleteId}/stats`, accessToken);
}

export async function fetchActivity(
  accessToken: string,
  activityId: number,
): Promise<Record<string, unknown>> {
  const url = new URL(`${API_BASE}/activities/${activityId}`);
  url.searchParams.set("include_all_efforts", "true");
  return stravaGet<Record<string, unknown>>(url, accessToken);
}

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
  {
    page = 1,
    perPage = 30,
    after,
    before,
  }: { page?: number; perPage?: number; after?: number; before?: number } = {},
): Promise<StravaActivity[]> {
  const url = new URL(ACTIVITIES_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  if (after != null) url.searchParams.set("after", String(after));
  if (before != null) url.searchParams.set("before", String(before));
  return stravaGet<StravaActivity[]>(url, accessToken);
}

export async function fetchActivitiesInRange(
  accessToken: string,
  {
    after,
    before,
    maxPages = 20,
  }: { after?: number; before?: number; maxPages?: number } = {},
): Promise<StravaActivity[]> {
  const all: StravaActivity[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await fetchActivities(accessToken, { page, perPage: 100, after, before });
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

export function summarizeActivities(activities: StravaActivity[]) {
  const bySport: Record<
    string,
    { activities: number; distanceKm: number; movingHours: number; elevationGainM: number }
  > = {};

  let totalDistance = 0;
  let totalMoving = 0;
  let totalElevation = 0;
  let hrSum = 0;
  let hrCount = 0;
  let wattsSum = 0;
  let wattsCount = 0;

  for (const activity of activities) {
    const sport = activity.sport_type || activity.type || "Other";
    const row = (bySport[sport] ??= {
      activities: 0,
      distanceKm: 0,
      movingHours: 0,
      elevationGainM: 0,
    });
    row.activities += 1;
    row.distanceKm += activity.distance / 1000;
    row.movingHours += activity.moving_time / 3600;
    row.elevationGainM += activity.total_elevation_gain || 0;

    totalDistance += activity.distance;
    totalMoving += activity.moving_time;
    totalElevation += activity.total_elevation_gain || 0;
    if (activity.average_heartrate != null) {
      hrSum += activity.average_heartrate;
      hrCount += 1;
    }
    if (activity.average_watts != null) {
      wattsSum += activity.average_watts;
      wattsCount += 1;
    }
  }

  for (const value of Object.values(bySport)) {
    value.distanceKm = Number(value.distanceKm.toFixed(2));
    value.movingHours = Number(value.movingHours.toFixed(2));
    value.elevationGainM = Math.round(value.elevationGainM);
  }

  return {
    activities: activities.length,
    totalDistanceKm: Number((totalDistance / 1000).toFixed(2)),
    totalMovingHours: Number((totalMoving / 3600).toFixed(2)),
    totalElevationGainM: Math.round(totalElevation),
    averageHeartRateAcrossActivities: hrCount ? Math.round(hrSum / hrCount) : null,
    averagePowerAcrossActivitiesW: wattsCount ? Math.round(wattsSum / wattsCount) : null,
    bySport,
  };
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
