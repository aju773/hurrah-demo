import { API_BASE_URL } from "@/lib/api";
import { uploadErrorFrom } from "@/lib/artworkErrors";

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
 * server to drop anything it already stored for this key.
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

  const promise = new Promise((resolve) => {
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total);
    };
    xhr.upload.onload = () => {
      sent = true;
      onSent?.();
    };
    xhr.onload = () => {
      if (cancelled) return resolve({ cancelled: true });
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      const ok = xhr.status >= 200 && xhr.status < 300;
      resolve({ ok, data, error: ok ? null : uploadErrorFrom({ status: xhr.status, data }) });
    };
    xhr.onerror = () => {
      if (cancelled) return resolve({ cancelled: true });
      resolve({ ok: false, data: {}, error: uploadErrorFrom({ status: 0, data: {}, networkFailed: true }) });
    };
    xhr.onabort = () => resolve({ cancelled: true });
    xhr.open("POST", `${API_BASE_URL}/api/artworks/`);
    xhr.send(form);
  });

  function cancel() {
    if (cancelled) return;
    cancelled = true;
    xhr.abort();
    if (sent && key) {
      // The server may already have stored it; best effort, nothing to wait for.
      fetch(`${API_BASE_URL}/api/artworks/?upload_key=${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => {});
    }
  }

  return { promise, cancel };
}
