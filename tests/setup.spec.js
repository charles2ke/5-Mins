import { expect, test } from "@playwright/test";

const cityMatches = {
  results: [
    {
      id: 4164138,
      name: "Miami",
      latitude: 25.77427,
      longitude: -80.19366,
      country: "United States",
      admin1: "Florida",
    },
    {
      id: 4996718,
      name: "Miami Beach",
      latitude: 25.79065,
      longitude: -80.13005,
      country: "United States",
      admin1: "Florida",
    },
    {
      id: 3441894,
      name: "Miami",
      latitude: -34.86667,
      longitude: -56.16667,
      country: "Uruguay",
      admin1: "Montevideo",
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("https://geocoding-api.open-meteo.com/**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.goto("/setup.html");
});

async function addLocation(
  page,
  {
    name = "Miami",
    city = "Miami",
    country = "United States",
    lat = "25.7617",
    lon = "-80.1918",
  } = {},
) {
  await page.getByLabel("Location name").fill(name);
  // "City" alone also matches the "City suggestions" listbox.
  await page.getByLabel("City", { exact: true }).fill(city);
  await page.getByLabel("Country").fill(country);
  await page.getByLabel("Latitude").fill(lat);
  await page.getByLabel("Longitude").fill(lon);
  await page.getByRole("button", { name: "Add location" }).click();
}

test("shows the empty state before any location is added", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "5-Mins" })).toBeVisible();
  await expect(page.getByText("No locations yet.")).toBeVisible();
});

test("adds a location with its city and country", async ({ page }, testInfo) => {
  await addLocation(page);

  await expect(page.getByRole("heading", { name: "Miami" })).toBeVisible();
  await expect(page.getByText("Miami, United States")).toBeVisible();
  await expect(page.getByText("25.7617, -80.1918")).toBeVisible();

  await testInfo.attach("setup-page", {
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

  await testInfo.attach("people-to-alert", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator("[data-person]")).toHaveCount(0);
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
          city: "Miami",
          country: "United States",
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

test("keeps a location saved before city and country existed", async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "5-mins.locations.v1",
      JSON.stringify([
        { id: "legacy", name: "Cabin", lat: 45.5, lon: -122.6, people: [] },
      ]),
    );
  });
  await page.reload();

  await expect(page.getByRole("heading", { name: "Cabin" })).toBeVisible();
  await expect(page.locator("[data-location-place]")).toBeHidden();
});

test("rejects invalid coordinates", async ({ page }) => {
  await addLocation(page, { name: "Nowhere", lat: "999", lon: "0" });
  await expect(
    page.getByText("Latitude must be a number between -90 and 90."),
  ).toBeVisible();
  await expect(page.locator("[data-location]")).toHaveCount(0);
});

test("removes a location", async ({ page }) => {
  await addLocation(page);
  await page.getByRole("button", { name: "Remove location" }).click();
  await expect(page.locator("[data-location]")).toHaveCount(0);
  await expect(page.getByText("No locations yet.")).toBeVisible();
});

test("links back to the home page map", async ({ page }) => {
  await page.getByRole("link", { name: "Home" }).click();
  await expect(
    page.getByRole("heading", { name: "World map of current alerts" }),
  ).toBeVisible();
});

async function stubCities(page, body = cityMatches, status = 200) {
  await page.route("https://geocoding-api.open-meteo.com/**", (route) =>
    status === 200
      ? route.fulfill({ json: body })
      : route.fulfill({ status, body: "boom" }),
  );
}

test("suggests known cities and fills in their coordinates", async ({
  page,
}, testInfo) => {
  await stubCities(page);

  const request = page.waitForRequest(/geocoding-api\.open-meteo\.com/);
  await page.getByLabel("Location name").fill("Miam");
  expect(new URL((await request).url()).searchParams.get("name")).toBe("Miam");

  const options = page.getByRole("option");
  await expect(options).toHaveCount(3);
  await expect(options.first()).toContainText("Miami");
  await expect(options.first()).toContainText("Florida, United States");

  await testInfo.attach("city-autocomplete", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await options.first().click();

  await expect(page.getByLabel("Location name")).toHaveValue(
    "Miami, Florida, United States",
  );
  await expect(page.getByLabel("Latitude")).toHaveValue("25.7743");
  await expect(page.getByLabel("Longitude")).toHaveValue("-80.1937");
  await expect(page.getByLabel("City", { exact: true })).toHaveValue("Miami");
  await expect(page.getByLabel("Country")).toHaveValue("United States");
  await expect(page.getByRole("option")).toHaveCount(0);

  await page.getByRole("button", { name: "Add location" }).click();
  await expect(
    page.getByRole("heading", { name: "Miami, Florida, United States" }),
  ).toBeVisible();
  await expect(page.getByText("25.7743, -80.1937")).toBeVisible();
  await expect(page.locator("[data-location-place]")).toHaveText(
    "Miami, United States",
  );
});

test("picks a city suggestion with the keyboard", async ({ page }) => {
  await stubCities(page);

  await page.getByLabel("Location name").fill("Miam");
  await expect(page.getByRole("option")).toHaveCount(3);

  await page.getByLabel("Location name").press("ArrowDown");
  await page.getByLabel("Location name").press("ArrowDown");
  await expect(page.getByRole("option").nth(1)).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByLabel("Location name").press("Enter");
  await expect(page.getByLabel("Location name")).toHaveValue(
    "Miami Beach, Florida, United States",
  );
  await expect(page.getByLabel("Latitude")).toHaveValue("25.7906");
  await expect(page.locator("[data-location]")).toHaveCount(0);
});

test("says when no city matches and still allows a manual location", async ({
  page,
}) => {
  await stubCities(page, { results: [] });

  await page.getByLabel("Location name").fill("Zzzz");
  await expect(page.getByText("No cities match “Zzzz”.")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);

  await page.getByLabel("Latitude").fill("25.7617");
  await page.getByLabel("Longitude").fill("-80.1918");
  await page.getByRole("button", { name: "Add location" }).click();
  await expect(page.getByRole("heading", { name: "Zzzz" })).toBeVisible();
});

test("keeps the form usable when the city lookup fails", async ({ page }) => {
  await stubCities(page, null, 500);

  await page.getByLabel("Location name").fill("Miami");
  await expect(
    page.getByText("City suggestions are unavailable right now"),
  ).toBeVisible();

  await page.getByLabel("Latitude").fill("25.7617");
  await page.getByLabel("Longitude").fill("-80.1918");
  await page.getByRole("button", { name: "Add location" }).click();
  await expect(page.getByRole("heading", { name: "Miami" })).toBeVisible();
});
