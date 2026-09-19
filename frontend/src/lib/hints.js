// First-visit hints: which ones this visitor has dismissed, remembered in the
// browser (per visitor, not per Order), and the flag that switches them off.
export const HINT_STEPS = ["options", "findings", "approval"];

const STORAGE_KEY = "hurrah.hints.seen";
const listeners = new Set();
let seen = null; // Set of dismissed step ids; null until first read

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function current() {
  if (!seen) seen = load();
  return seen;
}

function save(next) {
  seen = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // Storage blocked: hints stay dismissed for this page view only.
  }
  listeners.forEach((listener) => listener());
}

export function isHintSeen(step) {
  return current().has(step);
}

export function dismissHint(step) {
  save(new Set(current()).add(step));
}

export function dismissAllHints() {
  save(new Set(HINT_STEPS));
}

/** "Show hints": forget what was dismissed. */
export function resetHints() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the in-memory reset below still applies.
  }
  seen = new Set();
  listeners.forEach((listener) => listener());
}

export function subscribeHints(listener) {
  listeners.add(listener);
  const onStorage = (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      seen = null; // another tab changed it: re-read
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Off for scripted demo runs: build with NEXT_PUBLIC_HINTS=off, or set
 * `window.__HURRAH_HINTS__ = false` before the page loads (Playwright's
 * addInitScript), no rebuild needed.
 */
export function hintsEnabled() {
  if (process.env.NEXT_PUBLIC_HINTS === "off") return false;
  if (typeof window !== "undefined" && window.__HURRAH_HINTS__ === false) return false;
  return true;
}
