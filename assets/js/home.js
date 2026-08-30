import { fetchAlerts, SEVERITY_ORDER } from "./alerts.js";
import { describePlace, matchesFilters, placeKey, placeOptions } from "./places.js";
import { loadLocations } from "./store.js";
import { drawGraticule, drawLand, drawMarkers } from "./worldmap.js";

const refreshButton = document.querySelector("#refresh-alerts");
const clearFiltersButton = document.querySelector("#clear-filters");
const countryFilter = document.querySelector("#filter-country");
const cityFilter = document.querySelector("#filter-city");
const mapSummary = document.querySelector("#map-summary");
const markerGroup = document.querySelector("#map-markers");
const locationList = document.querySelector("#locations");
const emptyState = document.querySelector("#empty-state");
const noMatches = document.querySelector("#no-matches");

const locationTemplate = document.querySelector("#location-template");
const alertTemplate = document.querySelector("#alert-template");

const locations = loadLocations();
/** Alert results per location id: `{ status, alerts, errors }`. */
const results = new Map();
const filters = { country: "", city: "" };
/** Labels for filters that came from the URL and match no location. */
const filterLabels = { country: "", city: "" };
let selectedId = null;

drawGraticule(document.querySelector("#map-graticule"));
drawLand(document.querySelector("#map-land"));

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error) || String(error);
  } catch {
    return String(error);
  }
}

function resultFor(location) {
  return results.get(location.id) ?? { status: "loading", alerts: [], errors: [] };
}

function topSeverity(alerts) {
  let best = "None";
  let bestRank = SEVERITY_ORDER.length;
  for (const alert of alerts) {
    const rank = SEVERITY_ORDER.indexOf(alert.severity);
    const safeRank = rank === -1 ? SEVERITY_ORDER.length - 1 : rank;
    if (safeRank < bestRank) {
      bestRank = safeRank;
      best = alert.severity;
    }
  }
  return best;
}

function visibleLocations() {
  return locations.filter((location) => matchesFilters(location, filters));
}

