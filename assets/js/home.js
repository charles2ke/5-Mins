import {
  ALERT_WINDOW_DAYS,
  fetchAlerts,
  isWorldwideAlert,
  SEVERITY_ORDER,
  WORLDWIDE_AREA,
} from "./alerts.js";
import { describePlace, matchesFilters, placeKey, placeOptions } from "./places.js";
import { buildWarning, shareWarning, warningLink } from "./notify.js";
import { loadLocations, saveLocations } from "./store.js";
import { drawGraticule, drawLand, drawMarkers } from "./worldmap.js";
import {
  createWeatherIcon,
  fetchWeather,
  formatTemperature,
  isRoughWeather,
} from "./weather.js";

const refreshButton = document.querySelector("#refresh-alerts");
const clearFiltersButton = document.querySelector("#clear-filters");
const worldwideToggle = document.querySelector("#toggle-worldwide");
const countryFilter = document.querySelector("#filter-country");
const cityFilter = document.querySelector("#filter-city");
const severityFilter = document.querySelector("#filter-severity");
const severityChips = document.querySelector("#severity-chips");
const refreshStatus = document.querySelector("#refresh-status");
const filterHint = document.querySelector("#filter-hint");
const mapSummary = document.querySelector("#map-summary");
const markerGroup = document.querySelector("#map-markers");
const locationList = document.querySelector("#locations");
const emptyState = document.querySelector("#empty-state");
const noMatches = document.querySelector("#no-matches");

const locationTemplate = document.querySelector("#location-template");
const alertTemplate = document.querySelector("#alert-template");
const personTemplate = document.querySelector("#person-template");

const locations = loadLocations();
/** Alert results per location id: `{ status, alerts, errors }`. */
const results = new Map();
/** Live weather per location id: `{ status, weather, error }`. */
const weatherResults = new Map();
/**
 * `severity` holds every selected severity key; empty means "all of them".
 * `worldwide` is false while the reader hides the alerts that reach every
 * location.
 */
const filters = { country: "", city: "", severity: [], worldwide: true };
/** Labels for filters that came from the URL and match no location. */
const filterLabels = { country: "", city: "" };
/** Ids of the cards the reader has folded away. */
const collapsed = new Set();
/** Id of the card that lists the alerts affecting every location. */
const WORLDWIDE_ID = "worldwide";
let selectedId = null;
/** True while a refresh of the alert and weather feeds is in flight. */
let refreshing = false;

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

