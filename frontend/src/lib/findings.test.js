import { describe, expect, it } from "vitest";
import { canGoNext, combineFindings, findingMessage, orderHeadline, passedChecks, slotErrorMessage } from "./findings";

function finding(overrides) {
  return { code: "low_ppi", severity: "warning", value: 200, slot: undefined, page: 1, bbox: null, message: "", ...overrides };
}

describe("combineFindings", () => {
  it("groups repeats per code per slot, keeping the worst value (lowest ppi)", () => {
    const front = {
      findings: [
        finding({ value: 220 }),
        finding({ value: 180 }),
        finding({ value: 240 }),
      ],
    };
    const [group] = combineFindings({ front, back: null, sameAsFront: false });
    expect(group.code).toBe("low_ppi");
    expect(group.slot).toBe("front");
    expect(group.count).toBe(3);
    expect(group.worstValue).toBe(180);
  });

  it("a Warning and a Note on the same code keep the worse Severity", () => {
    const front = { findings: [finding({ code: "rgb_colour", severity: "note" })] };
    const back = { findings: [finding({ code: "low_ppi", severity: "error", value: 90 })] };
    const groups = combineFindings({ front, back, sameAsFront: false });
    expect(groups.map((g) => g.severity)).toEqual(["error", "note"]); // Error -> Warning -> Note
  });

  it("sorts Error -> Warning -> Note and numbers 1..n", () => {
    const front = {
      findings: [
        finding({ code: "rgb_colour", severity: "note" }),
        finding({ code: "font_not_embedded", severity: "error" }),
        finding({ code: "bleed_missing", severity: "warning" }),
      ],
    };
    const groups = combineFindings({ front, back: null, sameAsFront: false });
    expect(groups.map((g) => g.code)).toEqual(["font_not_embedded", "bleed_missing", "rgb_colour"]);
    expect(groups.map((g) => g.n)).toEqual([1, 2, 3]);
  });

  it("a same-as-front Back contributes no Findings of its own", () => {
    const front = { findings: [finding()] };
    const back = { findings: [finding({ code: "font_not_embedded", severity: "error" })] };
    const groups = combineFindings({ front, back, sameAsFront: true });
    expect(groups).toHaveLength(1);
    expect(groups[0].slot).toBe("front");
  });

  it("keeps Front and Back Findings of the same code as separate groups", () => {
    const front = { findings: [finding({ slot: undefined })] };
    const back = { findings: [finding({ slot: undefined, value: 260 })] };
    const groups = combineFindings({ front, back, sameAsFront: false });
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.slot).sort()).toEqual(["back", "front"]);
  });
});

describe("passedChecks", () => {
  it("lists every check with no Finding at all", () => {
    const groups = combineFindings({ front: { findings: [finding({ code: "low_ppi" })] }, back: null, sameAsFront: false });
    expect(passedChecks(groups)).toEqual(["bleed", "fonts", "colour", "file"]);
  });

  it("doesn't mention size unless a resize was actually applied", () => {
    const groups = combineFindings({ front: { findings: [] }, back: null, sameAsFront: false });
    expect(passedChecks(groups)).not.toContain("size");
    expect(passedChecks(groups, { resized: true })).toContain("size");
  });

  it("a fit_border/fill_crop Finding drops size from the passed line", () => {
    const groups = combineFindings({
      front: { findings: [finding({ code: "fit_border", severity: "warning", value: 31 })] },
      back: null,
      sameAsFront: false,
    });
    expect(passedChecks(groups, { resized: true })).not.toContain("size");
  });
});

describe("orderHeadline", () => {
  it("is OK with no Findings", () => {
    expect(orderHeadline([])).toMatchObject({ severity: "ok" });
  });

  it("counts distinct Warning codes, not occurrences", () => {
    const groups = combineFindings({
      front: { findings: [finding({ value: 200 }), finding({ value: 210 })] },
      back: null,
      sameAsFront: false,
    });
    expect(orderHeadline(groups)).toMatchObject({ severity: "warning", text: expect.stringContaining("1 thing") });
  });

  it("is an Error headline when any group is an Error", () => {
    const groups = combineFindings({
      front: { findings: [finding({ code: "font_not_embedded", severity: "error" })] },
      back: null,
      sameAsFront: false,
    });
    expect(orderHeadline(groups)).toMatchObject({ severity: "error" });
  });
});

describe("canGoNext", () => {
  it("is false while any Error remains, true otherwise", () => {
    const withError = combineFindings({
      front: { findings: [finding({ code: "font_not_embedded", severity: "error" })] },
      back: null,
      sameAsFront: false,
    });
    expect(canGoNext(withError)).toBe(false);

    const warningOnly = combineFindings({ front: { findings: [finding()] }, back: null, sameAsFront: false });
    expect(canGoNext(warningOnly)).toBe(true);
  });
});

// A stand-in for next-intl's `t` with `t.has`.
function fakeT(messages) {
  const t = (key) => messages[key];
  t.has = (key) => key in messages;
  return t;
}

describe("orderHeadline", () => {
  it("carries the warning count so components can translate the plural", () => {
    const groups = combineFindings({
      front: { findings: [finding({ code: "bleed_missing" }), finding({ code: "low_ppi" })] },
      back: null,
      sameAsFront: false,
    });
    expect(orderHeadline(groups)).toMatchObject({ severity: "warning", count: 2 });
  });
});

describe("findingMessage", () => {
  const group = { code: "bleed_missing", severity: "warning", message: "English from the server" };

  it("uses the translated message for a known code and severity", () => {
    const t = fakeT({ bleed_missing_warning: "رسالة عربية" });
    expect(findingMessage(t, group)).toBe("رسالة عربية");
  });

  it("keys on severity too, since low_ppi is a Warning and an Error with different wording", () => {
    const t = fakeT({ low_ppi_warning: "soft", low_ppi_error: "blurry" });
    expect(findingMessage(t, { code: "low_ppi", severity: "error", message: "x" })).toBe("blurry");
    expect(findingMessage(t, { code: "low_ppi", severity: "warning", message: "x" })).toBe("soft");
  });

  it("falls back to the server's English sentence for an unknown code", () => {
    expect(findingMessage(fakeT({}), { ...group, code: "brand_new_check" })).toBe("English from the server");
  });
});

describe("slotErrorMessage", () => {
  it("translates a known slot error code", () => {
    expect(slotErrorMessage(fakeT({ back_one_page: "الخلفية صفحة واحدة" }), { code: "back_one_page", message: "Back takes one page." })).toBe(
      "الخلفية صفحة واحدة"
    );
  });

  it("falls back to the server's English message for an unknown code", () => {
    expect(slotErrorMessage(fakeT({}), { code: "mystery", message: "Something odd." })).toBe("Something odd.");
  });

  it("returns null when there is no error", () => {
    expect(slotErrorMessage(fakeT({}), undefined)).toBeNull();
  });
});
