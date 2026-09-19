import { API_BASE_URL } from "@/lib/api";
import { uploadErrorFrom } from "@/lib/artworkErrors";
import { CHECK_TIMEOUT_MS, fetchWithTimeout } from "@/lib/network";

/** One id per upload the customer starts. Retry sends the same one, so the
 * server can tell a resend from a new file and never stores it twice. */
export function newUploadKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Sends one file to the Artwork endpoint with XMLHttpRequest, because fetch
 * can't report bytes sent. Returns {promise, cancel}; the promise never rejects:
 *   {ok, data, error}   the server answered (error is {code, message} or null)
 *   {cancelled: true}   the customer cancelled
 * `onProgress(fraction)` runs while bytes go out, `onSent()` once they are all
 * out and the server is checking the file. Cancelling after that also asks the
 * server to drop anything it already stored for this key. A server that takes
 * longer than CHECK_TIMEOUT_MS to answer once the file is sent counts as a
 * network failure (Retry sends the same key, so nothing is stored twice).
 */
export function startUpload({ file, slot, productId, frontId, key, onProgress, onSent }) {
  const form = new FormData();
  form.append("file", file);
  form.append("slot", slot);
  form.append("product", productId);
  if (frontId) form.append("front_id", frontId);
  if (key) form.append("upload_key", key);

  const xhr = new XMLHttpRequest();
  let sent = false;
  let cancelled = false;
  let waitTimer = null;
  let timedOut = false;
  const networkFailure = () => ({ ok: false, data: {}, error: uploadErrorFrom({ status: 0, data: {}, networkFailed: true }) });

  const promise = new Promise((resolve) => {
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total);
    };
    xhr.upload.onload = () => {
      sent = true;
      onSent?.();
      waitTimer = setTimeout(() => {
        if (cancelled) return;
        timedOut = true;
        xhr.abort();
        if (key) discardUpload(key);
      }, CHECK_TIMEOUT_MS);
    };
    xhr.onload = () => {
      clearTimeout(waitTimer);
      if (cancelled) return resolve({ cancelled: true });
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      const ok = xhr.status >= 200 && xhr.status < 300;
      resolve({ ok, data, error: ok ? null : uploadErrorFrom({ status: xhr.status, data }) });
    };
    xhr.onerror = () => {
      clearTimeout(waitTimer);
      if (cancelled) return resolve({ cancelled: true });
      resolve(networkFailure());
    };
    xhr.onabort = () => {
      clearTimeout(waitTimer);
      resolve(timedOut ? networkFailure() : { cancelled: true });
    };
    xhr.open("POST", `${API_BASE_URL}/api/artworks/`);
    xhr.send(form);
  });

  function cancel() {
    if (cancelled) return;
    cancelled = true;
    clearTimeout(waitTimer);
    xhr.abort();
    if (sent && key) {
      // The server may already have stored it; best effort, nothing to wait for.
      discardUpload(key);
    }
  }

  return { promise, cancel };
}

/**
 * Phase two of a Page picker upload: turns chosen pages of a stored source into
 * Artwork. `front` / `back` are 1-based page numbers (either may be omitted);
 * `frontId` is the existing Front Artwork when only a Back is being added, and `backId`
 * the existing Back when only a Front is being chosen (so the Sizes are checked). Resolves
 * like an upload, {ok, data, error}, and never rejects. `key` makes a resend safe.
 */
export async function assignPages({ sourceId, front, back, frontId, backId, key }) {
  const body = {};
  if (front != null) body.front = front;
  if (back != null) body.back = back;
  if (frontId) body.front_id = frontId;
  if (backId) body.back_id = backId;
  if (key) body.upload_key = key;
  try {
    const res = await fetchWithTimeout(
      `${API_BASE_URL}/api/sources/${sourceId}/assign/`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      CHECK_TIMEOUT_MS
    );
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data, error: res.ok ? null : uploadErrorFrom({ status: res.status, data }) };
  } catch {
    return { ok: false, data: {}, error: uploadErrorFrom({ status: 0, data: {}, networkFailed: true }) };
  }
}

/** Best effort: asks the server to drop what an upload stored (a source left in the
 * picker, or Artwork from a cancelled check), by its key. */
export function discardUpload(key) {
  if (!key) return;
  fetch(`${API_BASE_URL}/api/artworks/?upload_key=${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => {});
}
