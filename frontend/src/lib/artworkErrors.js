// The upload's customer-facing error codes. The wording lives in the message
// files (ArtworkErrors); the server sends an English fallback message with each
// code it raises. network_failed and upload_failed are raised here, in the browser.
export const NETWORK_FAILED = "network_failed";
export const SERVER_BUSY = "server_busy";
export const UPLOAD_FAILED = "upload_failed";

/** The {code, message} shown next to a slot for a failed upload response. */
export function uploadErrorFrom({ status, data, networkFailed = false }) {
  if (networkFailed) return { code: NETWORK_FAILED, message: null };
  const first = data?.errors?.[0];
  if (first) return { code: first.code, message: first.message ?? null };
  if (status === 429) return { code: SERVER_BUSY, message: null };
  return { code: UPLOAD_FAILED, message: null };
}
