import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignPages, newUploadKey, startUpload } from "./uploadArtwork";
import { CHECK_TIMEOUT_MS } from "./network";

// A hand-driven XMLHttpRequest: the test decides when bytes are sent, when the
// server answers and when the connection drops.
class FakeXhr {
  static instances = [];
  constructor() {
    this.upload = {};
    this.headers = {};
    this.aborted = false;
    FakeXhr.instances.push(this);
  }
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  send(body) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  sendBytes(loaded, total) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  finishSending() {
    this.upload.onload?.();
  }
  respond(status, json) {
    this.status = status;
    this.responseText = typeof json === "string" ? json : JSON.stringify(json);
    this.onload?.();
  }
  dropConnection() {
    this.status = 0;
    this.onerror?.();
  }
}

const FILE = new File(["%PDF-1.4"], "flyer.pdf", { type: "application/pdf" });
const args = (extra = {}) => ({ file: FILE, slot: "front", productId: 7, key: "k1", ...extra });

beforeEach(() => {
  FakeXhr.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
});
afterEach(() => vi.unstubAllGlobals());

describe("startUpload", () => {
  it("posts the file, slot, product, front id and upload key as a form", () => {
    startUpload(args({ slot: "back", frontId: 3 }));
    const [xhr] = FakeXhr.instances;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toMatch(/\/api\/artworks\/$/);
    expect(xhr.body.get("file")).toBeInstanceOf(File);
    expect(xhr.body.get("slot")).toBe("back");
    expect(xhr.body.get("product")).toBe("7");
    expect(xhr.body.get("front_id")).toBe("3");
    expect(xhr.body.get("upload_key")).toBe("k1");
  });

  it("reports bytes sent as a fraction, then says the file has been sent", async () => {
    const onProgress = vi.fn();
    const onSent = vi.fn();
    startUpload(args({ onProgress, onSent }));
    const [xhr] = FakeXhr.instances;
    xhr.sendBytes(25, 100);
    expect(onProgress).toHaveBeenLastCalledWith(0.25);
    expect(onSent).not.toHaveBeenCalled();
    xhr.sendBytes(100, 100);
    xhr.finishSending();
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it("resolves with the parsed data on success", async () => {
    const { promise } = startUpload(args());
    FakeXhr.instances[0].respond(201, { front: { id: 1 }, errors: [] });
    expect(await promise).toEqual({ ok: true, data: { front: { id: 1 }, errors: [] }, error: null });
  });

  it("turns a server error into a {code, message}", async () => {
    const { promise } = startUpload(args());
    FakeXhr.instances[0].respond(400, { errors: [{ code: "not_a_pdf", message: "Nope" }] });
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: "not_a_pdf", message: "Nope" });
  });

  it("maps a 429 to server_busy", async () => {
    const { promise } = startUpload(args());
    FakeXhr.instances[0].respond(429, { errors: [{ code: "server_busy", message: "Busy" }] });
    expect((await promise).error.code).toBe("server_busy");
  });

  it("maps a dropped connection to network_failed", async () => {
    const { promise } = startUpload(args());
    FakeXhr.instances[0].dropConnection();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("network_failed");
  });

  it("copes with a non-JSON error body", async () => {
    const { promise } = startUpload(args());
    FakeXhr.instances[0].respond(502, "<html>Bad gateway</html>");
    expect((await promise).error.code).toBe("upload_failed");
  });

  it("cancel while bytes are going out aborts and cleans up nothing", async () => {
    const { promise, cancel } = startUpload(args());
    const [xhr] = FakeXhr.instances;
    xhr.sendBytes(10, 100);
    cancel();
    expect(xhr.aborted).toBe(true);
    expect(await promise).toEqual({ cancelled: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancel while the file is being checked also asks the server to drop what it stored", async () => {
    const { promise, cancel } = startUpload(args());
    const [xhr] = FakeXhr.instances;
    xhr.finishSending();
    cancel();
    expect(await promise).toEqual({ cancelled: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/artworks\/\?upload_key=k1$/);
    expect(init.method).toBe("DELETE");
  });

  it("a late server answer after cancel is ignored", async () => {
    const { promise, cancel } = startUpload(args());
    const [xhr] = FakeXhr.instances;
    cancel();
    xhr.respond(201, { front: { id: 9 } });
    expect(await promise).toEqual({ cancelled: true });
  });
});

describe("a slow server", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives up on a check that takes too long, as a network failure the customer can retry", async () => {
    const { promise } = startUpload(args());
    const [xhr] = FakeXhr.instances;
    xhr.finishSending();
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS + 1);
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("network_failed");
    expect(xhr.aborted).toBe(true);
    // The server may have kept the file; the retry sends the same key, so it is dropped or reused.
    expect(fetch.mock.calls[0][0]).toMatch(/upload_key=k1$/);
  });

  it("does not start the clock while bytes are still going out (a slow connection is not a slow server)", async () => {
    const { promise, cancel } = startUpload(args());
    FakeXhr.instances[0].sendBytes(10, 100);
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS * 3);
    expect(FakeXhr.instances[0].aborted).toBe(false);
    cancel();
    await promise;
  });

  it("an answer in time cancels the clock", async () => {
    const { promise } = startUpload(args());
    const [xhr] = FakeXhr.instances;
    xhr.finishSending();
    xhr.respond(201, { front: { id: 1 }, errors: [] });
    expect((await promise).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS * 2);
    expect(xhr.aborted).toBe(false);
  });
});

describe("assignPages", () => {
  afterEach(() => vi.useRealTimers());

  it("turns a dropped connection into network_failed", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const result = await assignPages({ sourceId: 4, front: 1 });
    expect(result).toMatchObject({ ok: false, error: { code: "network_failed" } });
  });

  it("turns a server that never answers into network_failed", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((url, options) => new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))))
    );
    const pending = assignPages({ sourceId: 4, front: 1 });
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS + 1);
    expect(await pending).toMatchObject({ ok: false, error: { code: "network_failed" } });
  });
});

describe("newUploadKey", () => {
  it("gives a different short key each time", () => {
    const a = newUploadKey();
    expect(a).not.toBe(newUploadKey());
    expect(a.length).toBeLessThanOrEqual(64);
  });
});
