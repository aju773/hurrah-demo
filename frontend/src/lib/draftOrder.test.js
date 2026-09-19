import { describe, expect, it } from "vitest";
import {
  canContinue,
  initDraft,
  openDialogs,
  pendingEffect,
  reduce,
  restoreDraft,
  serializeDraft,
} from "./draftOrder";

const DEFAULTS = { size: "a5", paper: "170gsm-gloss", sides: "single", quantity: "500", turnaround: "standard" };

// Stands in for the Configuration API: the only rule this demo's tests need is
// the real one from the spec (Same-day yields to Express above A3), so a
// requote never has to reimplement pricing to exercise the reducer.
function resolve(selection) {
  if (selection.turnaround === "same-day" && selection.size === "a3") {
    return {
      selection: { ...selection, turnaround: "express" },
      notices: [{ option: "turnaround", from: "same-day", to: "express", reason: "Same-day not available for A3" }],
    };
  }
  return { selection, notices: [] };
}

/** Drives every pending "requote" effect to completion using the stub
 * resolver above, the way the real hook would drive it against the API. */
function settle(state) {
  let s = state;
  let effect = pendingEffect(s);
  while (effect?.type === "requote") {
    const { selection, notices } = resolve(effect.selection);
    s = reduce(s, { type: "REQUOTED", selection, notices });
    effect = pendingEffect(s);
  }
  return s;
}

function pick(state, option, value) {
  return settle(reduce(state, { type: "PICK", option, value }));
}

function uploadFront(state, artwork) {
  return settle(reduce(state, { type: "UPLOAD_FRONT", artwork }));
}

/** Requests, fills and confirms a dialog's "switch" preview in one go. */
function switchDialog(state, key) {
  let s = reduce(state, { type: "PREVIEW_SWITCH", key });
  const effect = pendingEffect(s);
  expect(effect).toEqual({ type: "preview-switch", key, selection: effect.selection });
  const { selection, notices } = resolve(effect.selection);
  s = reduce(s, { type: "PREVIEW_READY", key, quote: { total_aed: "0.00" }, notices, resolvedSelection: selection });
  return settle(reduce(s, { type: "RESOLVE_DIALOG", key, how: "switch" }));
}

const F2_A5_DOUBLE = { id: 1, matchedSizeCode: "a5", pages: 2, backId: 2 };
const F1_A4_DOUBLE = { id: 3, matchedSizeCode: "a4", pages: 2, backId: 4 };
const F4_A3_SINGLE = { id: 5, matchedSizeCode: "a3", pages: 1 };
const F5_A5_SINGLE = { id: 6, matchedSizeCode: "a5", pages: 1 };
const F6_UNKNOWN = { id: 7, matchedSizeCode: null, mm: { width: 200, height: 200 }, pages: 1 };
const BACK_A5 = { id: 8, matchedSizeCode: "a5" };

describe("Omar: upload before any pick", () => {
  it("fills Size and Sides from the file, and later picks never reopen a dialog", () => {
    let s = initDraft(DEFAULTS);
    s = uploadFront(s, F2_A5_DOUBLE);

    expect(s.config.size).toBe("a5");
    expect(s.config.sides).toBe("double");
    expect(s.source.size).toBe("default"); // the file agrees with the default; nothing to override
    expect(s.source.sides).toBe("file");
    expect(openDialogs(s)).toEqual([]);

    s = pick(s, "paper", "350gsm-matt");
    s = pick(s, "turnaround", "same-day");

    expect(openDialogs(s)).toEqual([]);
    expect(canContinue(s)).toBe(true);
  });
});

describe("Layla: options before upload", () => {
  it("never changes her picks silently — a mismatch opens a dialog instead", () => {
    let s = initDraft(DEFAULTS);
    s = pick(s, "sides", "double");
    s = pick(s, "quantity", "1000");

    s = uploadFront(s, F1_A4_DOUBLE); // A4, matches her double-sided pick on sides
    expect(s.config.size).toBe("a5"); // unchanged — she picked before uploading
    expect(s.config.sides).toBe("double"); // unaffected: the file already agrees

    const dialogs = openDialogs(s);
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toMatchObject({ kind: "size-mismatch", file: "a4", ordered: "a5" });
    expect(canContinue(s)).toBe(false);

    s = switchDialog(s, dialogs[0].key);
    expect(s.config.size).toBe("a4");
    expect(s.source.size).toBe("customer"); // a switch counts as a pick
    expect(openDialogs(s)).toEqual([]);
    expect(canContinue(s)).toBe(true);
  });
});

