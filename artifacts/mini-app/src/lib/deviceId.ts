/**
 * Persistent per-device identifier, used together with IP for multi-account
 * ("twink") detection on the server. Generated once and stored in
 * localStorage so it survives across sessions on the same device/browser.
 *
 * This is intentionally lightweight (no native fingerprinting library) —
 * it identifies "this browser/device storage", not hardware. A user who
 * clears storage or switches browsers gets a new ID; IP-based matching in
 * `checkAndHandleTwinkAccount` (api-server) still catches that case.
 */
const STORAGE_KEY = "tonyx_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (e.g. private mode) — fall back to a
    // session-only id so registration still works, just without persistence.
    return crypto.randomUUID();
  }
}
