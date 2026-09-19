// Pure draft-order module (ticket 05). No fetch, no DOM: every action is a plain
// object, every transition returns a new plain-object state. Rules and prices are
// never re-implemented here — the Configuration API resolves picks (with fallback)
// and re-quotes; this module only remembers *why* each Option holds its current
// value (default / customer / file / fallback) and *whether* the file and the
// order still agree.
//
// Sync rule (spec stories 37-48): "whichever comes first leads". Before the
// customer has picked anything, an uploaded file fills Size and Sides for them.
// After any pick, a difference between the file and the order never changes the
// order silently — it opens a blocking dialog instead.

export const SIZE_OPTION = "size";
export const SIDES_OPTION = "sides";
export const SIDES_SINGLE = "single";
export const SIDES_DOUBLE = "double";

const SOURCE_DEFAULT = "default";
const SOURCE_CUSTOMER = "customer";
const SOURCE_FILE = "file";
const SOURCE_FALLBACK = "fallback";

export function initDraft(defaults) {
  const source = {};
  for (const code of Object.keys(defaults)) source[code] = SOURCE_DEFAULT;
  return {
    config: { ...defaults },
    source,
    touched: false,
    slots: { front: null, back: null, sameBack: false, frontFilledBoth: false },
    resolvedChoices: {},
    sizeChoice: null,
    previews: {},
    pendingRequote: null,
    step: 0,
    quote: null,
    notices: [],
    blocked: {},
    priceGrid: [],
    clock: null,
    // From the Configuration API: the Commerce switch, every Turnaround's promised
    // date/window (the money-free cards), and whether the selection has a Base price.
    commerceEnabled: false,
    turnarounds: [],
    available: true,
    // Step 3 approval ticks (spec stories 78-79, 82): cleared whenever the
    // Configuration or Artwork changes, or the Cut-off countdown expires.
    ticks: { approval: false, warnings: false },
    // Generated once (useDraftOrder) and persisted, so a retried/double Submit
    // reuses the same key (spec story 88).
    idempotencyKey: null,
    // "Edit options" / "Change file" on Step 3 (spec story 88): while true,
    // Step 1's Continue returns straight to Step 3. `focus` is where Step 1
    // should put the cursor ("options" | "front" | "back"); transient, never persisted.
    returnToApprove: false,
    focus: null,
  };
}

function clearTicks(state) {
  return { ...state, ticks: { approval: false, warnings: false } };
}

// ---- selectors (derived, never stored) ----------------------------------

function detected(slots) {
  if (!slots.front) return null;
  return {
    size: slots.front.matchedSizeCode, // null = matches no flyer size
    mm: slots.front.mm,
    sides: slots.back || slots.sameBack ? SIDES_DOUBLE : SIDES_SINGLE,
  };
}

/** Every difference between the file and the order, regardless of whether it's
 * been resolved yet. */
export function conflicts(state) {
  const d = detected(state.slots);
  if (!d) return [];
  const out = [];
  if (d.size === null) {
    out.push({ key: "size:unknown", kind: "unknown-size", field: SIZE_OPTION, mm: d.mm, ordered: state.config[SIZE_OPTION] });
  } else if (d.size !== state.config[SIZE_OPTION]) {
    out.push({
      key: `size:${d.size}:${state.config[SIZE_OPTION]}`,
      kind: "size-mismatch",
      field: SIZE_OPTION,
      file: d.size,
      ordered: state.config[SIZE_OPTION],
    });
  }
  if (d.sides !== state.config[SIDES_OPTION]) {
    out.push({
      key: `sides:${d.sides}:${state.config[SIDES_OPTION]}`,
      kind: d.sides === SIDES_SINGLE ? "front-only" : "back-on-single",
      field: SIDES_OPTION,
      file: d.sides,
      ordered: state.config[SIDES_OPTION],
    });
  }
  return out;
}

/** Blocking dialogs still open — a conflict the customer hasn't resolved. */
export function openDialogs(state) {
  return conflicts(state).filter((c) => !state.resolvedChoices[c.key]);
}

