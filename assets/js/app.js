import { ALERT_WINDOW_DAYS, fetchAlerts } from "./alerts.js";
import { createCityAutocomplete } from "./autocomplete.js";
import {
  loadLocations,
  normaliseLocation,
  normalisePerson,
  saveLocations,
} from "./store.js";

const locationForm = document.querySelector("#location-form");
const locationFormError = document.querySelector("#location-form-error");
const locationList = document.querySelector("#locations");
const emptyState = document.querySelector("#empty-state");
const refreshButton = document.querySelector("#refresh-alerts");
const useMyLocationButton = document.querySelector("#use-my-location");
const locationNameInput = document.querySelector("#location-name");
const citySuggestions = document.querySelector("#city-suggestions");
const cityStatus = document.querySelector("#city-status");

const locationTemplate = document.querySelector("#location-template");
const personTemplate = document.querySelector("#person-template");
const alertTemplate = document.querySelector("#alert-template");

let locations = loadLocations();
const alertResults = new WeakMap();

function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function clearError(element) {
  element.textContent = "";
  element.hidden = true;
}

function persist() {
  saveLocations(locations);
}

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

function activeAlerts(node) {
  const result = alertResults.get(node);
  return result ? result.alerts : [];
}

function safeCount(location) {
  return location.people.filter((person) => person.safeAt).length;
}

function renderSafetySummary(node, location) {
  const summary = node.querySelector("[data-safety-summary]");
  const alerting = activeAlerts(node).length > 0;
  const total = location.people.length;

  if (!alerting || total === 0) {
    summary.hidden = true;
    summary.textContent = "";
    return;
  }

  const safe = safeCount(location);
  const waiting = total - safe;
  summary.hidden = false;
  summary.dataset.allSafe = waiting === 0 ? "true" : "false";
  summary.textContent =
    waiting === 0
      ? `Safety check-in: everyone (${total}) marked safe.`
      : `Safety check-in: ${safe} of ${total} marked safe · ${waiting} still to confirm.`;
}

function renderPeople(node, location) {
  const list = node.querySelector("[data-people]");
  const empty = node.querySelector("[data-people-empty]");
  list.textContent = "";
  empty.hidden = location.people.length > 0;
  const alerting = activeAlerts(node).length > 0;

  for (const person of location.people) {
    const item = personTemplate.content.firstElementChild.cloneNode(true);
    item.querySelector("[data-person-name]").textContent = person.name;
    item.querySelector("[data-person-contact]").textContent = person.contact;

    const safety = item.querySelector("[data-person-safety]");
    const markSafeButton = item.querySelector("[data-mark-safe]");
    const undoSafeButton = item.querySelector("[data-undo-safe]");
    const checkedIn = Boolean(person.safeAt);
    const showSafetyState = checkedIn && alerting;

    item.dataset.safe = showSafetyState ? "true" : "false";
    safety.hidden = !showSafetyState;
    safety.textContent = showSafetyState
      ? `Safe · ${formatDate(person.safeAt) ?? "just now"}`
      : "";

    markSafeButton.hidden = checkedIn || !alerting;
    markSafeButton.setAttribute("aria-label", `I'm safe: ${person.name}`);
    markSafeButton.addEventListener("click", () => {
      person.safeAt = new Date().toISOString();
      persist();
      renderPeople(node, location);
    });

    undoSafeButton.hidden = !showSafetyState;
    undoSafeButton.setAttribute("aria-label", `Undo safe: ${person.name}`);
    undoSafeButton.addEventListener("click", () => {
      person.safeAt = null;
      persist();
      renderPeople(node, location);
    });

    item
      .querySelector("[data-remove-person]")
      .addEventListener("click", () => {
        location.people = location.people.filter(
          (candidate) => candidate.id !== person.id,
        );
        persist();
        renderPeople(node, location);
      });
    list.append(item);
  }

  renderSafetySummary(node, location);

  const result = alertResults.get(node);
  if (result) {
    renderAlertStatus(node, location, result);
  }
}

function renderAlertStatus(node, location, { alerts, errors }) {
  const status = node.querySelector("[data-alert-status]");
  const messages = [];
  if (alerts.length === 0) {
    messages.push(
      `No alerts in the last ${ALERT_WINDOW_DAYS} days for this location.`,
    );
  } else {
    const people = location.people.length;
    messages.push(
      `${alerts.length} alert${alerts.length === 1 ? "" : "s"} in the last ${ALERT_WINDOW_DAYS} days · ${people} ${people === 1 ? "person" : "people"} to notify.`,
    );
    if (people > 0) {
      messages.push(`${safeCount(location)} marked safe.`);
    }
  }
  messages.push(...errors);
  status.textContent = messages.join(" ");
}