describe("upload after a pick never changes the Configuration on its own", () => {
  it("leaves every option exactly as picked until a dialog is resolved", () => {
    let s = initDraft(DEFAULTS);
    s = pick(s, "sides", "double");
    const before = { ...s.config };

    s = uploadFront(s, F4_A3_SINGLE); // A3, single page: both size and sides differ

    expect(s.config).toEqual(before);
    expect(openDialogs(s).map((d) => d.kind).sort()).toEqual(["front-only", "size-mismatch"]);
  });
});

describe("the four dialog kinds and their choices", () => {
  it("size-mismatch: switch or replace", () => {
    let s = pick(initDraft(DEFAULTS), "quantity", "1000");
    s = uploadFront(s, F1_A4_DOUBLE);
    const [dialog] = openDialogs(s);
    expect(dialog.kind).toBe("size-mismatch");

    const replaced = settle(reduce(s, { type: "RESOLVE_DIALOG", key: dialog.key, how: "replace" }));
    expect(replaced.slots.front).toBeNull();
    expect(replaced.slots.back).toBeNull(); // the file filled both slots
    expect(openDialogs(replaced)).toEqual([]);
  });

  it("unknown-size: only replace is offered, and it clears the file", () => {
    let s = uploadFront(initDraft(DEFAULTS), F6_UNKNOWN);
    const [dialog] = openDialogs(s);
    expect(dialog).toMatchObject({ kind: "unknown-size", mm: { width: 200, height: 200 } });

    s = settle(reduce(s, { type: "RESOLVE_DIALOG", key: dialog.key, how: "replace" }));
    expect(s.slots.front).toBeNull();
  });

  it("front-only on a double-sided order: switch, same-back, or a back-slot hint", () => {
    let s = pick(initDraft(DEFAULTS), "sides", "double");
    s = uploadFront(s, F5_A5_SINGLE);
    const [dialog] = openDialogs(s);
    expect(dialog.kind).toBe("front-only");

    // "Upload the back" is just a hint; it doesn't resolve anything by itself.
    const hinted = reduce(s, { type: "RESOLVE_DIALOG", key: dialog.key, how: "upload-back" });
    expect(openDialogs(hinted)).toHaveLength(1);

    const sameBack = settle(reduce(s, { type: "RESOLVE_DIALOG", key: dialog.key, how: "same" }));
    expect(sameBack.slots.sameBack).toBe(true);
    expect(openDialogs(sameBack)).toEqual([]);
    expect(canContinue(sameBack)).toBe(true);
  });

  it("front and back on a single-sided order: switch to double, or keep (print front only)", () => {
    let s = pick(initDraft(DEFAULTS), "sides", "single");
    s = uploadFront(s, { id: 9, matchedSizeCode: "a5", pages: 2, backId: 10 });
    s = reduce(s, { type: "SET_TICK", name: "approval", value: true });
    const [dialog] = openDialogs(s);
    expect(dialog.kind).toBe("back-on-single");

    const kept = reduce(s, { type: "RESOLVE_DIALOG", key: dialog.key, how: "keep" });
    expect(kept.config.sides).toBe("single");
    expect(openDialogs(kept)).toEqual([]);
    expect(canContinue(kept)).toBe(true);
    // "keep" changes what actually prints (the Back is now ignored) without
    // touching the Configuration, so it must clear the ticks too, the same
    // as every other RESOLVE_DIALOG outcome (spec story 82).
    expect(kept.ticks.approval).toBe(false);

    // Changing Sides later reopens it.
    const reopened = pick(kept, "sides", "single");
    expect(openDialogs(reopened)).toHaveLength(1);
  });
});

