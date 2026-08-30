/**
 * Live weather for a watched location.
 *
 * The Open-Meteo forecast API is public, needs no API key and sends CORS
 * headers, so it can be called straight from the browser like the alert feeds
 * and the city lookup in `cities.js`.
 */
const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * WMO weather interpretation codes, grouped into the conditions the card can
 * draw. See https://open-meteo.com/en/docs for the full table.
 */
const WEATHER_CODES = new Map([
  [0, { label: "Clear sky", icon: "clear" }],
  [1, { label: "Mainly clear", icon: "partly" }],
  [2, { label: "Partly cloudy", icon: "partly" }],
  [3, { label: "Overcast", icon: "cloud" }],
  [45, { label: "Fog", icon: "fog" }],
  [48, { label: "Freezing fog", icon: "fog" }],
  [51, { label: "Light drizzle", icon: "rain" }],
  [53, { label: "Drizzle", icon: "rain" }],
  [55, { label: "Heavy drizzle", icon: "rain" }],
  [56, { label: "Freezing drizzle", icon: "sleet" }],
  [57, { label: "Heavy freezing drizzle", icon: "sleet" }],
  [61, { label: "Light rain", icon: "rain" }],
  [63, { label: "Rain", icon: "rain" }],
  [65, { label: "Heavy rain", icon: "rain" }],
  [66, { label: "Freezing rain", icon: "sleet" }],
  [67, { label: "Heavy freezing rain", icon: "sleet" }],
  [71, { label: "Light snow", icon: "snow" }],
  [73, { label: "Snow", icon: "snow" }],
  [75, { label: "Heavy snow", icon: "snow" }],
  [77, { label: "Snow grains", icon: "snow" }],
  [80, { label: "Light rain showers", icon: "rain" }],
  [81, { label: "Rain showers", icon: "rain" }],
  [82, { label: "Violent rain showers", icon: "rain" }],
  [85, { label: "Snow showers", icon: "snow" }],
  [86, { label: "Heavy snow showers", icon: "snow" }],
  [95, { label: "Thunderstorm", icon: "thunder" }],
  [96, { label: "Thunderstorm with hail", icon: "thunder" }],
  [99, { label: "Thunderstorm with heavy hail", icon: "thunder" }],
]);

/** Wind speeds, in km/h, that make the weather itself worth noticing. */
const STRONG_WIND_KMH = 40;

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Describes a WMO weather code, picking the day or night variant of clear and
 * partly cloudy skies.
 */
export function describeWeather(code, isDay = true) {
  const found = WEATHER_CODES.get(Number(code));
  if (!found) return { label: "Weather unavailable", icon: "cloud" };
  if (found.icon === "clear") {
    return { label: isDay ? found.label : "Clear night", icon: isDay ? "clear" : "night" };
  }
  if (found.icon === "partly" && !isDay) {
    return { label: found.label, icon: "partly-night" };
  }
  return found;
}

export function formatTemperature(value, unit = "°C") {
  const number = numberOrNull(value);
  return number === null ? "—" : `${Math.round(number)}${unit}`;
}

/**
 * Reads the current conditions for a location from the Open-Meteo forecast API.
 *
 * Throws when the lookup fails so the caller can tell the user, exactly like
 * the alert feeds do.
 */
