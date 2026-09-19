import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";

function flatten(object, prefix = "") {
  return Object.entries(object).flatMap(([key, value]) =>
    typeof value === "object" && value !== null ? flatten(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]
  );
}

const enEntries = new Map(flatten(en));
const arEntries = new Map(flatten(ar));

// {name} placeholders and <tag>…</tag> rich-text tags a translation must keep.
function tokens(message) {
  const names = [...message.matchAll(/\{(\w+)(?:,|\})/g)].map((m) => m[1]);
  const tags = [...message.matchAll(/<(\w+)>/g)].map((m) => `<${m[1]}>`);
  return [...new Set([...names, ...tags])].sort();
}

describe("message files", () => {
  it("Arabic has exactly the keys English has", () => {
    expect([...arEntries.keys()].sort()).toEqual([...enEntries.keys()].sort());
  });

  it("no message is empty", () => {
    for (const [locale, entries] of [["en", enEntries], ["ar", arEntries]]) {
      for (const [key, value] of entries) {
        expect(value, `${locale}:${key}`).toBeTruthy();
      }
    }
  });

  it("Arabic keeps every placeholder and rich-text tag of the English message", () => {
    for (const [key, english] of enEntries) {
      expect(tokens(arEntries.get(key)), key).toEqual(tokens(english));
    }
  });

  it("Arabic messages that carry a number use Western digits", () => {
    for (const [key, value] of arEntries) {
      expect(value, key).not.toMatch(/[٠-٩]/);
    }
  });
});

describe("server codes the frontend translates", () => {
  const findingCodes = [
    "bleed_missing_warning", "bleed_short_warning", "low_ppi_warning", "low_ppi_error",
    "font_not_embedded_error", "rgb_colour_note", "file_repaired_warning", "file_unreadable_error",
    "file_too_large_error", "check_incomplete_warning", "fit_border_warning", "fill_crop_warning",
  ];
  const slotErrorCodes = ["not_a_pdf", "too_many_pages", "back_one_page", "back_size_differs", "file_unreadable", "file_too_large"];
  const designRequestCodes = [
    "name_required", "phone_required", "brief_required", "flyer_language_invalid", "browsing_language_invalid",
    "product_unknown", "configuration_invalid", "files_too_many", "files_wrong_type", "files_too_large",
  ];
  const orderErrorCodes = ["missing_tick", "artwork_locked", "invalid_artwork", "not_available", "invalid_configuration"];

  it("has a message for every Preflight Finding code and severity", () => {
    for (const code of findingCodes) expect(arEntries.has(`Findings.${code}`), code).toBe(true);
  });

  it("has a message for every artwork slot error code", () => {
    for (const code of slotErrorCodes) expect(arEntries.has(`ArtworkErrors.${code}`), code).toBe(true);
  });

  it("has a message for every Design request validation code", () => {
    for (const code of designRequestCodes) expect(arEntries.has(`DesignHelp.${code}`), code).toBe(true);
  });

  it("has a message for every Order submit error code", () => {
    for (const code of orderErrorCodes) expect(arEntries.has(`ApproveAndConfirmStep.error_${code}`), code).toBe(true);
  });
});
