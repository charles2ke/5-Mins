import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
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
  await page.getByLabel("City").fill(city);
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
