const NWS_ENDPOINT = "https://api.weather.gov/alerts/active";
const USGS_ENDPOINT = "https://earthquake.usgs.gov/fdsnws/event/1/query";

const SEVERITY_ORDER = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];

/** Earthquakes below this magnitude are not treated as a disaster alert. */
const MIN_MAGNITUDE = 4.5;
/** How far around the location earthquakes are considered relevant. */
const EARTHQUAKE_RADIUS_KM = 300;
/** How far back in time earthquakes are considered relevant. */
const EARTHQUAKE_WINDOW_HOURS = 24;

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

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/geo+json, application/json" },
  });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
}

function nwsUrl(lat, lon) {
  const params = new URLSearchParams({ point: `${lat},${lon}` });
  return `${NWS_ENDPOINT}?${params.toString()}`;
}

function usgsUrl(lat, lon, now) {
  const start = new Date(
    now.getTime() - EARTHQUAKE_WINDOW_HOURS * 60 * 60 * 1000,
  );
  const params = new URLSearchParams({
    format: "geojson",
    latitude: String(lat),
    longitude: String(lon),
    maxradiuskm: String(EARTHQUAKE_RADIUS_KM),
    minmagnitude: String(MIN_MAGNITUDE),
    starttime: start.toISOString(),
    orderby: "time",
  });
  return `${USGS_ENDPOINT}?${params.toString()}`;
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
      effective: props.effective || props.onset || null,
      expires: props.expires || props.ends || null,
      url: typeof props.id === "string" && props.id.startsWith("http")
        ? props.id
        : "https://www.weather.gov/",
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
      effective: props.time ? new Date(props.time).toISOString() : null,
      expires: null,
      url: typeof props.url === "string" && props.url.startsWith("http")
        ? props.url
        : "https://earthquake.usgs.gov/earthquakes/map/",
    };
  });
}

/**
 * Fetches every disaster alert currently available for a location.
 *
 * Sources are queried independently so that one failing feed still lets the
 * other alerts through; failures are reported in the `errors` array.
 */
export async function fetchAlerts(
  { lat, lon },
  { fetchImpl = globalThis.fetch.bind(globalThis), now = new Date() } = {},
) {
  const sources = [
    {
      name: "US National Weather Service",
      url: nwsUrl(lat, lon),
      map: mapWeatherAlerts,
    },
    {
      name: "USGS Earthquake Hazards Program",
      url: usgsUrl(lat, lon, now),
      map: mapEarthquakeAlerts,
    },
  ];

  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        const payload = await fetchJson(source.url, fetchImpl);
        return { alerts: source.map(payload), error: null };
      } catch (error) {
        return {
          alerts: [],
          error: `${source.name}: ${error.message || "request failed"}`,
        };
      }
    }),
  );

  const alerts = results.flatMap((result) => result.alerts);
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

export { SEVERITY_ORDER, magnitudeSeverity };
