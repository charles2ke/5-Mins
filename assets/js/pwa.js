/**
 * Turns the site into an installable app.
 *
 * Registers the service worker that keeps the app usable offline and drives the
 * "Install app" button. Browsers that can install a web app (Chrome, Edge and
 * Samsung Internet on Android, Windows, Linux and macOS) fire
 * `beforeinstallprompt`; Safari on iOS, iPadOS and macOS installs from its own
 * menu instead, which is what the written instructions in the panel cover.
 */
const installPanel = document.querySelector("#install-panel");
const installButton = document.querySelector("#install-app");
const installStatus = document.querySelector("#install-status");

let deferredPrompt = null;

function isInstalled() {
  const standalone = ["standalone", "fullscreen", "minimal-ui"].some(
    (mode) => globalThis.matchMedia?.(`(display-mode: ${mode})`).matches,
  );
  // Safari on iOS and iPadOS reports home-screen apps here instead.
  return standalone || navigator.standalone === true;
}

function setStatus(message) {
  if (installStatus) {
    installStatus.textContent = message;
  }
}

function hideInstallUi() {
  deferredPrompt = null;
  if (installButton) installButton.hidden = true;
  if (installPanel) installPanel.hidden = true;
}

if (isInstalled()) {
  hideInstallUi();
}

globalThis.addEventListener("beforeinstallprompt", (event) => {
  // Keep the browser's own banner away so the button below can trigger it.
  event.preventDefault();
  deferredPrompt = event;
  if (installButton) installButton.hidden = false;
});

installButton?.addEventListener("click", async () => {
  const prompt = deferredPrompt;
  if (!prompt) return;

  deferredPrompt = null;
  installButton.disabled = true;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice?.outcome === "accepted") {
      installButton.hidden = true;
      setStatus("Installing 5-Mins. It will appear with your other apps.");
    } else {
      // A prompt event can only be used once, so drop it rather than re-arming
      // the button with an event whose prompt() would throw. Browsers fire a
      // fresh beforeinstallprompt on a later visit, which shows the button again.
      installButton.hidden = true;
      setStatus(
        "Installation cancelled. You can install 5-Mins from your browser menu, or reload the page to try again.",
      );
    }
  } catch {
    setStatus(
      "This browser could not install 5-Mins. Use its menu to add the app to your home screen or dock.",
    );
  } finally {
    installButton.disabled = false;
  }
});

globalThis.addEventListener("appinstalled", () => {
  hideInstallUi();
});

if (
  "serviceWorker" in navigator &&
  ["http:", "https:"].includes(globalThis.location.protocol)
) {
  globalThis.addEventListener("load", () => {
    navigator.serviceWorker
      // Resolved against this module so the app also works from a subfolder,
      // such as the project page at /5-Mins/. The default scope is that same
      // folder, which covers the whole app.
      .register(new URL("../../sw.js", import.meta.url))
      .catch(() => {
        // Offline support is a bonus: the app keeps working without it.
      });
  });
}
