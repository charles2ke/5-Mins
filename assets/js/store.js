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

/** Returns an ISO timestamp, or null when the value is missing or unusable. */
function normaliseTimestamp(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Validates and normalises a location. City and country are optional and are
 * what the home page filters use. Throws when the input is unusable.
 */
export function normaliseLocation(input) {
  const name = String(input.name ?? "").trim();
  const city = String(input.city ?? "").trim();
  const country = String(input.country ?? "").trim();
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
    city,
    country,
    lat,
    lon,
    people: Array.isArray(input.people)
      ? input.people.flatMap((person) => {
          try {
            return [normalisePerson(person)];
          } catch {
            return [];
          }
        })
      : [],
    // Ids of the alerts already seen for this location, so that a newly
    // triggered alert can ask everybody to check in again.
    alertIds: Array.isArray(input.alertIds)
      ? input.alertIds.filter((id) => typeof id === "string")
      : [],
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

  return {
    id: input.id || createId(),
    name,
    contact,
    // When the person last marked themselves safe, or null when they have not.
    safeAt: normaliseTimestamp(input.safeAt),
  };
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
