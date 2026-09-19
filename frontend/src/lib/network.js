// How long the journey waits on the server before it stops and offers Retry.
export const REQUEST_TIMEOUT_MS = 20000;
// Checking a file (upload response, page assignment) is allowed its server-side budget
// (15s of checks plus analysis and rendering) before the customer is told it's slow.
export const CHECK_TIMEOUT_MS = 90000;

/** fetch that gives up after `timeoutMs`. Like fetch it rejects when the network
 * fails, and also when the server is too slow, so callers handle both the same way. */
export async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