/** An OpenStreetMap link to the location, for the warning message. */
function warningLinkForLocation(location) {
  const lat = location.lat.toFixed(4);
  const lon = location.lon.toFixed(4);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=9/${lat}/${lon}`;
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

function weatherFor(location) {
  return (
    weatherResults.get(location.id) ?? {
      status: "loading",
      weather: null,
      error: null,
    }
  );
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

/** The alerts of a location, minus the ones that affect the whole planet. */
function localAlerts(location) {
  return resultFor(location).alerts.filter((alert) => !isWorldwideAlert(alert));
}

/** True while the selected severity filters, if any, keep this alert. */
function matchesSeverity(alert) {
  return (
    filters.severity.length === 0 ||
    filters.severity.includes(placeKey(alert.severity))
  );
}

function filterAlerts(alerts) {
  return alerts.filter(matchesSeverity);
}

/** Every worldwide alert reported for `shown`, each listed only once. */
function worldwideAlerts(shown) {
  if (!filters.worldwide) return [];
  const seen = new Set();
  const alerts = [];
  for (const location of shown) {
    for (const alert of resultFor(location).alerts) {
      if (!isWorldwideAlert(alert) || seen.has(alert.id)) continue;
      seen.add(alert.id);
      alerts.push(alert);
    }
  }
  return filterAlerts(alerts);
}

/** Locations kept by the country and city filters. */
function placeMatches() {
  return locations.filter((location) => matchesFilters(location, filters));
}

function visibleLocations() {
  return placeMatches().filter((location) => {
    // A location still loading is kept so the list does not flash empty.
    if (filters.severity.length === 0 || resultFor(location).status === "loading") {
      return true;
    }
    return filterAlerts(localAlerts(location)).length > 0;
  });
}

function pluralise(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function persist() {
  saveLocations(locations);
}

function safeCount(location) {
  return location.people.filter((person) => person.safeAt).length;
}

function syncSafetyCheckIns(location, { alerts, errors }) {
  const current = new Set(alerts.map((alert) => alert.id));
  if (current.size === 0 && errors.length > 0) return;

  const known = new Set(location.alertIds);
  const triggered = [...current].some((id) => !known.has(id));
  if (triggered) {
    for (const person of location.people) {
      person.safeAt = null;
    }
  }

  const next = errors.length > 0 ? new Set([...known, ...current]) : current;
  const sameAlerts =
    next.size === known.size && [...next].every((id) => known.has(id));
  if (triggered || !sameAlerts) {
    location.alertIds = [...next];
    persist();
  }
}

/* ---------------------------------------------------------------- filters */

/**
 * Fills a filter with `options`.
 *
 * Every alert and weather response re-renders the page, and rebuilding a
 * `<select>` closes the list a reader has just opened, so the options are only
 * replaced when they actually changed.
 */
function fillSelect(select, options, selectedKey, allLabel) {
  const signature = JSON.stringify([
    allLabel,
    options.map((option) => [option.key, option.label]),
  ]);

  if (select.dataset.options !== signature) {
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
    select.dataset.options = signature;
  }

  if (select.value !== selectedKey) {
    select.value = selectedKey;
  }
}

/**
 * Fills the severity filter with a checkbox per `options` entry and ticks
 * `selectedKeys`.
 *
 * Checkboxes replace a `<select multiple>`: ticking several severities takes
 * one tap each instead of a ctrl-click, which no touch device offers.
 */
function fillChips(container, options, selectedKeys) {
  const signature = JSON.stringify(
    options.map((option) => [option.key, option.label]),
  );

  if (container.dataset.options !== signature) {
    container.textContent = "";
    for (const option of options) {
      const label = document.createElement("label");
      label.className = "chip";
      label.dataset.severity = option.label;

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = option.key;
      input.dataset.severityChip = "";

      const text = document.createElement("span");
      text.textContent = option.label;

      label.append(input, text);
      container.append(label);
    }
    container.dataset.options = signature;
  }

  for (const input of container.querySelectorAll("input[type=checkbox]")) {
    const checked = selectedKeys.includes(input.value);
    if (input.checked !== checked) {
      input.checked = checked;
    }
  }
}

/** The severities a reader can filter on, newest feeds included. */
function severityOptions() {
  return SEVERITY_ORDER.map((severity) => ({
    key: placeKey(severity),
    label: severity,
  }));
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
  fillChips(severityChips, severityOptions(), filters.severity);
  worldwideToggle.setAttribute("aria-checked", String(filters.worldwide));

  countryFilter.disabled = countries.length === 0;
  cityFilter.disabled = cities.length === 0;
  severityFilter.disabled = locations.length === 0;
  worldwideToggle.disabled = locations.length === 0;
  refreshButton.disabled = refreshing || locations.length === 0;
  clearFiltersButton.disabled = !hasFilters();
  // Without a city or country on any location the place filters stay empty,
  // which otherwise looks like a broken control.
  filterHint.hidden =
    locations.length === 0 || countries.length > 0 || cities.length > 0;
}

function hasFilters() {
  return Boolean(
    filters.country ||
      filters.city ||
      filters.severity.length ||
      !filters.worldwide,
  );
}

function syncFiltersToUrl() {
  const params = new URLSearchParams(window.location.search);
  for (const field of ["country", "city"]) {
    if (filters[field]) {
      params.set(field, filters[field]);
    } else {
      params.delete(field);
    }
  }
  if (filters.severity.length > 0) {
    params.set("severity", filters.severity.join(","));
  } else {
    params.delete("severity");
  }
  // Only the non-default choice is worth carrying in a shared link.
  if (filters.worldwide) {
    params.delete("worldwide");
  } else {
    params.set("worldwide", "0");
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
  const known = severityOptions().map((option) => option.key);
  const wanted = String(params.get("severity") ?? "")
    .split(",")
    .map((value) => placeKey(value))
    .filter((value) => known.includes(value));
  // Ordered and de-duplicated so `?severity=severe,extreme` and
  // `?severity=extreme,severe` are the same filter.
  filters.severity = known.filter((key) => wanted.includes(key));
  // Only `worldwide=0` hides them: that is the value syncFiltersToUrl writes.
  filters.worldwide = String(params.get("worldwide") ?? "").trim() !== "0";
}

/* -------------------------------------------------------------------- map */

function renderMap(shown) {
  const markers = shown.map((location) => {
    const result = resultFor(location);
    const alerts = filterAlerts(localAlerts(location));
    const alertCount = alerts.length;
    const place = describePlace(location);
    const label = `${location.name}${place ? ` (${place})` : ""} — ${
      result.status === "loading"
        ? "loading alerts"
        : pluralise(alertCount, "alert", "alerts")
    }`;
    return {
      id: location.id,
      label,
      lat: location.lat,
      lon: location.lon,
      alertCount,
      severity: topSeverity(alerts),
      selected: location.id === selectedId,
    };
  });

  drawMarkers(markerGroup, markers, { onSelect: selectLocation });
}

function renderSummary(shown, worldwide) {
  if (locations.length === 0) {
    mapSummary.textContent =
      "No locations yet. Add them on the setup page to see them on the map.";
    return;
  }

  const parts = [];
  const loading = shown.filter(
    (location) => resultFor(location).status === "loading",
  ).length;
  const totalAlerts =
    shown.reduce(
      (total, location) => total + filterAlerts(localAlerts(location)).length,
      0,
    ) + worldwide.length;
  parts.push(
    `${pluralise(totalAlerts, "alert", "alerts")} in the last ${ALERT_WINDOW_DAYS} days across ${pluralise(
      shown.length,
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
  if (worldwide.length > 0) {
    parts.push(
      `Including ${pluralise(
        worldwide.length,
        "alert",
        "alerts",
      )} affecting everywhere.`,
    );
  }
  if (!filters.worldwide) {
    parts.push("Worldwide alerts are hidden.");
  }
  if (loading > 0) {
    parts.push(`Loading ${loading} more…`);
  }
  mapSummary.textContent = parts.join(" ");
}

function selectLocation(id) {
  selectedId = selectedId === id ? null : id;
  // A folded card would hide the alerts the reader just asked to see.
  if (selectedId) collapsed.delete(id);
  render();
  const node = locationList.querySelector(`[data-location-id="${CSS.escape(id)}"]`);
  if (node && selectedId) {
    node.scrollIntoView({
      block: "nearest",
      behavior: globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
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

/**
 * Shows the links that warn a person through the apps on the device. Each
 * link is only offered when their contact suits it, so an email address gets
 * "Email" and a phone number gets "Text" and "WhatsApp".
 */
function renderWarnLinks(item, person, warning) {
  const container = item.querySelector("[data-warn-links]");
  const channels = [
    ["[data-warn-email]", "email", `Email a warning to ${person.name}`],
    ["[data-warn-sms]", "sms", `Text a warning to ${person.name}`],
    ["[data-warn-whatsapp]", "whatsapp", `Send ${person.name} a warning on WhatsApp`],
  ];

  let offered = 0;
  for (const [selector, channel, label] of channels) {
    const link = item.querySelector(selector);
    const href = warningLink(person, warning, channel);
    if (href) {
      link.href = href;
      link.setAttribute("aria-label", label);
      link.hidden = false;
      offered += 1;
    } else {
      link.remove();
    }
  }
  container.hidden = offered === 0;
}

/**
 * Wires the button that hands the warning to the system share sheet, or to
 * the clipboard when the browser has no Web Share API.
 */
function renderShareWarning(node, warning) {
  const actions = node.querySelector("[data-warn-actions]");
  const status = node.querySelector("[data-warn-status]");
  const button = node.querySelector("[data-share-warning]");
  actions.hidden = !warning;
  status.textContent = "";
  if (!warning) return;

  button.addEventListener("click", async () => {
    button.disabled = true;
    const outcome = await shareWarning(warning);
    button.disabled = false;
    status.textContent =
      {
        shared: "Warning shared.",
        copied: "Warning copied to the clipboard.",
        cancelled: "",
      }[outcome] ?? "Sharing is unavailable in this browser.";
  });
}

function renderPeople(node, location, alerting, warning = null) {
  const list = node.querySelector("[data-people]");
  const summary = node.querySelector("[data-safety-summary]");
  list.textContent = "";

  for (const person of location.people) {
    const item = personTemplate.content.firstElementChild.cloneNode(true);
    const checkedIn = Boolean(person.safeAt);
    const showSafetyState = checkedIn && alerting;
    item.dataset.safe = showSafetyState ? "true" : "false";
    item.querySelector("[data-person-name]").textContent = person.name;
    item.querySelector("[data-person-contact]").textContent = person.contact;

    renderWarnLinks(item, person, warning);

    const safety = item.querySelector("[data-person-safety]");
    safety.hidden = !showSafetyState;
    safety.textContent = showSafetyState
      ? `Safe · ${formatDate(person.safeAt) ?? "just now"}`
      : "";

    const markSafe = item.querySelector("[data-mark-safe]");
    markSafe.hidden = checkedIn || !alerting;
    markSafe.setAttribute("aria-label", `I'm safe: ${person.name}`);
    markSafe.addEventListener("click", () => {
      person.safeAt = new Date().toISOString();
      persist();
      render();
    });

    const undoSafe = item.querySelector("[data-undo-safe]");
    undoSafe.hidden = !showSafetyState;
    undoSafe.setAttribute("aria-label", `Undo safe: ${person.name}`);
    undoSafe.addEventListener("click", () => {
      person.safeAt = null;
      persist();
      render();
    });
    list.append(item);
  }

  if (!alerting || location.people.length === 0) {
    summary.hidden = true;
    summary.textContent = "";
    return;
  }
  const safe = safeCount(location);
  const waiting = location.people.length - safe;
  summary.hidden = false;
  summary.dataset.allSafe = waiting === 0 ? "true" : "false";
  summary.textContent =
    waiting === 0
      ? `Safety check-in: everyone (${location.people.length}) marked safe.`
      : `Safety check-in: ${safe} of ${location.people.length} marked safe · ${waiting} still to confirm.`;
}

function addMetric(list, term, value) {
  if (value === "") return;
  // Each metric is wrapped so its label and value stay together in the grid.
  const wrapper = document.createElement("div");
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = value;
  wrapper.append(dt, dd);
  list.append(wrapper);
}

function renderWeather(node, location) {
  const card = node.querySelector("[data-weather]");
  const status = card.querySelector("[data-weather-status]");
  const figure = card.querySelector("[data-weather-icon]");
  const temp = card.querySelector("[data-weather-temp]");
  const condition = card.querySelector("[data-weather-condition]");
  const observed = card.querySelector("[data-weather-observed]");
  const metrics = card.querySelector("[data-weather-metrics]");
  const { status: state, weather, error } = weatherFor(location);

  figure.textContent = "";
  metrics.textContent = "";

  if (state !== "ready" || !weather) {
    card.dataset.state = state === "loading" ? "loading" : "error";
    delete card.dataset.condition;
    delete card.dataset.rough;
    for (const element of [temp, condition, observed, metrics]) {
      element.hidden = true;
    }
    status.hidden = false;
    status.textContent =
      state === "loading"
        ? "Loading live weather…"
        : `Live weather unavailable: ${error}`;
    return;
  }

  card.dataset.state = "ready";
  card.dataset.condition = weather.icon;
  card.dataset.rough = isRoughWeather(weather) ? "true" : "false";
  status.hidden = true;
  status.textContent = "";
  for (const element of [temp, condition, observed, metrics]) {
    element.hidden = false;
  }

  const unit = weather.units.temperature;
  figure.append(createWeatherIcon(weather.icon, weather.label));
  temp.textContent = formatTemperature(weather.temperature, unit);
  condition.textContent = weather.label;
  const observedAt = formatDate(weather.observedAt);
  observed.textContent = observedAt ? `Live weather · ${observedAt}` : "Live weather";

  addMetric(
    metrics,
    "Feels like",
    weather.feelsLike === null ? "" : formatTemperature(weather.feelsLike, unit),
  );
  addMetric(
    metrics,
    "High / low",
    weather.high === null && weather.low === null
      ? ""
      : `${formatTemperature(weather.high, unit)} / ${formatTemperature(
          weather.low,
          unit,
        )}`,
  );
  addMetric(
    metrics,
    "Wind",
    weather.windSpeed === null
      ? ""
      : `${Math.round(weather.windSpeed)} ${weather.units.wind}`,
  );
  addMetric(
    metrics,
    "Humidity",
    weather.humidity === null ? "" : `${Math.round(weather.humidity)}%`,
  );
  addMetric(
    metrics,
    "Precipitation",
    weather.precipitation === null
      ? ""
      : `${weather.precipitation} ${weather.units.precipitation}`,
  );
}

/**
 * Wires a card up so it can be folded away, and restores the state the reader
 * left it in: every render rebuilds the cards from the template.
 */
function setupCollapse(node, id) {
  const details = node.querySelector("[data-location-details]");
  details.open = !collapsed.has(id);
  details.addEventListener("toggle", () => {
    if (details.open) {
      collapsed.delete(id);
    } else {
      collapsed.add(id);
    }
  });
}

function renderSeverityBadge(node, alerts) {
  const badge = node.querySelector("[data-location-severity]");
  const severity = topSeverity(alerts);
  badge.textContent = severity;
  badge.dataset.severity = severity;
  badge.hidden = alerts.length === 0;
}

/** One card for the alerts that reach every location, without local weather. */
function renderWorldwide(alerts) {
  const node = locationTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.locationId = WORLDWIDE_ID;
  node.dataset.worldwide = "true";

  node.querySelector("[data-location-name]").textContent = WORLDWIDE_AREA;
  node.querySelector("[data-location-place]").hidden = true;
  node.querySelector("[data-location-coords]").hidden = true;
  // Worldwide alerts belong to no place, so there is no weather to report.
  node.querySelector("[data-weather]").remove();
  node.querySelector("[data-people-summary]").hidden = true;
  // Worldwide alerts belong to no location, so nobody is warned from here.
  node.querySelector("[data-warn-actions]").remove();

  renderSeverityBadge(node, alerts);
  node.querySelector("[data-alert-status]").textContent =
    `${pluralise(alerts.length, "alert", "alerts")} in the last ${ALERT_WINDOW_DAYS} days affecting every location.`;

  renderAlerts(node, alerts);
  setupCollapse(node, WORLDWIDE_ID);
  locationList.append(node);
}

function renderLocation(location) {
  const result = resultFor(location);
  const alerts = filterAlerts(localAlerts(location));
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

  renderSeverityBadge(node, alerts);

  const status = node.querySelector("[data-alert-status]");
  if (result.status === "loading") {
    status.textContent = "Loading alerts…";
  } else {
    const messages = [];
    if (alerts.length === 0) {
      messages.push(
        `No alerts in the last ${ALERT_WINDOW_DAYS} days for this location.`,
      );
    } else {
      messages.push(
        `${pluralise(alerts.length, "alert", "alerts")} in the last ${ALERT_WINDOW_DAYS} days · ${pluralise(
          location.people.length,
          "person",
          "people",
        )} to notify.`,
      );
      if (location.people.length > 0) {
        messages.push(`${safeCount(location)} marked safe.`);
      }
    }
    messages.push(...result.errors);
    status.textContent = messages.join(" ");
  }

  const peopleSummary = node.querySelector("[data-people-summary]");
  peopleSummary.textContent =
    location.people.length === 0
      ? "Nobody will be alerted for this location yet."
      : `Will alert: ${location.people.map((person) => person.name).join(", ")}.`;

  renderWeather(node, location);
  const warning = buildWarning(location, alerts, {
    place: placeLabel,
    link: warningLinkForLocation(location),
  });
  renderShareWarning(node, warning);
  renderPeople(node, location, alerts.length > 0, warning);
  renderAlerts(node, alerts);
  setupCollapse(node, location.id);
  locationList.append(node);
}

function render() {
  renderFilters();
  const shown = visibleLocations();
  // Worldwide alerts survive a severity filter that hides every location.
  const worldwide = worldwideAlerts(placeMatches());

  emptyState.hidden = locations.length > 0;
  noMatches.hidden = locations.length === 0 || shown.length > 0;

  locationList.textContent = "";
  for (const location of shown) {
    renderLocation(location);
  }
  if (worldwide.length > 0) {
    renderWorldwide(worldwide);
  }

  renderMap(shown);
  renderSummary(shown, worldwide);
}

/* ------------------------------------------------------------------ alerts */

async function loadAlertsFor(location) {
  results.set(location.id, { status: "loading", alerts: [], errors: [] });
  try {
    const { alerts, errors } = await fetchAlerts(location);
    // Worldwide alerts reach every location, so they never single one out for
    // a safety check-in.
    syncSafetyCheckIns(location, {
      alerts: alerts.filter((alert) => !isWorldwideAlert(alert)),
      errors,
    });
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

async function loadWeatherFor(location) {
  weatherResults.set(location.id, {
    status: "loading",
    weather: null,
    error: null,
  });
  try {
    const weather = await fetchWeather(location);
    weatherResults.set(location.id, { status: "ready", weather, error: null });
  } catch (error) {
    weatherResults.set(location.id, {
      status: "error",
      weather: null,
      error: errorMessage(error),
    });
  }
  render();
}

function loadAllWeather() {
  for (const location of locations) {
    weatherResults.set(location.id, {
      status: "loading",
      weather: null,
      error: null,
    });
  }
  render();
  return Promise.all(locations.map(loadWeatherFor));
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

severityChips.addEventListener("change", () => {
  const chosen = new Set(
    [...severityChips.querySelectorAll("input[type=checkbox]:checked")].map(
      (input) => input.value,
    ),
  );
  filters.severity = severityOptions()
    .map((option) => option.key)
    .filter((key) => chosen.has(key));
  syncFiltersToUrl();
  render();
});

worldwideToggle.addEventListener("click", () => {
  filters.worldwide = !filters.worldwide;
  syncFiltersToUrl();
  render();
});

clearFiltersButton.addEventListener("click", () => {
  filters.country = "";
  filters.city = "";
  filters.severity = [];
  filters.worldwide = true;
  filterLabels.country = "";
  filterLabels.city = "";
  syncFiltersToUrl();
  render();
});

/**
 * Reloads every feed and keeps the reader posted: the button says what it is
 * doing while the requests are in flight, then the status says how fresh the
 * alerts on screen are.
 */
async function refreshEverything() {
  if (locations.length === 0) {
    refreshStatus.textContent = "";
    return;
  }
  refreshing = true;
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing\u2026";
  refreshStatus.textContent = "Refreshing alerts and weather\u2026";
  try {
    await Promise.all([loadAllAlerts(), loadAllWeather()]);
    const updatedAt = new Date();
    const time = document.createElement("time");
    time.dateTime = updatedAt.toISOString();
    time.textContent = updatedAt.toLocaleTimeString();
    refreshStatus.replaceChildren("Updated ", time);
  } catch {
    refreshStatus.textContent = "Refresh failed";
  } finally {
    refreshing = false;
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh alerts";
  }
}

refreshButton.addEventListener("click", () => {
  refreshEverything();
});

readFiltersFromUrl();
render();
syncFiltersToUrl();
refreshEverything();
