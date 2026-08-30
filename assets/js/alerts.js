const NWS_ENDPOINT = "https://api.weather.gov/alerts";
const USGS_ENDPOINT = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const GDACS_ENDPOINT =
  "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
const EONET_ENDPOINT = "https://eonet.gsfc.nasa.gov/api/v3/events";
const SWPC_ENDPOINT = "https://services.swpc.noaa.gov/products/alerts.json";

const SEVERITY_ORDER = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];

/** `area` used by alerts that affect the whole planet. */
const WORLDWIDE_AREA = "Worldwide";

/** Alerts are shown for the week leading up to now. */
const ALERT_WINDOW_DAYS = 7;
/** Earthquakes below this magnitude are not treated as a disaster alert. */
const MIN_MAGNITUDE = 4.5;
/** How far around the location earthquakes are considered relevant. */
const EARTHQUAKE_RADIUS_KM = 300;
/**
 * How far around the location the worldwide multi-hazard feeds are considered
 * relevant. These feeds report large scale events (cyclones, floods, wildfires)
 * with a single centre point, so the radius is wider than for earthquakes.
 */
const GLOBAL_EVENT_RADIUS_KM = 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EARTH_RADIUS_KM = 6371;

const GDACS_EVENT_TYPES = {
  DR: "Drought",
  EQ: "Earthquake",
  FL: "Flood",
  TC: "Tropical cyclone",
  TS: "Tsunami",
  VO: "Volcanic activity",
  WF: "Wildfire",
};

function windowStart(now) {
  return new Date(now.getTime() - ALERT_WINDOW_DAYS * MS_PER_DAY);
}

