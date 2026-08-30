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

test.beforeEach(async ({ page }) => {
  await page.route("https://api.weather.gov/**", (route) =>
    route.fulfill({ json: weatherAlerts }),
  );
  await page.route("https://earthquake.usgs.gov/**", (route) =>
    route.fulfill({ json: earthquakes }),
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

  const alerts = page.locator("[data-alert]");
  await expect(alerts).toHaveCount(3);
  await expect(alerts.first()).toContainText("Hurricane Warning");
  await expect(alerts.nth(1)).toContainText("Magnitude 6.2 earthquake");
  await expect(alerts.nth(2)).toContainText("Flood Watch");
  await expect(page.getByText("3 active alerts")).toBeVisible();

  await testInfo.attach("locations-and-alerts", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
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

  await expect(page.locator("[data-alert]")).toHaveCount(1);
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

async function addPerson(page, name = "Ada Lovelace", contact = "ada@example.com") {
  await page.getByLabel("Person name").fill(name);
  await page.getByLabel("Email or phone").fill(contact);
  await page.getByRole("button", { name: "Add person" }).click();
}

test("lets people mark themselves safe while an alert is active", async ({
  page,
}, testInfo) => {
  await addLocation(page);
  await addPerson(page);
  await addPerson(page, "Grace Hopper", "+1 555 0100");

  await expect(page.locator("[data-safety-summary]")).toContainText(
    "Safety check-in: 0 of 2 marked safe · 2 still to confirm.",
  );

  await page.getByRole("button", { name: "I'm safe: Ada Lovelace" }).click();

  await expect(page.locator('[data-person][data-safe="true"]')).toHaveCount(1);
  await expect(page.locator("[data-person-safety]").first()).toContainText(
    "Safe ·",
  );
  await expect(page.locator("[data-safety-summary]")).toContainText(
    "Safety check-in: 1 of 2 marked safe · 1 still to confirm.",
  );
  await expect(page.locator("[data-alert-status]")).toContainText(
    "1 marked safe.",
  );

  await testInfo.attach("marked-safe", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.getByRole("button", { name: "I'm safe: Grace Hopper" }).click();
  await expect(page.locator("[data-safety-summary]")).toContainText(
    "Safety check-in: everyone (2) marked safe.",
  );

  await page
    .getByRole("button", { name: "Undo safe: Ada Lovelace" })
    .click();
  await expect(page.locator('[data-person][data-safe="true"]')).toHaveCount(1);
  await expect(page.locator("[data-safety-summary]")).toContainText(
    "1 of 2 marked safe",
  );
});

test("keeps a safe check-in after a reload", async ({ page }) => {
  await addLocation(page);
  await addPerson(page);
  await page.getByRole("button", { name: "I'm safe: Ada Lovelace" }).click();

  await page.reload();

  await expect(page.locator('[data-person][data-safe="true"]')).toHaveCount(1);
  await expect(page.locator("[data-safety-summary]")).toContainText(
    "everyone (1) marked safe",
  );
});

test("does not offer a safety check-in without an active alert", async ({
  page,
}) => {
  await page.route("https://api.weather.gov/**", (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await page.route("https://earthquake.usgs.gov/**", (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await addLocation(page);
  await addPerson(page);

  await expect(page.locator("[data-alert-status]")).toContainText(
    "No active alerts for this location.",
  );
  await expect(
    page.getByRole("button", { name: "I'm safe: Ada Lovelace" }),
  ).toBeHidden();
  await expect(page.locator("[data-safety-summary]")).toBeHidden();
});

test("asks everyone to check in again when a new alert is triggered", async ({
  page,
}) => {
  await addLocation(page);
  await addPerson(page);
  await page.getByRole("button", { name: "I'm safe: Ada Lovelace" }).click();
  await expect(page.locator('[data-person][data-safe="true"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Refresh alerts" }).click();
  await expect(page.locator("[data-alert-status]")).toContainText(
    "1 marked safe.",
  );

  await page.route("https://api.weather.gov/**", (route) =>
    route.fulfill({
      json: {
        features: [
          {
            properties: {
              id: "https://api.weather.gov/alerts/urn:oid:test.3",
              event: "Tornado Warning",
              severity: "Extreme",
              headline: "Tornado Warning issued for Miami-Dade",
              areaDesc: "Miami-Dade, FL",
              effective: "2026-08-30T01:00:00Z",
              expires: "2026-08-30T03:00:00Z",
            },
          },
        ],
      },
    }),
  );
  await page.getByRole("button", { name: "Refresh alerts" }).click();

  await expect(page.locator("[data-alert]").first()).toContainText(
    "Tornado Warning",
  );
  await expect(page.locator('[data-person][data-safe="true"]')).toHaveCount(0);
  await expect(page.locator("[data-safety-summary]")).toContainText(
    "0 of 1 marked safe",
  );
});
