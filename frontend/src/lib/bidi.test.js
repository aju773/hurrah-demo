import { describe, expect, it } from "vitest";
import { isolateLtr } from "./bidi";

describe("isolateLtr", () => {
  it("wraps the text in a left-to-right isolate", () => {
    expect(isolateLtr("HUR-10001")).toBe("⁦HUR-10001⁩");
  });
});