describe("Keep {Size} and resize my file (ticket 09)", () => {
  const FIT_RESULT = { scalePct: 70.5, whiteBorderMm: 0.3, cropMm: null };

  it("stores size_choice in the prototype shape and closes the dialog", () => {
    let s = pick(initDraft(DEFAULTS), "sides", "double"); // agrees with the file, so only Size is left mismatched
    s = uploadFront(s, F1_A4_DOUBLE); // A4 file, A5 order
    const [dialog] = openDialogs(s);

    s = settle(
      reduce(s, { type: "RESOLVE_DIALOG", key: dialog.key, how: "fit", result: FIT_RESULT, fileTrimMm: [210, 297] })
    );

    expect(openDialogs(s)).toEqual([]);
    expect(canContinue(s)).toBe(true);
    expect(s.sizeChoice).toEqual({
      choice: "keep_size_scale",
      mode: "fit",
      ordered_size: "a5",
      file_trim_mm: [210, 297],
      scale_pct: 70.5,
      white_border_mm: 0.3,
      crop_mm: null,
      applies_to: ["front", "back"], // the file filled both slots
    });
  });

  it("persists until an unrelated pick, but resets when the Size changes", () => {
    let s = pick(initDraft(DEFAULTS), "sides", "double");
    s = uploadFront(s, F1_A4_DOUBLE);
    const [dialog] = openDialogs(s);
    s = settle(reduce(s, { type: "RESOLVE_DIALOG", key: dialog.key, how: "fill", result: FIT_RESULT, fileTrimMm: [210, 297] }));

    s = pick(s, "paper", "350gsm-matt");
    expect(s.sizeChoice).not.toBeNull();

    s = pick(s, "size", "a4");
    expect(s.sizeChoice).toBeNull();
  });

  it("resets when the file is removed", () => {
    let s = pick(initDraft(DEFAULTS), "sides", "double");
    s = uploadFront(s, F1_A4_DOUBLE);
    const [dialog] = openDialogs(s);
    s = settle(reduce(s, { type: "RESOLVE_DIALOG", key: dialog.key, how: "fit", result: FIT_RESULT, fileTrimMm: [210, 297] }));
    expect(s.sizeChoice).not.toBeNull();

    s = reduce(s, { type: "REMOVE_ARTWORK", slot: "front" });
    expect(s.sizeChoice).toBeNull();
  });

  it("survives 'use the same artwork for the back' and widens applies_to", () => {
    // Single-page A4 file against the default single-sided A5 order: only
    // Size mismatches, so resolving it leaves exactly one dialog to deal
    // with, and there's no Back yet when Fit is chosen.
    let s = pick(initDraft(DEFAULTS), "sides", "single"); // touches the draft without disagreeing with the file
    s = uploadFront(s, { id: 20, matchedSizeCode: "a4", pages: 1 });
    const [dialog] = openDialogs(s);
    s = settle(reduce(s, { type: "RESOLVE_DIALOG", key: dialog.key, how: "fit", result: FIT_RESULT, fileTrimMm: [210, 297] }));
    expect(s.sizeChoice.applies_to).toEqual(["front"]);

    s = reduce(s, { type: "TOGGLE_SAME_BACK" });
    expect(s.sizeChoice).not.toBeNull(); // toggling "same as front" doesn't touch the Front file or the Size
    expect(s.sizeChoice.applies_to).toEqual(["front", "back"]);
    expect(s.slots.sameBack).toBe(true);
  });

  it("a later switch replaces the resize instruction", () => {
    let s = pick(initDraft(DEFAULTS), "sides", "double");
    s = uploadFront(s, F1_A4_DOUBLE);
    const [dialog] = openDialogs(s);
    s = settle(reduce(s, { type: "RESOLVE_DIALOG", key: dialog.key, how: "fit", result: FIT_RESULT, fileTrimMm: [210, 297] }));
    expect(s.sizeChoice).not.toBeNull();

    // Re-open by changing Size back to a5 (reopens the dialog), then switch instead.
    s = pick(s, "size", "a5");
    const [reopened] = openDialogs(s);
    s = switchDialog(s, reopened.key);
    expect(s.sizeChoice).toBeNull();
    expect(s.config.size).toBe("a4");
  });
});

