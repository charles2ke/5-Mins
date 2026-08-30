import { expect, test } from "@playwright/test";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** GDACS publishes UTC timestamps without a timezone designator. */
function gdacsTime(date) {
  return date.toISOString().slice(0, 19);
}

/** NOAA SWPC publishes UTC timestamps as "YYYY-MM-DD HH:MM:SS.mmm". */
function spaceWeatherTime(date) {
  return `${date.toISOString().slice(0, 19).replace("T", " ")}.000`;
}

/**
 * Feeds are stubbed relative to the current time so that the seven day window
 * the app asks for keeps the same fixtures in range whenever the suite runs.
 */
function buildFeeds(now = Date.now()) {
  const at = (offset) => new Date(now - offset);

  return {
    weatherAlerts: {
      features: [
        {
          properties: {
            id: "https://api.weather.gov/alerts/urn:oid:test.1",
            event: "Hurricane Warning",
            severity: "Extreme",
            headline: "Hurricane Warning issued for Miami-Dade",
            areaDesc: "Miami-Dade, FL",
            effective: at(12 * HOUR).toISOString(),
            expires: at(-12 * HOUR).toISOString(),
          },
        },
        {
          properties: {
            id: "https://api.weather.gov/alerts/urn:oid:test.2",
            event: "Flood Watch",
            severity: "Moderate",
            headline: "Flood Watch in effect",
            areaDesc: "Miami-Dade, FL",
            effective: at(14 * HOUR).toISOString(),
            expires: at(-4 * HOUR).toISOString(),
          },
        },
      ],
    },
    earthquakes: {
      features: [
        {
          id: "us-test-quake",
          properties: {
            mag: 6.2,
            place: "40 km SW of Miami, Florida",
            time: at(20 * HOUR).getTime(),
            title: "M 6.2 - 40 km SW of Miami, Florida",
            url: "https://earthquake.usgs.gov/earthquakes/eventpage/us-test-quake",
          },
        },
      ],
    },
    gdacsEvents: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-80.3, 25.5] },
          properties: {
            eventtype: "FL",
            eventid: 1234567,
            alertlevel: "Orange",
            name: "Orange flood alert in Florida",
            country: "United States",
            fromdate: gdacsTime(at(2 * DAY)),
            todate: gdacsTime(at(DAY)),
            url: {
              report:
                "https://www.gdacs.org/report.aspx?eventid=1234567&eventtype=FL",
            },
          },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [139.7, 35.7] },
          properties: {
            eventtype: "TC",
            eventid: 7654321,
            alertlevel: "Red",
            name: "Red tropical cyclone alert near Tokyo",
            country: "Japan",
            fromdate: gdacsTime(at(DAY)),
            todate: gdacsTime(at(0)),
            url: { report: "https://www.gdacs.org/report.aspx?eventid=7654321" },
          },
        },
      ],
    },
    naturalEvents: {
      events: [
        {
          id: "EONET_1001",
          title: "Wildfire in the Everglades",
          closed: null,
          categories: [{ id: "wildfires", title: "Wildfires" }],
          sources: [
            { id: "InciWeb", url: "https://inciweb.wildfire.gov/incident/1001/" },
          ],
          geometry: [
            {
              date: at(3 * DAY).toISOString(),
              type: "Point",
              coordinates: [-81.5, 25.9],
            },
            {
              date: at(6 * HOUR).toISOString(),
              type: "Point",
              coordinates: [-81, 26.5],
            },
          ],
        },
        {
          id: "EONET_2002",
          title: "Iceberg B-09F",
          closed: null,
          categories: [{ id: "seaLakeIce", title: "Sea and Lake Ice" }],
          sources: [],
          geometry: [
            {
              date: at(DAY).toISOString(),
              type: "Point",
              coordinates: [150, -66],
            },
          ],
        },
      ],
    },
    spaceWeather: [
      {
        product_id: "K07A",
        issue_datetime: spaceWeatherTime(at(3 * DAY)),
        message:
          "Space Weather Message Code: ALTK07\r\nSerial Number: 42\r\n\r\nALERT: Geomagnetic K-index of 7 (NOAA Scale G3)\r\n",
      },
      {
        product_id: "SUMX01",
        issue_datetime: spaceWeatherTime(at(4 * DAY)),
        message:
          "Space Weather Message Code: SUMX01\r\n\r\nSUMMARY: X-ray Event exceeded M5\r\n",
      },
      {
        product_id: "K05A",
        issue_datetime: spaceWeatherTime(at(30 * DAY)),
        message:
          "Space Weather Message Code: ALTK05\r\n\r\nALERT: Geomagnetic K-index of 5 (NOAA Scale G1)\r\n",
      },
    ],
  };
}

