import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://api.weather.gov/**", (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await page.route("https://earthquake.usgs.gov/**", (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await page.route("https://www.gdacs.org/**", (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await page.route("https://eonet.gsfc.nasa.gov/**", (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.route("https://services.swpc.noaa.gov/**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("https://geocoding-api.open-meteo.com/**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({ json: { current: {}, daily: {} } }),
  );
});

test("lists every alert feed on its own page", async ({ page }, testInfo) => {
  await page.goto("/sources.html");

  await expect(
    page.getByRole("heading", { name: "Where the alerts come from" }),
  ).toBeVisible();

  await expect(page.locator(".sources li")).toContainText([
    "US National Weather Service",
    "USGS Earthquake Hazards Program",
    "GDACS global disaster alerts",
    "NASA EONET natural events",
    "NOAA Space Weather Prediction Center",
  ]);

  await testInfo.attach("sources-page", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("is reachable from the home page nav", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".sources")).toHaveCount(0);

  await page.getByRole("link", { name: "Sources", exact: true }).click();

  await expect(page).toHaveURL(/sources\.html$/);
  await expect(
    page.getByRole("heading", { name: "Where the alerts come from" }),
  ).toBeVisible();
});
