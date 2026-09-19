import { describe, expect, it } from "vitest";
import { NETWORK_FAILED, SERVER_BUSY, UPLOAD_FAILED, uploadErrorFrom } from "./artworkErrors";

describe("uploadErrorFrom", () => {
  it("uses the server's first error, code and English message", () => {
    const data = { errors: [{ code: "not_a_pdf", slot: "front", message: "This file isn't a PDF." }] };
    expect(uploadErrorFrom({ status: 400, data })).toEqual({ code: "not_a_pdf", message: "This file isn't a PDF." });
  });

  it("maps a 429 without a body to server_busy", () => {
    expect(uploadErrorFrom({ status: 429, data: {} })).toEqual({ code: SERVER_BUSY, message: null });
  });

  it("keeps the server's own server_busy body", () => {
    const data = { errors: [{ code: "server_busy", slot: null, message: "We're busy." }] };
    expect(uploadErrorFrom({ status: 429, data }).code).toBe(SERVER_BUSY);
  });

  it("falls back to upload_failed when the response has no error", () => {
    expect(uploadErrorFrom({ status: 500, data: {} })).toEqual({ code: UPLOAD_FAILED, message: null });
  });

  it("reports a dropped connection as network_failed", () => {
    expect(uploadErrorFrom({ status: 0, data: {}, networkFailed: true })).toEqual({ code: NETWORK_FAILED, message: null });
  });
});