/** Open-Meteo current conditions, stubbed so the card is deterministic. */
function buildWeather(now = Date.now()) {
  return {
    current_units: {
      temperature_2m: "°C",
      wind_speed_10m: "km/h",
      precipitation: "mm",
    },
    current: {
      time: new Date(now).toISOString().slice(0, 16),
      temperature_2m: 28.4,
      apparent_temperature: 31.2,
      relative_humidity_2m: 74,
      precipitation: 1.2,
      weather_code: 95,
      wind_speed_10m: 46.8,
      is_day: 1,
    },
    daily: {
      time: [new Date(now).toISOString().slice(0, 10)],
      temperature_2m_max: [30.1],
      temperature_2m_min: [22.6],
    },
  };
}

const miami = {
  id: "miami",
  name: "Miami home",
  city: "Miami",
  country: "United States",
  lat: 25.7617,
  lon: -80.1918,
  people: [{ id: "ada", name: "Ada Lovelace", contact: "ada@example.com" }],
};

const tokyo = {
  id: "tokyo",
  name: "Tokyo office",
  city: "Tokyo",
  country: "Japan",
  lat: 35.6762,
  lon: 139.6503,
  people: [],
};

test.beforeEach(async ({ page }) => {
  const feeds = buildFeeds();

  await page.route("https://api.weather.gov/**", (route) =>
    route.fulfill({ json: feeds.weatherAlerts }),
  );
  await page.route("https://earthquake.usgs.gov/**", (route) =>
    route.fulfill({ json: feeds.earthquakes }),
  );
  await page.route("https://www.gdacs.org/**", (route) =>
    route.fulfill({ json: feeds.gdacsEvents }),
  );
  await page.route("https://eonet.gsfc.nasa.gov/**", (route) =>
    route.fulfill({ json: feeds.naturalEvents }),
  );
  await page.route("https://services.swpc.noaa.gov/**", (route) =>
    route.fulfill({ json: feeds.spaceWeather }),
  );
  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({ json: buildWeather() }),
  );
});

/** The location cards, without the shared "Worldwide" card. */
function locationCards(page) {
  return page.locator("[data-location]:not([data-worldwide])");
}

async function seed(page, locations) {
  await page.addInitScript((value) => {
    localStorage.setItem("5-mins.locations.v1", value);
  }, JSON.stringify(locations));
}

test("points at the setup page when nothing is watched yet", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "World map of recent alerts" }),
  ).toBeVisible();
  await expect(page.locator("#world-map")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add locations and people on the setup page" }),
  ).toBeVisible();
  await expect(page.locator(".map-marker")).toHaveCount(0);
});

