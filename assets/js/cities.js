/**
 * City lookup used by the location autocomplete.
 *
 * The Open-Meteo geocoding API searches the worldwide GeoNames city database.
 * It is public, needs no API key and sends CORS headers, so it can be called
 * straight from the browser like the alert feeds.
 */
const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

/** Shorter queries match too many cities to be a useful suggestion list. */
const MIN_QUERY_LENGTH = 2;
/** How many suggestions are offered at once. */
const MAX_RESULTS = 8;

function text(value) {
  return String(value ?? "").trim();
}

function toCity(result, index) {
  const name = text(result?.name);
  const lat = Number(result?.latitude);
  const lon = Number(result?.longitude);

  if (!name) return null;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;

  const country = text(result?.country);
  const region = [text(result?.admin1), country].filter(Boolean).join(", ");

  return {
    id: text(result?.id) || `city-${index}`,
    name,
    country,
    region,
    label: region ? `${name}, ${region}` : name,
    lat,
    lon,
  };
}

/**
 * Finds the cities whose name starts with `query`.
 *
 * Resolves with an empty array for queries that are too short, and throws when
 * the lookup itself fails so the caller can tell the user.
 */
export async function searchCities(
  query,
  {
    fetchImpl = globalThis.fetch.bind(globalThis),
    signal,
    limit = MAX_RESULTS,
  } = {},
) {
  const name = text(query);
  if (name.length < MIN_QUERY_LENGTH) {
    return [];
  }

  const params = new URLSearchParams({
    name,
    count: String(limit),
    language: "en",
    format: "json",
  });

  const response = await fetchImpl(`${GEOCODING_ENDPOINT}?${params}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results
    .map((result, index) => toCity(result, index))
    .filter((city) => city !== null)
    .slice(0, limit);
}

export { GEOCODING_ENDPOINT, MAX_RESULTS, MIN_QUERY_LENGTH };