/** True once every slot that's holding a file has cleared Preflight's Errors
 * (an Error keeps "Upload another file" up and Continue disabled — the
 * Warning/Note/OK headlines never block). */
function noSlotHasPreflightError(slots) {
  return !slots.front?.hasError && !slots.back?.hasError;
}

export function canContinue(state) {
  return Boolean(state.slots.front) && noSlotHasPreflightError(state.slots) && openDialogs(state).length === 0;
}

/** The next side effect the caller (a hook, in the real app) should perform,
 * or null. This module never calls fetch itself. */
export function pendingEffect(state) {
  if (state.pendingRequote) return { type: "requote", selection: state.pendingRequote.selection };
  for (const [key, preview] of Object.entries(state.previews)) {
    if (preview.status === "pending") return { type: "preview-switch", key, selection: preview.selection };
  }
  return null;
}

// ---- reducer --------------------------------------------------------------

function applyResolved(state, resolved, meta, primaryOption) {
  const config = { ...state.config, ...resolved };
  const source = { ...state.source };
  for (const code of Object.keys(resolved)) {
    if (resolved[code] === state.config[code]) continue;
    source[code] = code === primaryOption ? source[code] : SOURCE_FALLBACK;
  }
  return {
    ...state,
    config,
    source,
    notices: meta?.notices ?? state.notices,
    quote: meta?.quote ?? state.quote,
    blocked: meta?.blocked ?? state.blocked,
    priceGrid: meta?.priceGrid ?? state.priceGrid,
    clock: meta?.clock ?? state.clock,
    commerceEnabled: meta?.commerceEnabled ?? state.commerceEnabled,
    turnarounds: meta?.turnarounds ?? state.turnarounds,
    available: meta?.available ?? state.available,
  };
}

function fileSync(state) {
  // Before any pick, the file fills Size and Sides. Only fields the file
  // actually knows about (a matched Size; Sides from front/back presence)
  // are touched, and only when they'd change something.
  if (state.touched) return state;
  const d = detected(state.slots);
  if (!d) return state;
  const next = { ...state.config };
  const source = { ...state.source };
  let changed = false;
  if (d.size !== null && d.size !== next[SIZE_OPTION]) {
    next[SIZE_OPTION] = d.size;
    source[SIZE_OPTION] = SOURCE_FILE;
    changed = true;
  }
  if (d.sides !== next[SIDES_OPTION]) {
    next[SIDES_OPTION] = d.sides;
    source[SIDES_OPTION] = SOURCE_FILE;
    changed = true;
  }
  if (!changed) return state;
  return { ...state, config: next, source, pendingRequote: { selection: next, primaryOption: null } };
}

function withSlots(state, slots, { resetSizeChoice = true } = {}) {
  return fileSync(clearTicks({
    ...state,
    slots,
    resolvedChoices: {},
    sizeChoice: resetSizeChoice ? null : state.sizeChoice,
    previews: {},
  }));
}