test("maps every recent alert for every location", async ({
  page,
}, testInfo) => {
  await seed(page, [miami, tokyo]);
  await page.goto("/");

  await expect(page.locator(".map-marker")).toHaveCount(2);
  await expect(page.locator("[data-alert]")).toHaveCount(8);
  await expect(page.locator("#map-summary")).toContainText(
    "8 alerts in the last 7 days across 2 locations",
  );

  const cards = locationCards(page);
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Miami, United States");
  await expect(cards.first()).toContainText(
    "5 alerts in the last 7 days · 1 person to notify.",
  );
  await expect(cards.first().locator("[data-alert]").first()).toContainText(
    "Hurricane Warning",
  );
  await expect(page.locator('.map-marker[data-severity="Extreme"]')).toHaveCount(
    2,
  );

  await testInfo.attach("home-world-map", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("filters the map and the list by country", async ({ page }, testInfo) => {
  await seed(page, [miami, tokyo]);
  await page.goto("/");
  await expect(page.locator(".map-marker")).toHaveCount(2);

  await page.getByLabel("Filter by country").selectOption({ label: "Japan" });

  await expect(locationCards(page)).toHaveCount(1);
  await expect(page.locator(".map-marker")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Tokyo office" })).toBeVisible();
  await expect(page.locator("#map-summary")).toContainText(
    "Showing 1 of 2 locations",
  );

  // The city filter only offers cities from the selected country.
  await expect(page.locator("#filter-city option")).toHaveText([
    "All cities",
    "Tokyo",
  ]);

  await testInfo.attach("home-filtered-by-country", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(locationCards(page)).toHaveCount(2);
});

test("filters by city", async ({ page }) => {
  await seed(page, [miami, tokyo]);
  await page.goto("/");
  await expect(page.locator(".map-marker")).toHaveCount(2);

  await page.getByLabel("Filter by city").selectOption({ label: "Miami" });

  await expect(locationCards(page)).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Miami home" })).toBeVisible();
  await expect(page).toHaveURL(/city=miami/);
});

test("restores filters from the url", async ({ page }) => {
  await seed(page, [miami, tokyo]);
  await page.goto("/?country=japan");

  await expect(page.getByLabel("Filter by country")).toHaveValue("japan");
  await expect(locationCards(page)).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Tokyo office" })).toBeVisible();
});

test("says when no location matches the filters", async ({ page }) => {
  await seed(page, [miami]);
  await page.goto("/?country=japan");

  await expect(locationCards(page)).toHaveCount(0);
  await expect(
    page.getByText("No location matches the selected filters."),
  ).toBeVisible();
});

test("names every source the alerts came from", async ({ page }) => {
  await seed(page, [miami]);
  await page.goto("/");

  const sources = page.locator("[data-alert-source]");
  await expect(sources.filter({ hasText: "US National Weather Service" })).toHaveCount(2);
  await expect(
    sources.filter({ hasText: "USGS Earthquake Hazards Program" }),
  ).toHaveCount(1);
  await expect(
    sources.filter({ hasText: "GDACS global disaster alerts" }),
  ).toHaveCount(1);
  await expect(
    sources.filter({ hasText: "NASA EONET natural events" }),
  ).toHaveCount(1);
  await expect(
    sources.filter({ hasText: "NOAA Space Weather Prediction Center" }),
  ).toHaveCount(1);
});

test("leaves out worldwide events that are far from the location", async ({
  page,
}) => {
  await seed(page, [miami]);
  await page.goto("/");

  await expect(page.locator("[data-alert]")).toHaveCount(6);
  await expect(page.getByText("Red tropical cyclone alert near Tokyo")).toHaveCount(
    0,
  );
  await expect(page.getByText("Iceberg B-09F")).toHaveCount(0);
});

test("asks every source for the last seven days", async ({ page }) => {
  const requested = [];
  page.on("request", (request) => requested.push(request.url()));

  await seed(page, [miami]);
  await page.goto("/");
  await expect(page.locator("[data-alert]")).toHaveCount(6);

  const find = (prefix) => requested.find((url) => url.startsWith(prefix));
  const daysBefore = (value) =>
    (Date.now() - new Date(value).getTime()) / DAY;

  const weather = new URL(find("https://api.weather.gov/"));
  expect(weather.searchParams.get("point")).toBe("25.7617,-80.1918");
  expect(daysBefore(weather.searchParams.get("start"))).toBeCloseTo(7, 1);
  // The National Weather Service answers 400 to timestamps with milliseconds.
  for (const field of ["start", "end"]) {
    expect(weather.searchParams.get(field)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    );
  }

  const usgs = new URL(find("https://earthquake.usgs.gov/"));
  expect(daysBefore(usgs.searchParams.get("starttime"))).toBeCloseTo(7, 1);

  const gdacs = new URL(find("https://www.gdacs.org/"));
  const gdacsFrom = daysBefore(`${gdacs.searchParams.get("fromdate")}T00:00:00Z`);
  // GDACS only accepts whole days, so the window starts on the seventh day back.
  expect(gdacsFrom).toBeGreaterThan(6.9);
  expect(gdacsFrom).toBeLessThan(8.1);

  const eonet = new URL(find("https://eonet.gsfc.nasa.gov/"));
  expect(eonet.searchParams.get("days")).toBe("7");
});

test("keeps coordinates within the precision the weather service accepts", async ({
  page,
}) => {
  const requested = [];
  page.on("request", (request) => requested.push(request.url()));

  await seed(page, [{ ...miami, lat: 25.76171234, lon: -80.19187654 }]);
  await page.goto("/");
  await expect(page.locator("[data-alert]")).toHaveCount(6);

  const weather = new URL(
    requested.find((url) => url.startsWith("https://api.weather.gov/")),
  );
  expect(weather.searchParams.get("point")).toBe("25.7617,-80.1919");
});

test("skips the US weather service outside its coverage", async ({ page }) => {
  const requested = [];
  page.on("request", (request) => requested.push(request.url()));

  const dublin = {
    id: "dublin",
    name: "Dublin flat",
    city: "Dublin",
    country: "Ireland",
    lat: 53.3498,
    lon: -6.2603,
    people: [],
  };

  await seed(page, [dublin]);
  await page.goto("/");
  await expect(locationCards(page)).toHaveCount(1);

  // The feed answers 400 for points it cannot resolve to a US forecast zone.
  expect(
    requested.find((url) => url.startsWith("https://api.weather.gov/")),
  ).toBeUndefined();
  await expect(
    locationCards(page).locator("[data-alert-status]"),
  ).not.toContainText("US National Weather Service");
});

test("lists worldwide alerts once, without a weather card", async ({
  page,
}, testInfo) => {
  await seed(page, [miami, tokyo]);
  await page.goto("/");
  await expect(locationCards(page)).toHaveCount(2);

  const worldwide = page.locator("[data-location][data-worldwide]");
  await expect(worldwide).toHaveCount(1);
  await expect(worldwide.getByRole("heading", { name: "Worldwide" })).toBeVisible();
  await expect(worldwide.locator("[data-alert]")).toHaveCount(1);
  await expect(worldwide).toContainText("Geomagnetic K-index of 7");
  await expect(worldwide.locator("[data-weather]")).toHaveCount(0);
  await expect(worldwide).toContainText(
    "1 alert in the last 7 days affecting every location.",
  );

  // The space weather alert is no longer repeated on each location.
  await expect(
    locationCards(page).getByText("Geomagnetic K-index of 7"),
  ).toHaveCount(0);
  await expect(page.locator("#map-summary")).toContainText(
    "Including 1 alert affecting everywhere.",
  );

  await testInfo.attach("home-worldwide-card", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("folds a location card away and remembers it", async ({
  page,
}, testInfo) => {
  await seed(page, [miami, tokyo]);
  await page.goto("/");
  await expect(locationCards(page)).toHaveCount(2);

  const miamiCard = locationCards(page).first();
  const alerts = miamiCard.locator("[data-alerts]");
  await expect(alerts).toBeVisible();

  await miamiCard.getByRole("heading", { name: "Miami home" }).click();
  await expect(alerts).toBeHidden();
  // The summary still says what the folded card holds.
  await expect(miamiCard).toContainText("5 alerts in the last 7 days");
  // Every other card stays open.
  await expect(
    locationCards(page).last().locator("[data-alerts]"),
  ).toBeVisible();

  // Re-rendering the list keeps the card folded.
  await page.getByRole("button", { name: "Refresh alerts" }).click();
  await expect(alerts).toBeHidden();

  await testInfo.attach("home-folded-location", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await miamiCard.getByRole("heading", { name: "Miami home" }).click();
  await expect(alerts).toBeVisible();
});

test("filters by severity", async ({ page }, testInfo) => {
  await seed(page, [miami, tokyo]);
  await page.goto("/");
  await expect(page.locator("[data-alert]")).toHaveCount(8);

  await page.getByLabel("Filter by severity").selectOption(["extreme"]);

  await expect(page).toHaveURL(/severity=extreme/);
  await expect(locationCards(page)).toHaveCount(2);
  await expect(page.locator("[data-alert]")).toHaveCount(2);
  await expect(page.locator('[data-alert]:not([data-severity="Extreme"])')).toHaveCount(
    0,
  );

  await testInfo.attach("home-filtered-by-severity", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.getByLabel("Filter by severity").selectOption(["minor"]);

  // Only Tokyo has no minor alert, so its card and marker drop out.
  await expect(locationCards(page)).toHaveCount(0);
  await expect(page.locator(".map-marker")).toHaveCount(0);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("[data-alert]")).toHaveCount(8);
});

test("filters by several severities at once", async ({ page }, testInfo) => {
  await seed(page, [miami, tokyo]);
  await page.goto("/");
  await expect(page.locator("[data-alert]")).toHaveCount(8);

  await page
    .getByLabel("Filter by severity")
    .selectOption(["extreme", "moderate"]);

  await expect(page).toHaveURL(/severity=extreme%2Cmoderate/);
  await expect(page.locator('[data-alert][data-severity="Extreme"]')).toHaveCount(2);
  await expect(page.locator('[data-alert][data-severity="Moderate"]')).toHaveCount(1);
  await expect(
    page.locator(
      '[data-alert]:not([data-severity="Extreme"]):not([data-severity="Moderate"])',
    ),
  ).toHaveCount(0);

  await testInfo.attach("home-filtered-by-severities", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByLabel("Filter by severity")).toHaveValues([]);
  await expect(page.locator("[data-alert]")).toHaveCount(8);
});

test("restores the severity filter from the url", async ({ page }) => {
  await seed(page, [miami]);
  await page.goto("/?severity=moderate");

  await expect(page.getByLabel("Filter by severity")).toHaveValues(["moderate"]);
  await expect(page.locator("[data-alert]")).toHaveCount(1);
  await expect(page.locator("[data-alert]")).toContainText("Flood Watch");
});

test("restores several severities from the url", async ({ page }) => {
  await seed(page, [miami]);
  await page.goto("/?severity=extreme,moderate");

  await expect(page.getByLabel("Filter by severity")).toHaveValues([
    "extreme",
    "moderate",
  ]);
  await expect(page.locator('[data-alert][data-severity="Extreme"]')).toHaveCount(1);
  await expect(page.locator('[data-alert][data-severity="Moderate"]')).toHaveCount(1);
  await expect(
    page.locator(
      '[data-alert]:not([data-severity="Extreme"]):not([data-severity="Moderate"])',
    ),
  ).toHaveCount(0);
});

test("explains empty place filters", async ({ page }) => {
  await seed(page, [{ ...miami, city: "", country: "" }]);
  await page.goto("/");

  await expect(page.getByLabel("Filter by country")).toBeDisabled();
  await expect(
    page.getByText("Add a city or country to a location on the"),
  ).toBeVisible();
});

test("selects a location from its marker on the map", async ({ page }) => {
  await seed(page, [miami, tokyo]);
  await page.goto("/");
  await expect(page.locator(".map-marker")).toHaveCount(2);

  await page.locator('.map-marker[data-marker-id="tokyo"]').click();

  await expect(page.locator("[data-location][data-selected]")).toHaveCount(1);
  await expect(page.locator("[data-location][data-selected]")).toContainText(
    "Tokyo office",
  );
});

test("still shows alerts when one source fails", async ({ page }) => {
  await page.route("https://api.weather.gov/**", (route) =>
    route.fulfill({ status: 500, body: "boom" }),
  );
  await seed(page, [miami]);
  await page.goto("/");

  await expect(page.locator("[data-alert]")).toHaveCount(4);
  await expect(locationCards(page).locator("[data-alert-status]")).toContainText(
    "US National Weather Service: Request failed with status 500",
  );
});

test("refreshes every alert on demand", async ({ page }) => {
  await seed(page, [miami]);
  await page.goto("/");
  await expect(page.locator("[data-alert]")).toHaveCount(6);

  await page.route("https://api.weather.gov/**", (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await page.getByRole("button", { name: "Refresh alerts" }).click();

  await expect(page.locator("[data-alert]")).toHaveCount(4);
});

test("follows the system colour scheme by default", async ({ page }) => {
  await seed(page, [miami]);
  await page.goto("/");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(241, 245, 249)",
  );
  await expect(page.getByRole("switch", { name: "Dark mode" })).toHaveAttribute(
    "aria-checked",
    "false",
  );

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(15, 23, 42)",
  );
  await expect(page.getByRole("switch", { name: "Dark mode" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("switches theme with the toggle and keeps the choice", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await seed(page, [miami, tokyo]);
  await page.goto("/");
  await expect(page.locator("[data-alert]")).toHaveCount(8);

  await testInfo.attach("light-theme", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  const toggle = page.getByRole("switch", { name: "Dark mode" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(15, 23, 42)",
  );

  await testInfo.attach("dark-theme", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(15, 23, 42)",
  );

  await page.getByRole("switch", { name: "Dark mode" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(241, 245, 249)",
  );
});

test("keeps the pinned light theme when the system asks for dark", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.getByRole("switch", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(241, 245, 249)",
  );
});

test("carries the pinned theme over to the setup page", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("switch", { name: "Dark mode" }).click();

  await page.getByRole("link", { name: "Setup", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("switch", { name: "Dark mode" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("shows a live weather card for every location", async ({
  page,
}, testInfo) => {
  await seed(page, [miami, tokyo]);
  await page.goto("/");

  const cards = page.locator("[data-weather]");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAttribute("data-state", "ready");
  await expect(cards.first().locator("[data-weather-temp]")).toHaveText("28°C");
  await expect(cards.first().locator("[data-weather-condition]")).toHaveText(
    "Thunderstorm",
  );
  await expect(cards.first().locator(".weather-icon")).toBeVisible();
  await expect(cards.first().locator("[data-weather-metrics]")).toContainText(
    "31°C",
  );
  await expect(cards.first().locator("[data-weather-metrics]")).toContainText(
    "30°C / 23°C",
  );
  await expect(cards.first().locator("[data-weather-metrics]")).toContainText(
    "47 km/h",
  );
  await expect(cards.first().locator("[data-weather-metrics]")).toContainText(
    "74%",
  );
  // A thunderstorm with strong wind is called out on the card itself.
  await expect(cards.first()).toHaveAttribute("data-rough", "true");

  await testInfo.attach("live-weather-card", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("asks Open-Meteo for the current conditions of each location", async ({
  page,
}) => {
  const requested = [];
  page.on("request", (request) => requested.push(request.url()));

  await seed(page, [miami]);
  await page.goto("/");
  await expect(page.locator("[data-weather]")).toHaveAttribute(
    "data-state",
    "ready",
  );

  const forecast = new URL(
    requested.find((url) => url.startsWith("https://api.open-meteo.com/")),
  );
  expect(forecast.searchParams.get("latitude")).toBe("25.7617");
  expect(forecast.searchParams.get("longitude")).toBe("-80.1918");
  expect(forecast.searchParams.get("current")).toContain("temperature_2m");
});

test("says when the live weather is unavailable", async ({ page }) => {
  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({ status: 503, body: "boom" }),
  );
  await seed(page, [miami]);
  await page.goto("/");

  const card = page.locator("[data-weather]");
  await expect(card).toHaveAttribute("data-state", "error");
  await expect(card).toContainText(
    "Live weather unavailable: Request failed with status 503",
  );
  // The alerts are still listed when only the weather lookup fails.
  await expect(page.locator("[data-alert]")).toHaveCount(6);
});

test("refreshes the live weather on demand", async ({ page }) => {
  await seed(page, [miami]);
  await page.goto("/");
  await expect(page.locator("[data-weather-temp]")).toHaveText("28°C");

  const colder = buildWeather();
  colder.current.temperature_2m = 4.2;
  colder.current.weather_code = 71;
  let fulfillWeather;
  const weatherResponse = new Promise((resolve) => {
    fulfillWeather = resolve;
  });
  await page.unroute("https://api.open-meteo.com/**");
  await page.route("https://api.open-meteo.com/**", async (route) => {
    await weatherResponse;
    await route.fulfill({ json: colder });
  });
  await page.getByRole("button", { name: "Refresh alerts" }).click();

  await expect(page.locator("[data-weather]")).toHaveAttribute(
    "data-state",
    "loading",
  );
  fulfillWeather();
  await expect(page.locator("[data-weather-temp]")).toHaveText("4°C");
  await expect(page.locator("[data-weather-condition]")).toHaveText("Light snow");
});
