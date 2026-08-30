import { LAND_PATH } from "./world-land.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Size of the map coordinate system (equirectangular, 2:1). */
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 500;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Projects WGS84 coordinates onto the map's equirectangular viewBox.
 */
export function project(lat, lon) {
  const safeLat = clamp(Number(lat) || 0, -90, 90);
  const safeLon = clamp(Number(lon) || 0, -180, 180);
  return {
    x: ((safeLon + 180) / 360) * MAP_WIDTH,
    y: ((90 - safeLat) / 180) * MAP_HEIGHT,
  };
}

/**
 * Draws the land outlines into the `<path>` element of a map.
 */
export function drawLand(pathElement) {
  pathElement.setAttribute("d", LAND_PATH);
}

/**
 * Draws latitude/longitude guide lines every `step` degrees.
 */
export function drawGraticule(group, { step = 30 } = {}) {
  group.textContent = "";

  const line = (x1, y1, x2, y2, major) => {
    const node = document.createElementNS(SVG_NS, "line");
    node.setAttribute("x1", String(x1));
    node.setAttribute("y1", String(y1));
    node.setAttribute("x2", String(x2));
    node.setAttribute("y2", String(y2));
    if (major) {
      node.dataset.major = "true";
    }
    group.append(node);
  };

  for (let lon = -180 + step; lon < 180; lon += step) {
    const { x } = project(0, lon);
    line(x, 0, x, MAP_HEIGHT, lon === 0);
  }
  for (let lat = -90 + step; lat < 90; lat += step) {
    const { y } = project(lat, 0);
    line(0, y, MAP_WIDTH, y, lat === 0);
  }
}

function markerRadius(alertCount) {
  if (alertCount <= 0) return 4;
  return Math.min(6 + Math.sqrt(alertCount) * 2.2, 14);
}

/**
 * Renders one marker per watched location.
 *
 * `markers` entries look like:
 * `{ id, label, lat, lon, alertCount, severity, selected }`.
 */
export function drawMarkers(group, markers, { onSelect } = {}) {
  group.textContent = "";

  for (const marker of markers) {
    const { x, y } = project(marker.lat, marker.lon);
    const node = document.createElementNS(SVG_NS, "g");
    node.setAttribute("class", "map-marker");
    node.dataset.markerId = marker.id;
    node.dataset.severity = marker.severity;
    node.dataset.alerts = String(marker.alertCount);
    if (marker.selected) {
      node.dataset.selected = "true";
    }
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", marker.label);

    if (marker.alertCount > 0) {
      const halo = document.createElementNS(SVG_NS, "circle");
      halo.setAttribute("class", "map-marker-halo");
      halo.setAttribute("cx", String(x));
      halo.setAttribute("cy", String(y));
      halo.setAttribute("r", String(markerRadius(marker.alertCount) + 5));
      node.append(halo);
    }

    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("class", "map-marker-dot");
    dot.setAttribute("cx", String(x));
    dot.setAttribute("cy", String(y));
    dot.setAttribute("r", String(markerRadius(marker.alertCount)));
    node.append(dot);

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = marker.label;
    node.append(title);

    if (typeof onSelect === "function") {
      node.addEventListener("click", () => onSelect(marker.id));
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(marker.id);
        }
      });
    }

    group.append(node);
  }
}