describe("a switch that triggers an Express fallback", () => {
  it("shows the fallback as a cascade, not as the customer's own pick", () => {
    let s = pick(initDraft(DEFAULTS), "turnaround", "same-day");
    s = uploadFront(s, F4_A3_SINGLE);
    const dialog = openDialogs(s).find((d) => d.kind === "size-mismatch");

    s = switchDialog(s, dialog.key);

    expect(s.config.size).toBe("a3");
    expect(s.config.turnaround).toBe("express");
    expect(s.source.size).toBe("customer");
    expect(s.source.turnaround).toBe("fallback");
  });
});

describe("resolved-choice persistence and Continue gating", () => {
  it("keeps a resolved choice until the file or that option changes", () => {
    let s = pick(initDraft(DEFAULTS), "sides", "single");
    s = uploadFront(s, { id: 11, matchedSizeCode: "a5", pages: 2, backId: 12 });
    const [dialog] = openDialogs(s);
    s = reduce(s, { type: "RESOLVE_DIALOG", key: dialog.key, how: "keep" });

    s = pick(s, "paper", "350gsm-matt"); // unrelated pick
    expect(openDialogs(s)).toEqual([]);
  });

  it("blocks Continue without Front artwork, and with any open dialog", () => {
    let s = initDraft(DEFAULTS);
    expect(canContinue(s)).toBe(false); // no artwork yet

    s = uploadFront(s, F5_A5_SINGLE);
    expect(canContinue(s)).toBe(true);

    s = pick(s, "sides", "double");
    expect(openDialogs(s)).toHaveLength(1);
    expect(canContinue(s)).toBe(false);
  });
});

describe("Preflight Errors gate Continue (ticket 06)", () => {
  it("blocks Continue while Front has a Preflight Error, even with no open dialog", () => {
    let s = uploadFront(initDraft(DEFAULTS), { ...F5_A5_SINGLE, hasError: true });
    expect(openDialogs(s)).toEqual([]);
    expect(canContinue(s)).toBe(false);
  });

  it("blocks Continue while Back has a Preflight Error", () => {
    let s = uploadFront(initDraft(DEFAULTS), F2_A5_DOUBLE);
    s = settle(reduce(s, { type: "UPLOAD_BACK", artwork: { ...BACK_A5, hasError: true } }));
    expect(canContinue(s)).toBe(false);
  });

  it("a 2-page Front upload propagates the Back page's own Error via backHasError", () => {
    let s = uploadFront(initDraft(DEFAULTS), { ...F2_A5_DOUBLE, backHasError: true });
    expect(canContinue(s)).toBe(false);
  });
});

describe("persistence and rehydrate", () => {
  it("round-trips through serializeDraft/restoreDraft with no re-upload", () => {
    let s = pick(initDraft(DEFAULTS), "sides", "double");
    s = uploadFront(s, F5_A5_SINGLE);
    const [dialog] = openDialogs(s);
    s = reduce(s, { type: "RESOLVE_DIALOG", key: dialog.key, how: "same" });
    s = { ...s, step: 1 };

    const saved = serializeDraft(s);
    expect(saved).not.toHaveProperty("previews");
    expect(saved).not.toHaveProperty("pendingRequote");

    const rehydrated = restoreDraft(JSON.parse(JSON.stringify(saved)), DEFAULTS);
    expect(rehydrated.config).toEqual(s.config);
    expect(rehydrated.slots).toEqual(s.slots);
    expect(rehydrated.step).toBe(1);
    expect(openDialogs(rehydrated)).toEqual([]);
    expect(canContinue(rehydrated)).toBe(true);
  });

  it("uses the Back slot for sync, not the front-filled-both flag, once B1 replaces a real second page", () => {
    let s = uploadFront(initDraft(DEFAULTS), F2_A5_DOUBLE);
    s = settle(reduce(s, { type: "UPLOAD_BACK", artwork: BACK_A5 }));
    expect(s.slots.back.id).toBe(BACK_A5.id);
    expect(openDialogs(s)).toEqual([]);
  });
});

