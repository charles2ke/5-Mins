/**
 * Helpers for the optional city / country a location can be tagged with, and
 * for the home page filters built from them.
 */

/** Groups values case-insensitively so "usa" and "USA" filter together. */
export function placeKey(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** "Miami, United States", "Miami", "United States" or "" when unknown. */
export function describePlace({ city, country } = {}) {
  return [city, country]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Distinct, alphabetically sorted values of `field` across `locations`.
 * Returns `{ key, label }` pairs; the first spelling seen wins as the label.
 */
export function placeOptions(locations, field) {
  const options = new Map();
  for (const location of locations) {
    const label = String(location[field] ?? "").trim();
    const key = placeKey(label);
    if (!key || options.has(key)) continue;
    options.set(key, { key, label });
  }
  return [...options.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
}

/** True when a location passes the selected country and city filters. */
export function matchesFilters(location, { country = "", city = "" } = {}) {
  if (country && placeKey(location.country) !== country) return false;
  if (city && placeKey(location.city) !== city) return false;
  return true;
}