/**
 * Clears the safety check-ins when an alert that was not seen before is
 * triggered, so that people confirm they are safe for the new event. The
 * location is updated in place and persisted when anything changed.
 */
function syncSafetyCheckIns(location, { alerts, errors }) {
  const current = new Set(alerts.map((alert) => alert.id));
  if (current.size === 0 && errors.length > 0) {
    // The feeds could not be read, so the known alerts are left untouched.
    return;
  }

  const known = new Set(location.alertIds);
  const triggered = [...current].some((id) => !known.has(id));
  let changed = false;

  if (triggered) {
    for (const person of location.people) {
      if (person.safeAt) {
        person.safeAt = null;
        changed = true;
      }
    }
  }

  if (triggered || current.size !== known.size) {
    location.alertIds = [...current];
    changed = true;
  }

  if (changed) {
    persist();
  }
}

function renderAlerts(node, location, result) {
  const { alerts } = result;
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

  alertResults.set(node, result);
  renderPeople(node, location);
}

async function loadAlertsFor(node, location) {
  const status = node.querySelector("[data-alert-status]");
  status.textContent = "Loading alerts…";
  try {
    const result = await fetchAlerts(location);
    syncSafetyCheckIns(location, result);
    renderAlerts(node, location, result);
  } catch (error) {
    let message;
    if (error instanceof Error) {
      message = error.message;
    } else {
      try {
        message = JSON.stringify(error) || String(error);
      } catch {
        message = String(error);
      }
    }
    status.textContent = `Could not load alerts: ${message}`;
  }
}

function renderLocation(location) {
  const node = locationTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.locationId = location.id;
  node.querySelector("[data-location-name]").textContent = location.name;
  node.querySelector("[data-location-coords]").textContent =
    `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`;

  node
    .querySelector("[data-alert-heading]")
    .textContent = `Alerts · last ${ALERT_WINDOW_DAYS} days`;

  node
    .querySelector("[data-remove-location]")
    .addEventListener("click", () => {
      locations = locations.filter(
        (candidate) => candidate.id !== location.id,
      );
      persist();
      render();
    });

  const personForm = node.querySelector("[data-person-form]");
  const personError = node.querySelector("[data-person-error]");
  personForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(personForm);
    try {
      const person = normalisePerson({
        name: data.get("name"),
        contact: data.get("contact"),
      });
      location.people.push(person);
      persist();
      personForm.reset();
      clearError(personError);
      renderPeople(node, location);
    } catch (error) {
      showError(personError, error.message);
    }
  });

  renderPeople(node, location);
  locationList.append(node);
  loadAlertsFor(node, location);
}

function render() {
  locationList.textContent = "";
  emptyState.hidden = locations.length > 0;
  for (const location of locations) {
    renderLocation(location);
  }
}

const cityAutocomplete = createCityAutocomplete({
  input: locationNameInput,
  list: citySuggestions,
  status: cityStatus,
  onSelect(city) {
    locationForm.elements.lat.value = city.lat.toFixed(4);
    locationForm.elements.lon.value = city.lon.toFixed(4);
    clearError(locationFormError);
  },
});

locationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(locationForm);
  try {
    const location = normaliseLocation({
      name: data.get("name"),
      lat: data.get("lat"),
      lon: data.get("lon"),
    });
    locations.push(location);
    persist();
    locationForm.reset();
    cityAutocomplete.reset();
    clearError(locationFormError);
    render();
  } catch (error) {
    showError(locationFormError, error.message);
  }
});

refreshButton.addEventListener("click", () => {
  for (const node of locationList.querySelectorAll("[data-location]")) {
    const location = locations.find(
      (candidate) => candidate.id === node.dataset.locationId,
    );
    if (location) {
      loadAlertsFor(node, location);
    }
  }
});

useMyLocationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showError(
      locationFormError,
      "This browser cannot share your location. Enter coordinates manually.",
    );
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      locationForm.elements.lat.value = position.coords.latitude.toFixed(4);
      locationForm.elements.lon.value = position.coords.longitude.toFixed(4);
      clearError(locationFormError);
    },
    () => {
      showError(
        locationFormError,
        "Could not read your location. Enter coordinates manually.",
      );
    },
  );
});

render();
