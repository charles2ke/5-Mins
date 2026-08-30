// Keep this key in sync with the inline script in index.html, which applies the
// stored theme before the first paint.
const STORAGE_KEY = "5-mins.theme.v1";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function darkMediaQuery() {
  return typeof globalThis.matchMedia === "function"
    ? globalThis.matchMedia(DARK_QUERY)
    : null;
}

/**
 * Returns the pinned theme ("light" or "dark"), or null to follow the system.
 */
export function loadTheme(storage = globalThis.localStorage) {
  let value = null;
  try {
    value = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  return value === "light" || value === "dark" ? value : null;
}

export function saveTheme(theme, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage may be unavailable (private mode, quota); the choice then only
    // lasts for this session.
  }
}

/**
 * Pins a theme on the document, or removes the pin to follow the system.
 */
export function applyTheme(theme, root = document.documentElement) {
  if (theme === "light" || theme === "dark") {
    root.dataset.theme = theme;
  } else {
    delete root.dataset.theme;
  }
}

export function initTheme(toggle) {
  let pinned = loadTheme();
  applyTheme(pinned);

  const media = darkMediaQuery();

  function activeTheme() {
    if (pinned) return pinned;
    return media && media.matches ? "dark" : "light";
  }

  function syncToggle() {
    toggle.setAttribute("aria-checked", String(activeTheme() === "dark"));
  }

  toggle.addEventListener("click", () => {
    pinned = activeTheme() === "dark" ? "light" : "dark";
    applyTheme(pinned);
    saveTheme(pinned);
    syncToggle();
  });

  if (media && typeof media.addEventListener === "function") {
    media.addEventListener("change", syncToggle);
  }

  syncToggle();
}

const toggle = document.querySelector("#theme-toggle");
if (toggle) {
  initTheme(toggle);
}
