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
  await page.goto("/");
});

async function addLocation(page, name = "Miami", lat = "25.7617", lon = "-80.1918") {
  await page.getByLabel("Location name").fill(name);
  await page.getByLabel("Latitude").fill(lat);
  await page.getByLabel("Longitude").fill(lon);
  await page.getByRole("button", { name: "Add location" }).click();
}

test("shows the empty state before any location is added", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "5-Mins" })).toBeVisible();
  await expect(page.getByText("No locations yet.")).toBeVisible();
});

test("adds a location and lists every available alert for it", async ({
  page,
}, testInfo) => {
  await addLocation(page);

  await expect(page.getByRole("heading", { name: "Miami" })).toBeVisible();
  await expect(page.getByText("25.7617, -80.1918")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Alerts · last 7 days" }),
  ).toBeVisible();

  const alerts = page.locator("[data-alert]");
  await expect(alerts).toHaveCount(6);
  await expect(alerts.nth(0)).toContainText("Hurricane Warning");
  await expect(alerts.nth(1)).toContainText("Magnitude 6.2 earthquake");
  await expect(alerts.nth(2)).toContainText("Orange flood alert in Florida");
  await expect(alerts.nth(3)).toContainText("Geomagnetic K-index of 7");
  await expect(alerts.nth(4)).toContainText("Flood Watch");
  await expect(alerts.nth(5)).toContainText("Wildfire in the Everglades");
  await expect(page.getByText("6 alerts in the last 7 days")).toBeVisible();

  await testInfo.attach("locations-and-alerts", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("names every source the alerts came from", async ({ page }) => {
  await addLocation(page);

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
  await addLocation(page);

  await expect(page.locator("[data-alert]")).toHaveCount(6);
  await expect(page.getByText("Red tropical cyclone alert near Tokyo")).toHaveCount(
    0,
  );
  await expect(page.getByText("Iceberg B-09F")).toHaveCount(0);
});

test("asks every source for the last seven days", async ({ page }) => {
  const requested = [];
  page.on("request", (request) => requested.push(request.url()));

  await addLocation(page);
  await expect(page.locator("[data-alert]")).toHaveCount(6);

  const find = (prefix) => requested.find((url) => url.startsWith(prefix));
  const daysBefore = (value) =>
    (Date.now() - new Date(value).getTime()) / DAY;

  const weather = new URL(find("https://api.weather.gov/"));
  expect(weather.searchParams.get("point")).toBe("25.7617,-80.1918");
  expect(daysBefore(weather.searchParams.get("start"))).toBeCloseTo(7, 1);

  const usgs = new URL(find("https://earthquake.usgs.gov/"));
  expect(daysBefore(usgs.searchParams.get("starttime"))).toBeCloseTo(7, 1);

  const gdacs = new URL(find("https://www.gdacs.org/"));
  expect(daysBefore(`${gdacs.searchParams.get("fromdate")}T00:00:00Z`)).toBeLessThan(
    8,
  );

  const eonet = new URL(find("https://eonet.gsfc.nasa.gov/"));
  expect(eonet.searchParams.get("days")).toBe("7");
});

test("adds and removes people to alert for a location", async ({
  page,
}, testInfo) => {
  await addLocation(page);

  await page.getByLabel("Person name").fill("Ada Lovelace");
  await page.getByLabel("Email or phone").fill("ada@example.com");
  await page.getByRole("button", { name: "Add person" }).click();

  await expect(page.locator("[data-person]")).toHaveCount(1);
  await expect(page.getByText("ada@example.com")).toBeVisible();
  await expect(page.locator("[data-alert-status]")).toContainText(
    "1 person to notify",
  );

  await testInfo.attach("people-to-alert", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator("[data-person]")).toHaveCount(0);
  await expect(page.locator("[data-alert-status]")).toContainText(
    "0 people to notify",
  );
  await expect(
    page.getByText("Nobody will be alerted for this location yet."),
  ).toBeVisible();
});

test("keeps locations and people after a reload", async ({ page }) => {
  await addLocation(page);
  await page.getByLabel("Person name").fill("Grace Hopper");
  await page.getByLabel("Email or phone").fill("+1 555 0100");
  await page.getByRole("button", { name: "Add person" }).click();

  await page.reload();

  await expect(page.getByRole("heading", { name: "Miami" })).toBeVisible();
  await expect(page.getByText("Grace Hopper")).toBeVisible();
});

test("keeps a stored location when one person is malformed", async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "5-mins.locations.v1",
      JSON.stringify([
        {
          id: "miami",
          name: "Miami",
          lat: 25.7617,
          lon: -80.1918,
          people: [
            { id: "ada", name: "Ada Lovelace", contact: "ada@example.com" },
            { id: "invalid", name: "", contact: "" },
          ],
        },
      ]),
    );
  });
  await page.reload();

  await expect(page.getByRole("heading", { name: "Miami" })).toBeVisible();
  await expect(page.getByText("Ada Lovelace")).toBeVisible();
  await expect(page.locator("[data-person]")).toHaveCount(1);
});

test("rejects invalid coordinates", async ({ page }) => {
  await addLocation(page, "Nowhere", "999", "0");
  await expect(
    page.getByText("Latitude must be a number between -90 and 90."),
  ).toBeVisible();
  await expect(page.locator("[data-location]")).toHaveCount(0);
});

test("still shows alerts when one source fails", async ({ page }) => {
  await page.route("https://api.weather.gov/**", (route) =>
    route.fulfill({ status: 500, body: "boom" }),
  );
  await addLocation(page);

  await expect(page.locator("[data-alert]")).toHaveCount(4);
  await expect(page.locator("[data-alert-status]")).toContainText(
    "US National Weather Service: Request failed with status 500",
  );
});

test("removes a location", async ({ page }) => {
  await addLocation(page);
  await page.getByRole("button", { name: "Remove location" }).click();
  await expect(page.locator("[data-location]")).toHaveCount(0);
  await expect(page.getByText("No locations yet.")).toBeVisible();
});
