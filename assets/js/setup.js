import { createCityAutocomplete } from "./autocomplete.js";
import {
  loadLocations,
  normaliseLocation,
  normalisePerson,
  saveLocations,
} from "./store.js";
import { describePlace } from "./places.js";

const locationForm = document.querySelector("#location-form");
const locationFormError = document.querySelector("#location-form-error");
const locationList = document.querySelector("#locations");
const emptyState = document.querySelector("#empty-state");
const useMyLocationButton = document.querySelector("#use-my-location");
const locationNameInput = document.querySelector("#location-name");
const citySuggestions = document.querySelector("#city-suggestions");
const cityStatus = document.querySelector("#city-status");

const locationTemplate = document.querySelector("#location-template");
const personTemplate = document.querySelector("#person-template");

let locations = loadLocations();

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

function renderPeople(node, location) {
  const list = node.querySelector("[data-people]");
  const empty = node.querySelector("[data-people-empty]");
  list.textContent = "";
  empty.hidden = location.people.length > 0;

  for (const person of location.people) {
    const item = personTemplate.content.firstElementChild.cloneNode(true);
    item.querySelector("[data-person-name]").textContent = person.name;
    item.querySelector("[data-person-contact]").textContent = person.contact;
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
}

function renderLocation(location) {
  const node = locationTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.locationId = location.id;
  node.querySelector("[data-location-name]").textContent = location.name;

  const place = node.querySelector("[data-location-place]");
  const placeLabel = describePlace(location);
  place.textContent = placeLabel;
  place.hidden = placeLabel === "";

  node.querySelector("[data-location-coords]").textContent =
    `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`;

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
    // Fill the filter fields too, so a suggested city can be filtered on the
    // home map without retyping it.
    locationForm.elements.city.value = city.name;
    locationForm.elements.country.value = city.country;
    clearError(locationFormError);
  },
});

locationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(locationForm);
  try {
    const location = normaliseLocation({
      name: data.get("name"),
      city: data.get("city"),
      country: data.get("country"),
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
