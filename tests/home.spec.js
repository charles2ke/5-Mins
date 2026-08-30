import { expect, test } from "@playwright/test";

const weatherAlerts = {
  features: [
    {
      properties: {
        id: "https://api.weather.gov/alerts/urn:oid:test.1",
        event: "Hurricane Warning",
        severity: "Extreme",
        headline: "Hurricane Warning issued for Miami-Dade",
        areaDesc: "Miami-Dade, FL",
        effective: "2026-08-29T12:00:00Z",
        expires: "2026-08-30T12:00:00Z",
      },
    },
    {
      properties: {
        id: "https://api.weather.gov/alerts/urn:oid:test.2",
        event: "Flood Watch",
        severity: "Moderate",
        headline: "Flood Watch in effect",
        areaDesc: "Miami-Dade, FL",
        effective: "2026-08-29T10:00:00Z",
        expires: "2026-08-30T02:00:00Z",
      },
    },
  ],
};

const earthquakes = {
  features: [
    {
      id: "us-test-quake",
      properties: {
        mag: 6.2,
        place: "40 km SW of Miami, Florida",
        time: Date.parse("2026-08-29T09:00:00Z"),
        title: "M 6.2 - 40 km SW of Miami, Florida",
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/us-test-quake",
      },
    },
  ],
};

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
  await page.route("https://api.weather.gov/**", (route) =>
    route.fulfill({ json: weatherAlerts }),
  );
  await page.route("https://earthquake.usgs.gov/**", (route) =>
    route.fulfill({ json: earthquakes }),
  );
});

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
    page.getByRole("heading", { name: "World map of current alerts" }),
  ).toBeVisible();
  await expect(page.locator("#world-map")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add locations and people on the setup page" }),
  ).toBeVisible();
  await expect(page.locator(".map-marker")).toHaveCount(0);
});

test("maps every current alert for every location", async ({
  page,
}, testInfo) => {
  await seed(page, [miami, tokyo]);
  await page.goto("/");

  await expect(page.locator(".map-marker")).toHaveCount(2);
  await expect(page.locator("[data-alert]")).toHaveCount(6);
  await expect(page.locator("#map-summary")).toContainText(
    "6 active alerts across 2 locations",
  );

  const cards = page.locator("[data-location]");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Miami, United States");
  await expect(cards.first()).toContainText(
    "3 active alerts · 1 person to notify.",
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

  await expect(page.locator("[data-location]")).toHaveCount(1);
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
  await expect(page.locator("[data-location]")).toHaveCount(2);
});

test("filters by city", async ({ page }) => {
  await seed(page, [miami, tokyo]);
  await page.goto("/");
  await expect(page.locator(".map-marker")).toHaveCount(2);

  await page.getByLabel("Filter by city").selectOption({ label: "Miami" });

  await expect(page.locator("[data-location]")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Miami home" })).toBeVisible();
  await expect(page).toHaveURL(/city=miami/);
});

test("restores filters from the url", async ({ page }) => {
  await seed(page, [miami, tokyo]);
  await page.goto("/?country=japan");

  await expect(page.getByLabel("Filter by country")).toHaveValue("japan");
  await expect(page.locator("[data-location]")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Tokyo office" })).toBeVisible();
});

test("says when no location matches the filters", async ({ page }) => {
  await seed(page, [miami]);
  await page.goto("/?country=japan");

  await expect(page.locator("[data-location]")).toHaveCount(0);
  await expect(
    page.getByText("No location matches the selected filters."),
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

  await expect(page.locator("[data-alert]")).toHaveCount(1);
  await expect(page.locator("[data-alert-status]")).toContainText(
    "US National Weather Service: Request failed with status 500",
  );
});

test("refreshes every alert on demand", async ({ page }) => {
  await seed(page, [miami]);
  await page.goto("/");
  await expect(page.locator("[data-alert]")).toHaveCount(3);

  await page.route("https://api.weather.gov/**", (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await page.getByRole("button", { name: "Refresh alerts" }).click();

  await expect(page.locator("[data-alert]")).toHaveCount(1);
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
  await expect(page.locator("[data-alert]")).toHaveCount(6);

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

  await page.getByRole("link", { name: "Setup" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("switch", { name: "Dark mode" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