describe("step 3 approval ticks (ticket 10)", () => {
  it("start unticked and can be set independently", () => {
    let s = initDraft(DEFAULTS);
    expect(s.ticks).toEqual({ approval: false, warnings: false });
    s = reduce(s, { type: "SET_TICK", name: "approval", value: true });
    expect(s.ticks).toEqual({ approval: true, warnings: false });
    s = reduce(s, { type: "SET_TICK", name: "warnings", value: true });
    expect(s.ticks).toEqual({ approval: true, warnings: true });
  });

  it("are cleared by a later pick (spec story 82)", () => {
    let s = initDraft(DEFAULTS);
    s = reduce(s, { type: "SET_TICK", name: "approval", value: true });
    s = pick(s, "sides", "double");
    expect(s.ticks).toEqual({ approval: false, warnings: false });
  });

  it("are cleared by an Artwork upload/removal", () => {
    let s = initDraft(DEFAULTS);
    s = reduce(s, { type: "SET_TICK", name: "approval", value: true });
    s = uploadFront(s, F5_A5_SINGLE);
    expect(s.ticks.approval).toBe(false);

    s = reduce(s, { type: "SET_TICK", name: "approval", value: true });
    s = settle(reduce(s, { type: "REMOVE_ARTWORK", slot: "front" }));
    expect(s.ticks.approval).toBe(false);
  });

  it("are cleared by resolving a mismatch dialog (switch)", () => {
    let s = pick(initDraft(DEFAULTS), "quantity", "1000");
    s = uploadFront(s, F1_A4_DOUBLE);
    s = reduce(s, { type: "SET_TICK", name: "approval", value: true });
    const [dialog] = openDialogs(s);
    s = switchDialog(s, dialog.key);
    expect(s.ticks.approval).toBe(false);
  });

  it("CLEAR_TICKS clears both without touching anything else (countdown expiry, spec story 81)", () => {
    let s = initDraft(DEFAULTS);
    s = reduce(s, { type: "SET_TICK", name: "approval", value: true });
    s = reduce(s, { type: "SET_TICK", name: "warnings", value: true });
    const before = { ...s, ticks: undefined };
    s = reduce(s, { type: "CLEAR_TICKS" });
    expect(s.ticks).toEqual({ approval: false, warnings: false });
    expect({ ...s, ticks: undefined }).toEqual(before);
  });

  it("survive step navigation (GO_TO_STEP doesn't clear them)", () => {
    let s = initDraft(DEFAULTS);
    s = reduce(s, { type: "SET_TICK", name: "approval", value: true });
    s = reduce(s, { type: "GO_TO_STEP", step: 2 });
    expect(s.ticks.approval).toBe(true);
  });
});

describe("idempotency key (spec story 88)", () => {
  it("is null until explicitly set, then never overwritten", () => {
    let s = initDraft(DEFAULTS);
    expect(s.idempotencyKey).toBeNull();
    s = reduce(s, { type: "SET_IDEMPOTENCY_KEY", key: "abc" });
    expect(s.idempotencyKey).toBe("abc");
    s = reduce(s, { type: "SET_IDEMPOTENCY_KEY", key: "def" });
    expect(s.idempotencyKey).toBe("abc");
  });

  it("round-trips through serializeDraft/restoreDraft along with ticks", () => {
    let s = initDraft(DEFAULTS);
    s = reduce(s, { type: "SET_IDEMPOTENCY_KEY", key: "abc" });
    s = reduce(s, { type: "SET_TICK", name: "approval", value: true });
    const saved = serializeDraft(s);
    const rehydrated = restoreDraft(JSON.parse(JSON.stringify(saved)), DEFAULTS);
    expect(rehydrated.idempotencyKey).toBe("abc");
    expect(rehydrated.ticks).toEqual({ approval: true, warnings: false });
  });

  it("RESET_IDEMPOTENCY_KEY always overwrites, unlike SET_IDEMPOTENCY_KEY", () => {
    // A stale (409) Submit or the countdown expiring means the *next*
    // Submit is a different submission, not a retry of this one — it must
    // not reuse the key the stale attempt already sent.
    let s = reduce(initDraft(DEFAULTS), { type: "SET_IDEMPOTENCY_KEY", key: "abc" });
    s = reduce(s, { type: "RESET_IDEMPOTENCY_KEY", key: "xyz" });
    expect(s.idempotencyKey).toBe("xyz");
  });

  it("keeps the money-free Configuration state (Commerce switch, Turnaround cards, availability) from the API", () => {
    const turnarounds = [{ code: "standard", promised_date: "2026-09-25", window_start: null, window_end: "20:00", seconds_to_cutoff: 1000 }];
    let s = initDraft(DEFAULTS);
    expect(s.commerceEnabled).toBe(false);
    s = reduce(s, {
      type: "REQUOTED",
      selection: DEFAULTS,
      notices: [],
      blocked: {},
      clock: null,
      commerceEnabled: false,
      turnarounds,
      available: false,
    });
    expect(s.turnarounds).toEqual(turnarounds);
    expect(s.available).toBe(false);
    expect(s.quote).toBeNull();
    // A later refresh that omits them (e.g. a preview) leaves them alone.
    s = reduce(s, { type: "REQUOTED", selection: DEFAULTS, notices: [] });
    expect(s.turnarounds).toEqual(turnarounds);
  });
});

