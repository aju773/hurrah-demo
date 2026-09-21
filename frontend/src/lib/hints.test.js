import { afterEach, beforeEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import { HINT_STEPS, dismissAllHints, dismissHint, hintsEnabled, isHintSeen, resetHints } from "./hints";

beforeEach(() => {
  localStorage.clear();
  resetHints();
});

afterEach(() => {
  delete window.__HURRAH_HINTS__;
});

describe("hints seen state", () => {
  it("shows every hint to a first-time visitor", () => {
    for (const step of HINT_STEPS) expect(isHintSeen(step)).toBe(false);
  });

  it("remembers a dismissed hint in the browser, and only that one", () => {
    dismissHint("options");
    expect(isHintSeen("options")).toBe(true);
    expect(isHintSeen("artwork")).toBe(false);
    expect(JSON.parse(localStorage.getItem("hurrah.hints.seen"))).toEqual(["options"]);
  });

  it("dismisses all hints at once", () => {
    dismissAllHints();
    for (const step of HINT_STEPS) expect(isHintSeen(step)).toBe(true);
  });

  it("brings hints back when reset", () => {
    dismissAllHints();
    resetHints();
    for (const step of HINT_STEPS) expect(isHintSeen(step)).toBe(false);
  });
});

describe("hint copy", () => {
  it("is one hint per journey page, in English and Arabic", () => {
    expect(HINT_STEPS).toEqual(["options", "artwork", "approval"]);
    for (const step of HINT_STEPS) {
      expect(en.Hints[step]).toBeTruthy();
      expect(ar.Hints[step]).toBeTruthy();
    }
  });
});

describe("hintsEnabled", () => {
  it("is on by default", () => {
    expect(hintsEnabled()).toBe(true);
  });

  it("is switched off at runtime for scripted runs", () => {
    window.__HURRAH_HINTS__ = false;
    expect(hintsEnabled()).toBe(false);
  });
});
