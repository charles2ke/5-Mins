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

async function waitForServiceWorker(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        });
      });
    }
  });
}

test("describes the app in a manifest with icons for every platform", async ({
  page,
  request,
}) => {
  await page.goto("/");

  const href = await page
    .locator("link[rel=manifest]")
    .getAttribute("href", { timeout: 5000 });
  expect(href).toBe("manifest.webmanifest");

  const response = await request.get(`/${href}`);
  expect(response.ok()).toBeTruthy();
  const manifest = JSON.parse(await response.text());

  expect(manifest.name).toContain("5-Mins");
  expect(manifest.short_name).toBe("5-Mins");
  expect(manifest.start_url).toBe("./");
  expect(manifest.scope).toBe("./");
  expect(manifest.display).toBe("standalone");
  expect(manifest.theme_color).toBe("#0f172a");
  expect(manifest.background_color).toBe("#0f172a");

  const sizes = manifest.icons.map((icon) => icon.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);

  for (const icon of manifest.icons) {
    const iconResponse = await request.get(`/${icon.src}`);
    expect(iconResponse.ok(), `${icon.src} is served`).toBeTruthy();
    expect(iconResponse.headers()["content-type"]).toContain("image/");
  }
});

test("carries the meta tags iOS, iPadOS and macOS need", async ({
  page,
  request,
}) => {
  await page.goto("/");

  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /viewport-fit=cover/,
  );
  await expect(
    page.locator(
      'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]',
    ),
  ).toHaveAttribute("content", "#0f172a");
  await expect(
    page.locator(
      'meta[name="theme-color"][media="(prefers-color-scheme: light)"]',
    ),
  ).toHaveAttribute("content", "#f1f5f9");
  await expect(
    page.locator('meta[name="apple-mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");
  await expect(
    page.locator('meta[name="apple-mobile-web-app-title"]'),
  ).toHaveAttribute("content", "5-Mins");

  const touchIcon = await page
    .locator("link[rel=apple-touch-icon]")
    .getAttribute("href");
  const iconResponse = await request.get(`/${touchIcon}`);
  expect(iconResponse.ok()).toBeTruthy();
});

test("registers a service worker and still opens when offline", async ({
  page,
  context,
}, testInfo) => {
  await page.goto("/");
  await waitForServiceWorker(page);

  await expect(page.getByRole("heading", { name: "5-Mins" })).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole("heading", { name: "5-Mins" })).toBeVisible();
  await expect(
    page.getByText("No locations yet. Add them on the setup page to see them on the map."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Setup", exact: true }),
  ).toBeVisible();

  await testInfo.attach("offline-app-shell", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await context.setOffline(false);
});

test("keeps using the live alert feeds instead of cached alerts", async ({
  page,
}) => {
  await page.goto("/");
  await waitForServiceWorker(page);

  await page.route("https://api.weather.gov/**", (route) =>
    route.fulfill({
      json: {
        features: [
          {
            properties: {
              id: "urn:oid:test.live",
              event: "Tsunami Warning",
              severity: "Extreme",
              headline: "Tsunami Warning issued",
              areaDesc: "Miami-Dade, FL",
            },
          },
        ],
      },
    }),
  );

  await page.goto("/setup.html");
  await page.getByLabel("Location name").fill("Miami");
  await page.getByLabel("Latitude").fill("25.7617");
  await page.getByLabel("Longitude").fill("-80.1918");
  await page.getByRole("button", { name: "Add location" }).click();

  await page.goto("/");
  await expect(page.locator("[data-alert]")).toHaveCount(1);
  await expect(page.locator("[data-alert]")).toContainText("Tsunami Warning");
});

test("offers an install button when the browser can install the app", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  const installButton = page.getByRole("button", { name: "Install app" });
  await expect(installButton).toBeHidden();

  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt");
    window.__installPrompted = false;
    event.prompt = () => {
      window.__installPrompted = true;
      return Promise.resolve();
    };
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(event);
  });

  await expect(installButton).toBeVisible();

  await testInfo.attach("install-panel", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await installButton.click();

  await expect
    .poll(() => page.evaluate(() => window.__installPrompted))
    .toBe(true);
  await expect(page.locator("#install-status")).toContainText(
    "Installing 5-Mins",
  );
  await expect(installButton).toBeHidden();
});

test("lists how to install on each platform", async ({ page }) => {
  await page.goto("/");

  const platforms = page.locator("#install-panel .platforms li");
  await expect(platforms).toContainText([
    "Android",
    "iPhone and iPad",
    "Windows and Linux",
    "macOS",
  ]);
});

test("hides the install help once the app runs from the home screen", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {
      value: true,
      configurable: true,
    });
  });
  await page.goto("/");

  await expect(page.locator("#install-panel")).toBeHidden();
  await expect(page.getByRole("heading", { name: "5-Mins" })).toBeVisible();
});