function severityRank(severity) {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

function magnitudeSeverity(magnitude) {
  if (!Number.isFinite(magnitude)) return "Unknown";
  if (magnitude >= 7) return "Extreme";
  if (magnitude >= 6) return "Severe";
  if (magnitude >= 5) return "Moderate";
  return "Minor";
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance, in kilometres, between two coordinates. */
function distanceKm(lat1, lon1, lat2, lon2) {
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Returns the first `[lon, lat]` pair of a GeoJSON coordinate array, whatever
 * its nesting depth, so points, lines and polygons can all be located.
 */
function firstCoordinate(coordinates) {
  if (!Array.isArray(coordinates)) return null;
  const [first, second] = coordinates;
  if (typeof first === "number" && typeof second === "number") {
    return Number.isFinite(first) && Number.isFinite(second)
      ? [first, second]
      : null;
  }
  for (const entry of coordinates) {
    const found = firstCoordinate(entry);
    if (found) return found;
  }
  return null;
}

/**
 * Normalises a feed timestamp to an ISO string. GDACS and the space weather
 * feed publish UTC timestamps without a timezone designator, which browsers
 * would otherwise read as local time.
 */
function toIsoDate(value) {
  if (value === null || value === undefined || value === "") return null;
  let candidate = value;
  if (typeof candidate !== "number") {
    candidate = String(candidate).trim();
    if (!candidate) return null;
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(candidate)) {
      candidate = `${candidate.replace(" ", "T")}Z`;
    }
  }
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Comparable timestamp for a feed date; unusable dates sort oldest. */
function timeValue(value) {
  const iso = toIsoDate(value);
  return iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY;
}

function isNearby(lat, lon, coordinates, radiusKm) {
  const point = firstCoordinate(coordinates);
  if (!point) return false;
  const [eventLon, eventLat] = point;
  return distanceKm(lat, lon, eventLat, eventLon) <= radiusKm;
}

function httpUrl(value, fallback) {
  return typeof value === "string" && /^https?:\/\//.test(value)
    ? value
    : fallback;
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/geo+json, application/json" },
  });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * The National Weather Service rejects coordinates with more than four decimal
 * places (about ten metres of precision) with a 400 response.
 */
function nwsPoint(value) {
  return String(Number(Number(value).toFixed(4)));
}

/**
 * The National Weather Service also rejects timestamps that carry
 * milliseconds, which `Date.prototype.toISOString` always adds, so the
 * fractional seconds are dropped before the UTC designator.
 */
function nwsTime(date) {
  return `${date.toISOString().slice(0, 19)}Z`;
}

function nwsUrl(lat, lon, now) {
  const params = new URLSearchParams({
    point: `${nwsPoint(lat)},${nwsPoint(lon)}`,
    start: nwsTime(windowStart(now)),
    end: nwsTime(now),
    status: "actual",
    message_type: "alert",
    limit: "500",
  });
  return `${NWS_ENDPOINT}?${params.toString()}`;
}

function usgsUrl(lat, lon, now) {
  const params = new URLSearchParams({
    format: "geojson",
    latitude: String(lat),
    longitude: String(lon),
    maxradiuskm: String(EARTHQUAKE_RADIUS_KM),
    minmagnitude: String(MIN_MAGNITUDE),
    starttime: windowStart(now).toISOString(),
    orderby: "time",
  });
  return `${USGS_ENDPOINT}?${params.toString()}`;
}

function gdacsUrl(now) {
  const params = new URLSearchParams({
    fromdate: windowStart(now).toISOString().slice(0, 10),
    todate: now.toISOString().slice(0, 10),
  });
  return `${GDACS_ENDPOINT}?${params.toString()}`;
}

function eonetUrl() {
  const params = new URLSearchParams({
    status: "open",
    days: String(ALERT_WINDOW_DAYS),
  });
  return `${EONET_ENDPOINT}?${params.toString()}`;
}

function mapWeatherAlerts(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  return features.map((feature, index) => {
    const props = feature?.properties ?? {};
    return {
      id: props.id || feature?.id || `nws-${index}`,
      source: "US National Weather Service",
      event: props.event || "Weather alert",
      severity: SEVERITY_ORDER.includes(props.severity)
        ? props.severity
        : "Unknown",
      headline: props.headline || props.description || "",
      area: props.areaDesc || "",
      effective: toIsoDate(props.effective || props.onset),
      expires: toIsoDate(props.expires || props.ends),
      url: httpUrl(props.id, "https://www.weather.gov/"),
    };
  });
}

function mapEarthquakeAlerts(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  return features.map((feature, index) => {
    const props = feature?.properties ?? {};
    const magnitude = Number(props.mag);
    return {
      id: feature?.id || `usgs-${index}`,
      source: "USGS Earthquake Hazards Program",
      event: Number.isFinite(magnitude)
        ? `Magnitude ${magnitude.toFixed(1)} earthquake`
        : "Earthquake",
      severity: magnitudeSeverity(magnitude),
      headline: props.title || props.place || "",
      area: props.place || "",
      effective: toIsoDate(props.time),
      expires: null,
      url: httpUrl(props.url, "https://earthquake.usgs.gov/earthquakes/map/"),
    };
  });
}

function gdacsSeverity(alertLevel) {
  switch (String(alertLevel ?? "").toLowerCase()) {
    case "red":
      return "Extreme";
    case "orange":
      return "Severe";
    case "green":
      return "Minor";
    default:
      return "Unknown";
  }
}

/** GDACS reports the event links either as a string or as a set of links. */
function gdacsReportUrl(props) {
  const links = props?.url;
  if (typeof links === "string") {
    return httpUrl(links, "https://www.gdacs.org/");
  }
  return httpUrl(
    links?.report,
    httpUrl(links?.details, "https://www.gdacs.org/"),
  );
}

function mapGdacsAlerts(payload, { lat, lon }) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  return features.flatMap((feature, index) => {
    if (
      !isNearby(lat, lon, feature?.geometry?.coordinates, GLOBAL_EVENT_RADIUS_KM)
    ) {
      return [];
    }
    const props = feature?.properties ?? {};
    return [
      {
        id: props.eventid
          ? `gdacs-${props.eventtype ?? "XX"}-${props.eventid}`
          : `gdacs-${index}`,
        source: "GDACS global disaster alerts",
        event: GDACS_EVENT_TYPES[props.eventtype] || "Disaster",
        severity: gdacsSeverity(props.alertlevel),
        headline:
          props.name || props.description || props.severitydata?.severitytext ||
          "",
        area: props.country || "",
        effective: toIsoDate(props.fromdate),
        expires: toIsoDate(props.todate),
        url: gdacsReportUrl(props),
      },
    ];
  });
}

function mapNaturalEvents(payload, { lat, lon }) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return events.flatMap((event, index) => {
    const geometries = Array.isArray(event?.geometry) ? event.geometry : [];
    // Events are tracked over time, so use the most recently dated position.
    const latest = geometries.reduce((found, geometry) => {
      if (!firstCoordinate(geometry?.coordinates)) return found;
      if (!found) return geometry;
      return timeValue(geometry.date) > timeValue(found.date)
        ? geometry
        : found;
    }, null);
    if (
      !latest ||
      !isNearby(lat, lon, latest.coordinates, GLOBAL_EVENT_RADIUS_KM)
    ) {
      return [];
    }
    const category = Array.isArray(event?.categories) ? event.categories[0] : null;
    const reporter = Array.isArray(event?.sources) ? event.sources[0] : null;
    return [
      {
        id: event?.id ? `eonet-${event.id}` : `eonet-${index}`,
        // EONET tracks confirmed natural events but publishes no severity.
        severity: "Unknown",
        source: "NASA EONET natural events",
        event: category?.title || "Natural event",
        headline: event?.title || "",
        area: event?.description || "",
        effective: toIsoDate(latest.date),
        expires: toIsoDate(event?.closed),
        url: httpUrl(reporter?.url, "https://eonet.gsfc.nasa.gov/"),
      },
    ];
  });
}

