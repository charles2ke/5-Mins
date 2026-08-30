import { MIN_QUERY_LENGTH, searchCities } from "./cities.js";

/** How long typing pauses before a lookup is sent. */
const DEBOUNCE_MS = 250;

/**
 * Turns a text input into an accessible city autocomplete (ARIA combobox).
 *
 * `onSelect` is called with the chosen city so the caller can, for example,
 * fill in its coordinates.
 */
export function createCityAutocomplete({
  input,
  list,
  status,
  onSelect,
  search = searchCities,
  debounceMs = DEBOUNCE_MS,
}) {
  let cities = [];
  let activeIndex = -1;
  let timer = null;
  let controller = null;
  let requestId = 0;

  function setStatus(message) {
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
  }

  function cancelPending() {
    clearTimeout(timer);
    timer = null;
    if (controller) {
      controller.abort();
      controller = null;
    }
    requestId += 1;
  }

  function close() {
    list.textContent = "";
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    cities = [];
    activeIndex = -1;
  }

  function highlight(index) {
    const options = Array.from(list.children);
    activeIndex = index;
    options.forEach((option, position) => {
      const active = position === index;
      option.setAttribute("aria-selected", active ? "true" : "false");
      option.classList.toggle("is-active", active);
    });

    if (index >= 0 && options[index]) {
      input.setAttribute("aria-activedescendant", options[index].id);
      options[index].scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function render(results) {
    close();
    if (results.length === 0) return;

    cities = results;
    for (const [index, city] of results.entries()) {
      const option = document.createElement("li");
      option.className = "suggestion";
      option.id = `${list.id}-option-${index}`;
      option.dataset.index = String(index);
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");

      const name = document.createElement("span");
      name.className = "suggestion-name";
      name.textContent = city.name;
      option.append(name);

      if (city.region) {
        const region = document.createElement("span");
        region.className = "suggestion-region";
        region.textContent = city.region;
        option.append(region);
      }

      list.append(option);
    }

    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function select(index) {
    const city = cities[index];
    if (!city) return;

    cancelPending();
    input.value = city.label;
    close();
    setStatus("");
    if (typeof onSelect === "function") {
      onSelect(city);
    }
  }

  async function runSearch(query) {
    cancelPending();
    const current = requestId;
    controller =
      typeof AbortController === "function" ? new AbortController() : null;
    setStatus("Searching cities…");

    try {
      const results = await search(query, { signal: controller?.signal });
      if (current !== requestId) return;
      render(results);
      setStatus(results.length === 0 ? `No cities match “${query}”.` : "");
    } catch (error) {
      if (error?.name === "AbortError" || current !== requestId) return;
      close();
      setStatus(
        "City suggestions are unavailable right now — enter coordinates manually.",
      );
    }
  }

  input.addEventListener("input", () => {
    const query = input.value.trim();
    cancelPending();
    if (query.length < MIN_QUERY_LENGTH) {
      close();
      setStatus("");
      return;
    }
    timer = setTimeout(() => runSearch(query), debounceMs);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      cancelPending();
      close();
      setStatus("");
      return;
    }
    if (list.hidden || cities.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlight((activeIndex + 1) % cities.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      highlight((activeIndex - 1 + cities.length) % cities.length);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      select(activeIndex);
    } else if (event.key === "Tab") {
      close();
    }
  });

  input.addEventListener("blur", () => {
    close();
  });

  // Keeps focus on the input so the blur handler does not close the list
  // before the click is delivered.
  list.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  list.addEventListener("click", (event) => {
    const option = event.target.closest("[data-index]");
    if (!option) return;
    select(Number(option.dataset.index));
  });

  return {
    close,
    reset() {
      cancelPending();
      close();
      setStatus("");
    },
  };
}