export async function fetchWeather(
  { lat, lon },
  { fetchImpl = globalThis.fetch.bind(globalThis), signal } = {},
) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day",
    daily: "temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "1",
  });

  const response = await fetchImpl(`${FORECAST_ENDPOINT}?${params}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const current = payload?.current ?? {};
  const units = payload?.current_units ?? {};
  const daily = payload?.daily ?? {};
  const first = (value) => (Array.isArray(value) ? value[0] : undefined);
  const isDay = current.is_day === undefined ? true : Number(current.is_day) === 1;
  const condition = describeWeather(current.weather_code, isDay);

  return {
    ...condition,
    isDay,
    temperature: numberOrNull(current.temperature_2m),
    feelsLike: numberOrNull(current.apparent_temperature),
    humidity: numberOrNull(current.relative_humidity_2m),
    precipitation: numberOrNull(current.precipitation),
    windSpeed: numberOrNull(current.wind_speed_10m),
    high: numberOrNull(first(daily.temperature_2m_max)),
    low: numberOrNull(first(daily.temperature_2m_min)),
    observedAt: isoOrNull(current.time),
    units: {
      temperature: String(units.temperature_2m ?? "°C"),
      wind: String(units.wind_speed_10m ?? "km/h"),
      precipitation: String(units.precipitation ?? "mm"),
    },
  };
}

/** True when the current conditions are worth calling out on their own. */
export function isRoughWeather(weather) {
  if (!weather) return false;
  if (["thunder", "snow", "sleet"].includes(weather.icon)) return true;
  return (weather.windSpeed ?? 0) >= STRONG_WIND_KMH;
}

function shape(name, attributes) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function sun(cx = 22, cy = 20, r = 8) {
  const parts = [shape("circle", { class: "weather-sun", cx, cy, r })];
  for (let index = 0; index < 8; index += 1) {
    const angle = (index * Math.PI) / 4;
    const inner = r + 3;
    const outer = r + 7;
    parts.push(
      shape("line", {
        class: "weather-ray",
        x1: (cx + Math.cos(angle) * inner).toFixed(2),
        y1: (cy + Math.sin(angle) * inner).toFixed(2),
        x2: (cx + Math.cos(angle) * outer).toFixed(2),
        y2: (cy + Math.sin(angle) * outer).toFixed(2),
      }),
    );
  }
  return parts;
}

function moon() {
  return [
    shape("path", {
      class: "weather-moon",
      d: "M30 22a12 12 0 1 1-13-13 10 10 0 0 0 13 13Z",
    }),
  ];
}

function cloud(y = 0) {
  return [
    shape("path", {
      class: "weather-cloud",
      d: `M17 ${34 + y}a8 8 0 0 1 .6-16 11 11 0 0 1 20.6 3.2A7.4 7.4 0 0 1 37 ${
        34 + y
      }Z`,
    }),
  ];
}

function drops(kind, columns = [0, 1, 2]) {
  const parts = [];
  for (const index of columns) {
    const x = 17 + index * 8;
    if (kind === "snow") {
      parts.push(shape("circle", { class: "weather-snow", cx: x, cy: 44, r: 2.2 }));
    } else {
      parts.push(
        shape("line", {
          class: "weather-drop",
          x1: x,
          y1: 39,
          x2: x - 2,
          y2: 47,
        }),
      );
    }
  }
  return parts;
}

const ICONS = {
  clear: () => sun(),
  night: () => moon(),
  partly: () => [...sun(16, 16, 6), ...cloud(2)],
  "partly-night": () => [...moon(), ...cloud(2)],
  cloud: () => cloud(2),
  fog: () => [
    ...cloud(-2),
    shape("line", { class: "weather-fog", x1: 12, y1: 40, x2: 40, y2: 40 }),
    shape("line", { class: "weather-fog", x1: 16, y1: 46, x2: 44, y2: 46 }),
  ],
  rain: () => [...cloud(-2), ...drops("rain")],
  sleet: () => [...cloud(-2), ...drops("rain", [0, 2]), ...drops("snow", [1])],
  snow: () => [...cloud(-2), ...drops("snow")],
  thunder: () => [
    ...cloud(-2),
    shape("path", { class: "weather-bolt", d: "M27 36l-8 12h7l-2 10 10-14h-7l4-8Z" }),
  ],
};

/**
 * Builds the SVG drawing for a condition, so the card shows the weather at a
 * glance instead of only as text.
 */
export function createWeatherIcon(icon, label) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "weather-icon");
  svg.setAttribute("viewBox", "0 0 56 56");
  svg.setAttribute("role", "img");
  svg.dataset.icon = icon;
  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = label;
  svg.append(title, ...(ICONS[icon] ?? ICONS.cloud)());
  return svg;
}

export { FORECAST_ENDPOINT, STRONG_WIND_KMH };
