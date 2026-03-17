/**
 * theme-store.js
 *
 * localStorage-backed theme state with system preference detection.
 * Supports "light", "dark", and "system" (auto) modes.
 */

const STORAGE_KEY = "maple-theme";

/** @type {"light" | "dark" | "system"} */
let _preference = "system";

/** @type {"light" | "dark"} */
let _resolved = "light";

/** @type {Array<(theme: "light" | "dark") => void>} */
const _subscribers = [];

/**
 * Initialize theme from localStorage or system preference.
 * Must be called early (before first paint ideally).
 */
export function initTheme() {
  // Read stored preference
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      _preference = stored;
    }
  } catch {
    // localStorage unavailable
  }

  _resolved = resolveTheme(_preference);
  applyTheme(_resolved);

  // Listen for system preference changes
  if (typeof window !== "undefined" && window.matchMedia) {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", () => {
      if (_preference === "system") {
        _resolved = resolveTheme("system");
        applyTheme(_resolved);
        notify();
      }
    });
  }
}

/**
 * Get the current theme preference.
 * @returns {"light" | "dark" | "system"}
 */
export function getThemePreference() {
  return _preference;
}

/**
 * Get the resolved (effective) theme.
 * @returns {"light" | "dark"}
 */
export function getResolvedTheme() {
  return _resolved;
}

/**
 * Set the theme preference.
 * @param {"light" | "dark" | "system"} preference
 */
export function setTheme(preference) {
  if (preference !== "light" && preference !== "dark" && preference !== "system") return;

  _preference = preference;
  _resolved = resolveTheme(preference);

  // Persist
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // localStorage unavailable
  }

  applyTheme(_resolved);
  notify();
}

/**
 * Toggle between light and dark (skips system).
 */
export function toggleTheme() {
  setTheme(_resolved === "light" ? "dark" : "light");
}

/**
 * Cycle through: system -> light -> dark -> system
 */
export function cycleTheme() {
  if (_preference === "system") setTheme("light");
  else if (_preference === "light") setTheme("dark");
  else setTheme("system");
}

/**
 * Subscribe to theme changes.
 * @param {(theme: "light" | "dark") => void} callback
 * @returns {() => void} unsubscribe function
 */
export function onThemeChange(callback) {
  _subscribers.push(callback);
  return () => {
    const idx = _subscribers.indexOf(callback);
    if (idx >= 0) _subscribers.splice(idx, 1);
  };
}

/**
 * Check if dark mode is active.
 * @returns {boolean}
 */
export function isDark() {
  return _resolved === "dark";
}

// ── Internal ────────────────────────────────────────────────────────────

function resolveTheme(preference) {
  if (preference === "light" || preference === "dark") return preference;
  // System preference
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function applyTheme(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

function notify() {
  for (const cb of _subscribers) {
    try { cb(_resolved); } catch { /* ignore */ }
  }
}
