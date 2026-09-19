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
      discardUpload(key);
    }
  }

  return { promise, cancel };
}

/**
 * Phase two of a Page picker upload: turns chosen pages of a stored source into
 * Artwork. `front` / `back` are 1-based page numbers (either may be omitted);
 * `frontId` is the existing Front Artwork when only a Back is being added. Resolves
 * like an upload, {ok, data, error}, and never rejects. `key` makes a resend safe.
 */
export async function assignPages({ sourceId, front, back, frontId, key }) {
  const body = {};
  if (front != null) body.front = front;
  if (back != null) body.back = back;
  if (frontId) body.front_id = frontId;
  if (key) body.upload_key = key;
  try {
    const res = await fetch(`${API_BASE_URL}/api/sources/${sourceId}/assign/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
