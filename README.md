# 5-Mins

Provide users an alert before a catastrophe or disaster.

5-Mins is a small static website where you add the **locations** you care about
and the **people** who must be warned about each of them. For every location the
site pulls in all the disaster and catastrophe alerts that are currently
available for those coordinates.

**Live site:** https://charles2ke.github.io/5-Mins/ (published automatically from
`main`).

## Features

- Add any number of locations by name and coordinates, or use the browser's
  "Use my location" button.
- Add and remove the people who should be alerted for each location, with an
  email address or phone number for each.
- See every active alert for a location, sorted with the most severe first and
  colour coded by severity (Extreme, Severe, Moderate, Minor).
- Refresh all alerts on demand.
- Dark and light themes: the site follows the system colour scheme, and the
  header toggle pins a theme that is remembered on the next visit.
- Locations and people are stored in the browser's `localStorage`, so they
  survive reloads and never leave your device.

## Alert sources

| Source | Coverage |
| --- | --- |
| [US National Weather Service](https://www.weather.gov/documentation/services-web-api) | All active warnings, watches and advisories for a US point: hurricanes, tornadoes, floods, wildfires, tsunamis, winter storms, extreme heat and more. |
| [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/fdsnws/event/1/) | Earthquakes of magnitude 4.5 or greater within 300 km of the location in the last 24 hours, worldwide. |

Both feeds are public and need no API key. If one feed is unavailable, the
alerts from the other are still shown along with an explanation.

## Running locally

The site is plain HTML, CSS and JavaScript modules — no build step. Serve the
repository root with any static server:

```bash
npm start          # python3 -m http.server 4173
# then open http://127.0.0.1:4173
```

## Tests

End-to-end tests use [Playwright](https://playwright.dev/) with the alert feeds
stubbed out, so they run offline:

```bash
npm install
npx playwright install --with-deps chromium
npm test
```

The `Tests` workflow runs them on every push and pull request and uploads the
Playwright HTML report (including screenshots) as a build artifact.

## Deployment

The `Deploy to GitHub Pages` workflow publishes the site to GitHub Pages on
every push to `main`. Enable it once in **Settings → Pages** by selecting
**GitHub Actions** as the source.

## Disclaimer

5-Mins is an informational tool and does not replace official warning systems.
Always follow the instructions of your local emergency services.