export function reduce(state, action) {
  switch (action.type) {
    case "PICK": {
      const { option, value } = action;
      const config = { ...state.config, [option]: value };
      const source = { ...state.source, [option]: SOURCE_CUSTOMER };
      const resolvedChoices = { ...state.resolvedChoices };
      for (const key of Object.keys(resolvedChoices)) {
        if (key.startsWith(`${option}:`)) delete resolvedChoices[key];
      }
      return clearTicks({
        ...state,
        config,
        source,
        touched: true,
        resolvedChoices,
        // A later Size change from Edit spec reopens the mismatch dialog and
        // makes any earlier Fit/Fill instruction stale (spec: "resets when
        // the file or Size changes").
        sizeChoice: option === SIZE_OPTION ? null : state.sizeChoice,
        pendingRequote: { selection: config, primaryOption: option },
      });
    }

    case "REQUEST_REQUOTE":
      // A plain refresh (e.g. the locale changed and server text needs
      // relabelling) — not a pick, so no Option's source changes.
      return { ...state, pendingRequote: { selection: state.config, primaryOption: null } };

    case "REQUOTED": {
      const s = applyResolved(state, action.selection, action, state.pendingRequote?.primaryOption);
      return { ...s, pendingRequote: null };
    }

    case "UPLOAD_FRONT": {
      const front = {
        id: action.artwork.id,
        matchedSizeCode: action.artwork.matchedSizeCode ?? null,
        mm: action.artwork.mm ?? null,
        bleedMm: action.artwork.bleedMm ?? null,
        imageUrl: action.artwork.imageUrl ?? null,
        hasError: Boolean(action.artwork.hasError),
      };
      let back = state.slots.back;
      let frontFilledBoth = false;
      if (action.artwork.pages >= 2) {
        back = {
          id: action.artwork.backId,
          matchedSizeCode: front.matchedSizeCode,
          mm: front.mm,
          bleedMm: front.bleedMm,
          imageUrl: action.artwork.backImageUrl ?? null,
          hasError: Boolean(action.artwork.backHasError),
        };
        frontFilledBoth = true;
      }
      return withSlots(state, { ...state.slots, front, back, sameBack: frontFilledBoth ? false : state.slots.sameBack, frontFilledBoth });
    }

    case "UPLOAD_BACK": {
      const back = {
        id: action.artwork.id,
        matchedSizeCode: action.artwork.matchedSizeCode ?? null,
        bleedMm: action.artwork.bleedMm ?? null,
        mm: action.artwork.mm ?? null,
        imageUrl: action.artwork.imageUrl ?? null,
        hasError: Boolean(action.artwork.hasError),
      };
      return withSlots(state, { ...state.slots, back, sameBack: false });
    }

    case "REMOVE_ARTWORK": {
      if (action.slot === "back") {
        return withSlots(state, { ...state.slots, back: null, sameBack: false });
      }
      const clearBack = state.slots.frontFilledBoth;
      return withSlots(state, { front: null, back: clearBack ? null : state.slots.back, sameBack: clearBack ? false : state.slots.sameBack, frontFilledBoth: false });
    }

    case "TOGGLE_SAME_BACK": {
      // Doesn't change the Front file or the ordered Size, so an existing
      // Fit/Fill instruction (ticket 09) stays valid — only widen its
      // applies_to to cover the Back slot it now also governs.
      const sameBack = !state.slots.sameBack;
      const slots = { ...state.slots, sameBack, back: sameBack ? state.slots.back : null };
      const next = withSlots(state, slots, { resetSizeChoice: false });
      if (!next.sizeChoice) return next;
      const appliesToBack = sameBack || Boolean(next.slots.back);
      return { ...next, sizeChoice: { ...next.sizeChoice, applies_to: appliesToBack ? ["front", "back"] : ["front"] } };
    }

    case "PREVIEW_SWITCH": {
      const conflict = openDialogs(state).find((c) => c.key === action.key);
      if (!conflict) return state;
      const selection = { ...state.config, [conflict.field]: conflict.file };
      return { ...state, previews: { ...state.previews, [action.key]: { status: "pending", selection } } };
    }

    case "PREVIEW_READY": {
      const preview = state.previews[action.key];
      if (!preview) return state;
      return {
        ...state,
        previews: {
          ...state.previews,
          [action.key]: { status: "ready", selection: preview.selection, quote: action.quote, notices: action.notices, resolvedSelection: action.resolvedSelection },
        },
      };
    }

    case "RESOLVE_DIALOG": {
      const conflict = openDialogs(state).find((c) => c.key === action.key);
      if (!conflict) return state;

      if (action.how === "switch") {
        const preview = state.previews[action.key];
        const resolvedSelection = preview?.resolvedSelection ?? { ...state.config, [conflict.field]: conflict.file };
        const s = applyResolved({ ...state, touched: true, sizeChoice: null }, resolvedSelection, preview, conflict.field);
        // The switch itself is the customer's pick, even though it arrived via a dialog.
        s.source[conflict.field] = SOURCE_CUSTOMER;
        const previews = { ...state.previews };
        delete previews[action.key];
        return clearTicks({ ...s, previews, resolvedChoices: { ...state.resolvedChoices, [action.key]: "switch" } });
      }

      if (action.how === "same") {
        return reduce(state, { type: "TOGGLE_SAME_BACK" });
      }

      if (action.how === "replace") {
        return reduce(state, { type: "REMOVE_ARTWORK", slot: "front" });
      }

      if (action.how === "fit" || action.how === "fill") {
        // "Keep {ordered Size} and resize my file" (ticket 09): stored in the
        // prototype shape from .scratch/flyer-demo/issues/06-size-mismatch-handling.md
        // ("Recorded on the order line"). `action.result` is a
        // lib/sizeChoice.computeSizeChoice() return value — the reducer stays
        // pure and never does the geometry itself.
        const sizeChoice = {
          choice: "keep_size_scale",
          mode: action.how,
          ordered_size: state.config[conflict.field],
          file_trim_mm: action.fileTrimMm,
          scale_pct: action.result.scalePct,
          white_border_mm: action.result.whiteBorderMm,
          crop_mm: action.result.cropMm,
          applies_to: state.slots.back || state.slots.sameBack ? ["front", "back"] : ["front"],
        };
        return clearTicks({ ...state, sizeChoice, resolvedChoices: { ...state.resolvedChoices, [action.key]: action.how } });
      }

      if (action.how === "upload-back") {
        // A hint pointing at the Back slot, not a transition: the dialog
        // stays open until an actual back upload changes what's detected.
        return state;
      }

      // "keep" (print front only / accept the mismatch): remember it so the
      // dialog doesn't reopen until the file or that option changes. What
      // gets printed just changed (e.g. the Back is now ignored), so this
      // is a Configuration/Artwork change like every other branch above.
      return clearTicks({ ...state, resolvedChoices: { ...state.resolvedChoices, [action.key]: action.how } });
    }

    case "GO_TO_STEP":
      return { ...state, step: action.step, returnToApprove: false };

    case "EDIT_FROM_APPROVE":
      // Only navigation: the draft (Configuration, Artwork, choices) is left as is.
      return { ...state, step: 0, returnToApprove: true, focus: action.focus };

    case "CLEAR_FOCUS":
      return { ...state, focus: null };

    case "RETURN_TO_APPROVE":
      // The customer fixed something: whatever they approved before no longer counts.
      return clearTicks({ ...state, step: 2, returnToApprove: false, focus: null });

    case "SET_TICK":
      return { ...state, ticks: { ...state.ticks, [action.name]: action.value } };

    case "CLEAR_TICKS":
      // The Cut-off countdown reaching zero (spec story 81), on top of every
      // Configuration/Artwork change already covered above.
      return clearTicks(state);

    case "SET_IDEMPOTENCY_KEY":
      // Never overwrites an existing key: a retried/double Submit for the
      // same draft must keep reusing it (spec story 88).
      return state.idempotencyKey ? state : { ...state, idempotencyKey: action.key };

    case "RESET_IDEMPOTENCY_KEY":
      // Unlike SET_IDEMPOTENCY_KEY, always overwrites: called alongside
      // CLEAR_TICKS whenever the approved proof goes stale (a 409, or the
      // countdown expiring) — a *different* submission is coming next, not
      // a retry of this one, so it needs its own key.
      return { ...state, idempotencyKey: action.key };

    case "RESTORE":
      return { ...initDraft(action.defaults), ...action.saved };

    default:
      return state;
  }
}

// ---- persistence ------------------------------------------------------

const PERSISTED_KEYS = ["config", "source", "touched", "slots", "resolvedChoices", "sizeChoice", "step", "ticks", "idempotencyKey", "returnToApprove"];

/** A JSON-safe snapshot for sessionStorage / the URL. Dialogs and previews are
 * derived, not persisted. */
export function serializeDraft(state) {
  const out = {};
  for (const key of PERSISTED_KEYS) out[key] = state[key];
  return out;
}

export function restoreDraft(saved, defaults) {
  return reduce(initDraft(defaults), { type: "RESTORE", defaults, saved });
}
