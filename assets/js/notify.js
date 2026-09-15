/**
 * Turns the alerts of a location into a warning the reader can actually send
 * with the apps already on the device: email, SMS, WhatsApp or the system
 * share sheet. No account, API key or server is involved — every integration
 * is a link handed to the operating system.
 */

/** Alerts listed in the warning; the rest are summarised as "and N more". */
const MAX_LISTED_ALERTS = 3;

/** True when the contact looks like an email address. */
function isEmail(contact) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
}

/**
 * The digits of a phone number, keeping a leading "+" so international
 * numbers survive. Returns "" when the contact holds no usable digits.
 */
export function phoneDigits(contact) {
  const trimmed = String(contact ?? "").trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `${plus}${digits}` : "";
}

/**
 * How a person can be warned: "email", "phone", or "unknown" when the contact
 * is neither (a nickname, a handle, an address).
 */
export function contactChannel(contact) {
  const value = String(contact ?? "").trim();
  if (!value) return "unknown";
  if (isEmail(value)) return "email";
  // A phone number may carry spaces, dashes, brackets or a leading "+".
  if (/^\+?[\d\s()./-]+$/.test(value) && phoneDigits(value).replace("+", "").length >= 5) {
    return "phone";
  }
  return "unknown";
}

function formatWhen(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function describeAlert(alert) {
  const parts = [`${alert.severity} · ${alert.event} (${alert.source})`];
  if (alert.headline && alert.headline !== alert.event) {
    parts.push(alert.headline);
  }
  const until = formatWhen(alert.expires);
  if (until) {
    parts.push(`Until ${until}`);
  }
  if (alert.url) {
    parts.push(alert.url);
  }
  return parts.join(" — ");
}

/**
 * Builds the warning for a location.
 *
 * Returns `{ subject, body, text }`: `subject` and `body` for email, `text`
 * (subject and body together) for SMS, WhatsApp, the share sheet and the
 * clipboard. Returns null when there is nothing to warn about.
 */
export function buildWarning(location, alerts, { place = "", link = "" } = {}) {
  if (!Array.isArray(alerts) || alerts.length === 0) return null;

  const where = place ? `${location.name} (${place})` : location.name;
  const worst = alerts[0];
  const subject = `5-Mins alert: ${worst.severity} — ${worst.event} at ${where}`;

  const lines = [`${alerts.length === 1 ? "An alert" : `${alerts.length} alerts`} for ${where}:`, ""];
  for (const alert of alerts.slice(0, MAX_LISTED_ALERTS)) {
    lines.push(`- ${describeAlert(alert)}`);
  }
  const rest = alerts.length - MAX_LISTED_ALERTS;
  if (rest > 0) {
    lines.push(`- and ${rest} more alert${rest === 1 ? "" : "s"}.`);
  }
  lines.push("", "Please reply to confirm you are safe.");
  if (link) {
    lines.push(link);
  }

  const body = lines.join("\n");
  return { subject, body, text: `${subject}\n\n${body}` };
}

/**
 * The link that warns `person` through the app that handles their contact,
 * or null when the contact cannot be messaged. `channel` picks the app:
 * "email" (mailto:), "sms" (sms:) or "whatsapp" (wa.me).
 */
export function warningLink(person, warning, channel) {
  if (!warning) return null;
  const contact = String(person?.contact ?? "").trim();
  if (!contact) return null;

  if (channel === "email") {
    if (contactChannel(contact) !== "email") return null;
    // Encoded by hand rather than with URLSearchParams: mail clients read a
    // "+" in a mailto query as a literal plus, not as a space.
    const subject = encodeURIComponent(warning.subject);
    const body = encodeURIComponent(warning.body);
    return `mailto:${encodeURIComponent(contact)}?subject=${subject}&body=${body}`;
  }

  const digits = contactChannel(contact) === "phone" ? phoneDigits(contact) : "";
  if (!digits) return null;

  if (channel === "sms") {
    // "?&body=" is the form both iOS and Android accept.
    return `sms:${digits}?&body=${encodeURIComponent(warning.text)}`;
  }
  if (channel === "whatsapp") {
    // wa.me only takes digits, without the leading "+".
    return `https://wa.me/${digits.replace("+", "")}?text=${encodeURIComponent(warning.text)}`;
  }
  return null;
}

/**
 * Hands the warning to the system share sheet, falling back to the clipboard
 * when the browser has no Web Share API. Resolves with "shared", "copied",
 * "cancelled" or "unavailable" so the caller can tell the reader what
 * happened.
 */
export async function shareWarning(warning, target = globalThis.navigator) {
  if (!warning) return "unavailable";

  if (target && typeof target.share === "function") {
    try {
      await target.share({ title: warning.subject, text: warning.text });
      return "shared";
    } catch (error) {
      // The reader closing the share sheet is not a failure.
      if (error && error.name === "AbortError") return "cancelled";
    }
  }

  if (target && target.clipboard && typeof target.clipboard.writeText === "function") {
    try {
      await target.clipboard.writeText(warning.text);
      return "copied";
    } catch {
      return "unavailable";
    }
  }
  return "unavailable";
}