describe("Edit options / Change file from Step 3 (ticket 06)", () => {
  function onApprove() {
    let s = uploadFront(initDraft(DEFAULTS), F5_A5_SINGLE);
    s = reduce(s, { type: "GO_TO_STEP", step: 2 });
    return reduce(s, { type: "SET_TICK", name: "approval", value: true });
  }

  it("EDIT_FROM_APPROVE opens Step 1 with a focus target and changes nothing else", () => {
    const before = onApprove();
    const s = reduce(before, { type: "EDIT_FROM_APPROVE", focus: "options" });
    expect(s.step).toBe(0);
    expect(s.returnToApprove).toBe(true);
    expect(s.focus).toBe("options");
    expect({ ...s, step: 0, returnToApprove: false, focus: null }).toEqual({ ...before, step: 0, returnToApprove: false, focus: null });
  });

  it("CLEAR_FOCUS drops the focus target once handled", () => {
    let s = reduce(onApprove(), { type: "EDIT_FROM_APPROVE", focus: "front" });
    s = reduce(s, { type: "CLEAR_FOCUS" });
    expect(s.focus).toBeNull();
    expect(s.returnToApprove).toBe(true);
  });

  it("RETURN_TO_APPROVE goes back to Step 3 with the ticks cleared", () => {
    let s = reduce(onApprove(), { type: "EDIT_FROM_APPROVE", focus: "options" });
    s = reduce(s, { type: "SET_TICK", name: "approval", value: true });
    s = reduce(s, { type: "RETURN_TO_APPROVE" });
    expect(s.step).toBe(2);
    expect(s.returnToApprove).toBe(false);
    expect(s.ticks).toEqual({ approval: false, warnings: false });
  });

  it("an Error in the changed file still blocks Continue until fixed", () => {
    let s = reduce(onApprove(), { type: "EDIT_FROM_APPROVE", focus: "front" });
    s = settle(reduce(s, { type: "UPLOAD_FRONT", artwork: { ...F5_A5_SINGLE, id: 99, hasError: true } }));
    expect(s.returnToApprove).toBe(true);
    expect(canContinue(s)).toBe(false);
    s = settle(reduce(s, { type: "UPLOAD_FRONT", artwork: { ...F5_A5_SINGLE, id: 100 } }));
    expect(canContinue(s)).toBe(true);
  });

  it("returnToApprove survives a refresh; the focus target does not", () => {
    const s = reduce(onApprove(), { type: "EDIT_FROM_APPROVE", focus: "back" });
    const rehydrated = restoreDraft(JSON.parse(JSON.stringify(serializeDraft(s))), DEFAULTS);
    expect(rehydrated.step).toBe(0);
    expect(rehydrated.returnToApprove).toBe(true);
    expect(rehydrated.focus).toBeNull();
  });

  it("a plain GO_TO_STEP forgets the return trip", () => {
    let s = reduce(onApprove(), { type: "EDIT_FROM_APPROVE", focus: "options" });
    s = reduce(s, { type: "GO_TO_STEP", step: 1 });
    expect(s.returnToApprove).toBe(false);
  });
});
