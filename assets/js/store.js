const STORAGE_KEY = "5-mins.locations.v1";

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates and normalises a location. Throws when the input is unusable.
 */
export function normaliseLocation(input) {
  const name = String(input.name ?? "").trim();
  const lat = Number(input.lat);
  const lon = Number(input.lon);

  if (!name) {
    throw new Error("A location name is required.");
  }
  if (!isFiniteNumber(lat) || lat < -90 || lat > 90) {
    throw new Error("Latitude must be a number between -90 and 90.");
  }
  if (!isFiniteNumber(lon) || lon < -180 || lon > 180) {
    throw new Error("Longitude must be a number between -180 and 180.");
  }

  return {
    id: input.id || createId(),
    name,
    lat,
    lon,
    people: Array.isArray(input.people) ? input.people.map(normalisePerson) : [],
  };
}

/**
 * Validates and normalises a person. Throws when the input is unusable.
 */
export function normalisePerson(input) {
  const name = String(input.name ?? "").trim();
  const contact = String(input.contact ?? "").trim();

  if (!name) {
    throw new Error("A name is required.");
  }
  if (!contact) {
    throw new Error("An email address or phone number is required.");
  }

  return { id: input.id || createId(), name, contact };
}

export function loadLocations(storage = globalThis.localStorage) {
  let raw = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  const locations = [];
  for (const entry of parsed) {
    try {
      locations.push(normaliseLocation(entry));
    } catch {
      // Skip entries that no longer match the expected shape.
    }
  }
  return locations;
}

export function saveLocations(locations, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(locations));
  } catch {
    // Storage may be unavailable (private mode, quota); the app still works
    // for the current session.
  }
}

export { STORAGE_KEY };