function pluralise(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/* ---------------------------------------------------------------- filters */

function fillSelect(select, options, selectedKey, allLabel) {
  select.textContent = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = allLabel;
  select.append(all);

  for (const option of options) {
    const node = document.createElement("option");
    node.value = option.key;
    node.textContent = option.label;
    select.append(node);
  }
  select.value = selectedKey;
}

/**
 * Keeps a filter that matches no location selectable, so a shared link such as
 * `?country=japan` shows "no matches" instead of silently ignoring the filter.
 */
function withSelected(options, field) {
  const key = filters[field];
  if (!key || options.some((option) => option.key === key)) return options;
  return [{ key, label: filterLabels[field] || key }, ...options];
}

/** Locations a city filter can pick from, given the selected country. */
function cityPool(countryKey) {
  if (!countryKey) return locations;
  return locations.filter(
    (location) => placeKey(location.country) === countryKey,
  );
}

function renderFilters() {
  const countries = withSelected(placeOptions(locations, "country"), "country");
  const cities = withSelected(
    placeOptions(cityPool(filters.country), "city"),
    "city",
  );

  fillSelect(countryFilter, countries, filters.country, "All countries");
  fillSelect(cityFilter, cities, filters.city, "All cities");

  countryFilter.disabled = countries.length === 0;
  cityFilter.disabled = cities.length === 0;
  clearFiltersButton.disabled = !filters.country && !filters.city;
}

function syncFiltersToUrl() {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  }
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}`,
  );
}

function readFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  for (const field of ["country", "city"]) {
    const raw = String(params.get(field) ?? "").trim();
    filters[field] = placeKey(raw);
    filterLabels[field] = raw;
  }
}

/* -------------------------------------------------------------------- map */

function renderMap(shown) {
  const markers = shown.map((location) => {
    const result = resultFor(location);
    const alertCount = result.alerts.length;
    const place = describePlace(location);
    const label = `${location.name}${place ? ` (${place})` : ""} — ${
      result.status === "loading"
        ? "loading alerts"
        : pluralise(alertCount, "active alert", "active alerts")
    }`;
    return {
      id: location.id,
      label,
      lat: location.lat,
      lon: location.lon,
      alertCount,
      severity: topSeverity(result.alerts),
      selected: location.id === selectedId,
    };
  });

  drawMarkers(markerGroup, markers, { onSelect: selectLocation });
}

function renderSummary(shown) {
  if (locations.length === 0) {
    mapSummary.textContent =
      "No locations yet. Add them on the setup page to see them on the map.";
    return;
  }

  const parts = [];
  const loading = shown.filter(
    (location) => resultFor(location).status === "loading",
  ).length;
  const totalAlerts = shown.reduce(
    (total, location) => total + resultFor(location).alerts.length,
    0,
  );
  const affected = shown.filter(
    (location) => resultFor(location).alerts.length > 0,
  ).length;

  parts.push(
    `${pluralise(totalAlerts, "active alert", "active alerts")} across ${pluralise(
      affected,
      "location",
      "locations",
    )}.`,
  );
  if (shown.length !== locations.length) {
    parts.push(
      `Showing ${shown.length} of ${pluralise(
        locations.length,
        "location",
        "locations",
      )}.`,
    );
  }
  if (loading > 0) {
    parts.push(`Loading ${loading} more…`);
  }
  mapSummary.textContent = parts.join(" ");
}

function selectLocation(id) {
  selectedId = selectedId === id ? null : id;
  render();
  const node = locationList.querySelector(`[data-location-id="${CSS.escape(id)}"]`);
  if (node && selectedId) {
    node.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

/* ------------------------------------------------------------------ lists */

function renderAlerts(node, alerts) {
  const list = node.querySelector("[data-alerts]");
  list.textContent = "";

  for (const alert of alerts) {
    const item = alertTemplate.content.firstElementChild.cloneNode(true);
    item.dataset.severity = alert.severity;
    item.querySelector("[data-alert-severity]").textContent = alert.severity;
    item.querySelector("[data-alert-source]").textContent = alert.source;
    item.querySelector("[data-alert-event]").textContent = alert.event;
    item.querySelector("[data-alert-headline]").textContent = alert.headline;

    const meta = [
      alert.area && `Area: ${alert.area}`,
      formatDate(alert.effective) && `From: ${formatDate(alert.effective)}`,
      formatDate(alert.expires) && `Until: ${formatDate(alert.expires)}`,
    ].filter(Boolean);
    item.querySelector("[data-alert-meta]").textContent = meta.join(" · ");

    const link = item.querySelector("[data-alert-link]");
    const href = safeUrl(alert.url);
    if (href) {
      link.href = href;
    } else {
      link.remove();
    }

    list.append(item);
  }
}

function renderLocation(location) {
  const result = resultFor(location);
  const node = locationTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.locationId = location.id;
  if (location.id === selectedId) {
    node.dataset.selected = "true";
  }

  node.querySelector("[data-location-name]").textContent = location.name;

  const place = node.querySelector("[data-location-place]");
  const placeLabel = describePlace(location);
  place.textContent = placeLabel;
  place.hidden = placeLabel === "";

  node.querySelector("[data-location-coords]").textContent =
    `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`;

  const badge = node.querySelector("[data-location-severity]");
  const severity = topSeverity(result.alerts);
  badge.textContent = severity;
  badge.dataset.severity = severity;
  badge.hidden = result.alerts.length === 0;

  const status = node.querySelector("[data-alert-status]");
  if (result.status === "loading") {
    status.textContent = "Loading alerts…";
  } else {
    const messages = [];
    if (result.alerts.length === 0) {
      messages.push("No active alerts for this location.");
    } else {
      messages.push(
        `${pluralise(result.alerts.length, "active alert", "active alerts")} · ${pluralise(
          location.people.length,
          "person",
          "people",
        )} to notify.`,
      );
    }
    messages.push(...result.errors);
    status.textContent = messages.join(" ");
  }

  const peopleSummary = node.querySelector("[data-people-summary]");
  peopleSummary.textContent =
    location.people.length === 0
      ? "Nobody will be alerted for this location yet."
      : `Will alert: ${location.people.map((person) => person.name).join(", ")}.`;

  renderAlerts(node, result.alerts);
  locationList.append(node);
}

function render() {
  renderFilters();
  const shown = visibleLocations();

  emptyState.hidden = locations.length > 0;
  noMatches.hidden = locations.length === 0 || shown.length > 0;

  locationList.textContent = "";
  for (const location of shown) {
    renderLocation(location);
  }

  renderMap(shown);
  renderSummary(shown);
}

/* ------------------------------------------------------------------ alerts */

async function loadAlertsFor(location) {
  results.set(location.id, { status: "loading", alerts: [], errors: [] });
  try {
    const { alerts, errors } = await fetchAlerts(location);
    results.set(location.id, { status: "ready", alerts, errors });
  } catch (error) {
    results.set(location.id, {
      status: "ready",
      alerts: [],
      errors: [`Could not load alerts: ${errorMessage(error)}`],
    });
  }
  render();
}

function loadAllAlerts() {
  for (const location of locations) {
    results.set(location.id, { status: "loading", alerts: [], errors: [] });
  }
  render();
  return Promise.all(locations.map(loadAlertsFor));
}

countryFilter.addEventListener("change", () => {
  filters.country = countryFilter.value;
  filterLabels.country = "";
  const available = placeOptions(cityPool(filters.country), "city");
  if (filters.city && !available.some((option) => option.key === filters.city)) {
    filters.city = "";
    filterLabels.city = "";
  }
  syncFiltersToUrl();
  render();
});

cityFilter.addEventListener("change", () => {
  filters.city = cityFilter.value;
  filterLabels.city = "";
  syncFiltersToUrl();
  render();
});

clearFiltersButton.addEventListener("click", () => {
  filters.country = "";
  filters.city = "";
  filterLabels.country = "";
  filterLabels.city = "";
  syncFiltersToUrl();
  render();
});

refreshButton.addEventListener("click", () => {
  loadAllAlerts();
});

readFiltersFromUrl();
render();
syncFiltersToUrl();
loadAllAlerts();
