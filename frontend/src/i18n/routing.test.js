import { describe, expect, it } from "vitest";
import { routing } from "./routing";

describe("routing", () => {
  it("serves English and Arabic under an always-prefixed locale segment", () => {
    expect(routing.locales).toEqual(["en", "ar"]);
    expect(routing.defaultLocale).toBe("en");
    expect(routing.localePrefix).toBe("always");
  });
});