/** Reads the NOAA space weather scale (G, R or S, 1 to 5) out of a message. */
function spaceWeatherSeverity(message) {
  let worst = 0;
  for (const match of String(message ?? "").matchAll(/\b[GRS]([1-5])\b/g)) {
    worst = Math.max(worst, Number(match[1]));
  }
  if (worst >= 4) return "Extreme";
  if (worst === 3) return "Severe";
  if (worst === 2) return "Moderate";
  if (worst === 1) return "Minor";
  return "Unknown";
}

function spaceWeatherMessage(message) {
  const match = String(message ?? "").match(
    /^\s*(ALERT|WARNING|WATCH|SUMMARY|EXTENDED WARNING|CANCEL WARNING)\s*:\s*(.+)$/m,
  );
  return match ? { kind: match[1].toLowerCase(), text: match[2].trim() } : null;
}

function mapSpaceWeatherAlerts(payload, { now }) {
  const entries = Array.isArray(payload) ? payload : [];
  const cutoff = windowStart(now).getTime();
  return entries.flatMap((entry, index) => {
    const issued = toIsoDate(entry?.issue_datetime);
    if (!issued || Date.parse(issued) < cutoff) return [];
    const message = spaceWeatherMessage(entry?.message);
    // Summaries describe events that are already over.
    if (!message || message.kind === "summary") return [];
    return [
      {
        id: entry?.product_id
          ? `swpc-${entry.product_id}-${issued}`
          : `swpc-${index}`,
        source: "NOAA Space Weather Prediction Center",
        event: `Space weather ${message.kind}`,
        severity: spaceWeatherSeverity(entry?.message),
        headline: message.text,
        area: WORLDWIDE_AREA,
        effective: issued,
        expires: null,
        url: "https://www.swpc.noaa.gov/noaa-scales-explanation",
      },
    ];
  });
}

/**
 * Fetches every disaster alert available for a location during the past
 * {@link ALERT_WINDOW_DAYS} days.
 *
 * Sources are queried independently so that one failing feed still lets the
 * other alerts through; failures are reported in the `errors` array.
 */
export async function fetchAlerts(
  { lat, lon },
  { fetchImpl = globalThis.fetch.bind(globalThis), now = new Date() } = {},
) {
  const context = { lat, lon, now };
  const sources = [
    {
      name: "US National Weather Service",
      url: nwsUrl(lat, lon, now),
      map: mapWeatherAlerts,
    },
    {
      name: "USGS Earthquake Hazards Program",
      url: usgsUrl(lat, lon, now),
      map: mapEarthquakeAlerts,
    },
    {
      name: "GDACS global disaster alerts",
      url: gdacsUrl(now),
      map: mapGdacsAlerts,
    },
    {
      name: "NASA EONET natural events",
      url: eonetUrl(),
      map: mapNaturalEvents,
    },
    {
      name: "NOAA Space Weather Prediction Center",
      url: SWPC_ENDPOINT,
      map: mapSpaceWeatherAlerts,
    },
  ];

  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        const payload = await fetchJson(source.url, fetchImpl);
        return { alerts: source.map(payload, context), error: null };
      } catch (error) {
        return {
          alerts: [],
          error: `${source.name}: ${error.message || "request failed"}`,
        };
      }
    }),
  );

  // Feeds overlap (an earthquake can be reported by both USGS and GDACS), so
  // only the first alert seen for an id is kept.
  const seen = new Set();
  const alerts = [];
  for (const result of results) {
    for (const alert of result.alerts) {
      if (seen.has(alert.id)) continue;
      seen.add(alert.id);
      alerts.push(alert);
    }
  }

  const errors = results
    .map((result) => result.error)
    .filter((error) => error !== null);

  alerts.sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return String(b.effective ?? "").localeCompare(String(a.effective ?? ""));
  });

  return { alerts, errors };
}

/**
 * True for alerts that affect the whole planet rather than one place, such as
 * the NOAA space weather alerts. They are listed once, under "Worldwide",
 * instead of being repeated on every location.
 */
export function isWorldwideAlert(alert) {
  return String(alert?.area ?? "").trim().toLowerCase() === WORLDWIDE_AREA.toLowerCase();
}

export { ALERT_WINDOW_DAYS, SEVERITY_ORDER, WORLDWIDE_AREA, magnitudeSeverity };
