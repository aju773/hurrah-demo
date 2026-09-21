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

// The pages of the journey, in order. Findings and the Proof preview live on the
// Artwork page, beside the upload.
export const PAGE_OPTIONS = "options";
export const PAGE_ARTWORK = "artwork";
export const PAGE_APPROVE = "approve";
export const PAGES = [PAGE_OPTIONS, PAGE_ARTWORK, PAGE_APPROVE];

/** Each page's address under the locale (the Options page keeps the flyers address). */
export const PAGE_PATHS = {
  [PAGE_OPTIONS]: "/flyers",
  [PAGE_ARTWORK]: "/flyers/artwork",
  [PAGE_APPROVE]: "/flyers/approve",
};

/** The page an address belongs to, or null for any other address. */
export function pageForPath(pathname) {
  const path = (pathname ?? "").replace(/\/+$/, "") || "/";
  return PAGES.find((page) => PAGE_PATHS[page] === path) ?? null;
}

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
    // Rotate: a side printed turned a quarter turn (90° clockwise). An instruction only,
    // kept with the size choice; the uploaded file is never changed. `back` is the
    // Back file's own turn (a same-as-front Back turns with the Front: see rotatedSides).
    rotate: { front: false, back: false },
    // Swap: the uploaded Back prints as Front and the uploaded Front as Back. An
    // instruction only; needs both files (see swappedSides). `rotate` stays keyed
    // by the uploaded file, so a turn follows its page across a Swap.
    swap: false,
    previews: {},
    pendingRequote: null,
    // True after choosing single-sided dropped an uploaded Back; the Artwork page
    // says so until a Back is added again or double-sided is chosen.
    backDropped: false,
    page: PAGE_OPTIONS,
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
    // Approve page ticks (spec stories 78-79, 82): cleared whenever the
    // Configuration or Artwork changes, or the Cut-off countdown expires.
    ticks: { approval: false, warnings: false },
    // Generated once (useDraftOrder) and persisted, so a retried/double Submit
    // reuses the same key (spec story 88).
    idempotencyKey: null,
    // "Edit options" / "Change file" on the Approve page (spec story 88): while true,
    // the Artwork page's Continue returns straight to Approve. `focus` is where the
    // page should put the cursor ("options" | "front" | "back"); transient, never persisted.
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

/** Whether the Approve page may open: a Front that Preflight has not rejected and
 * no open dialog. Same rule as the Artwork page's Continue. */
export function hasAcceptedFront(state) {
  return canContinue(state);
}

/** Whether a saved draft holds a Configuration worth reopening a later page for:
 * the customer chose something, already moved past the Options page, or has Artwork.
 * A draft that only holds the untouched defaults (someone merely looked at the
 * Options page) does not count. */
export function isRestorableDraft(saved) {
  if (!saved) return false;
  return Boolean(saved.touched || (saved.page && saved.page !== PAGE_OPTIONS) || saved.slots?.front?.id);
}

/** Where a customer asking for `requested` may actually land. Opening the Artwork
 * or Approve page with no restorable Configuration goes to the Options page; opening
 * Approve without accepted Front Artwork goes to the Artwork page. */
export function guardPage(state, requested, { restorable }) {
  if (!PAGES.includes(requested) || requested === PAGE_OPTIONS) return PAGE_OPTIONS;
  if (!restorable) return PAGE_OPTIONS;
  if (requested === PAGE_APPROVE && !hasAcceptedFront(state)) return PAGE_ARTWORK;
  return requested;
}

/** Whether Swap is in force: it needs a Front and a Back that is not the Front again. */
export function swappedSides(state) {
  return Boolean(state.swap && state.slots.front && state.slots.back && !state.slots.sameBack);
}

/** The turns Preview and Approve apply, per side as printed (after Swap): a
 * same-as-front Back turns with the Front, and a side with no file is never turned. */
export function rotatedSides(state) {
  const front = Boolean(state.slots.front && state.rotate?.front);
  if (state.slots.sameBack) return { front, back: front };
  const back = Boolean(state.slots.back && state.rotate?.back);
  return swappedSides(state) ? { front: back, back: front } : { front, back };
}

/** The `size_choice` an Order is sent with: the Fit/Fill choice (if the customer made
 * one) with Rotate (`rotate`, per side as printed) and Swap beside it, or null when
 * there is none of them. */
export function sizeChoiceWithInstructions(sizeChoice, rotate, swap) {
  const resize = sizeChoice?.choice === "keep_size_scale" ? sizeChoice : null;
  const turned = rotate?.front || rotate?.back;
  if (!turned && !swap) return resize;
  return {
    ...(resize ?? {}),
    ...(swap ? { swap: true } : {}),
    ...(turned ? { rotate: { front: Boolean(rotate.front), back: Boolean(rotate.back) } } : {}),
  };
}

export function sizeChoiceForOrder(state) {
  return sizeChoiceWithInstructions(state.sizeChoice, rotatedSides(state), swappedSides(state));
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

// A turn belongs to the file it was chosen for: `sides` lose theirs when that file goes.
function withoutRotation(rotate, ...sides) {
  const next = { front: false, back: false, ...rotate };
  for (const side of sides) next[side] = false;
  return next;
}

function withSlots(state, slots, { resetSizeChoice = true } = {}) {
  return fileSync(clearTicks({
    ...state,
    slots,
    resolvedChoices: {},
    sizeChoice: resetSizeChoice ? null : state.sizeChoice,
    // Swap belongs to the pair of files it was chosen for.
    swap: false,
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
      // Choosing single-sided after upload keeps the Front and drops the Back,
      // rather than opening a dialog about a difference the customer just chose.
      const dropsBack = option === SIDES_OPTION && value === SIDES_SINGLE && state.config[SIDES_OPTION] !== SIDES_SINGLE && Boolean(state.slots.back || state.slots.sameBack);
      const slots = dropsBack ? { ...state.slots, back: null, sameBack: false, frontFilledBoth: false } : state.slots;
      let sizeChoice = option === SIZE_OPTION ? null : state.sizeChoice;
      if (dropsBack && sizeChoice) sizeChoice = { ...sizeChoice, applies_to: ["front"] };
      return clearTicks({
        ...state,
        config,
        source,
        touched: true,
        resolvedChoices,
        slots,
        rotate: dropsBack ? withoutRotation(state.rotate, "back") : state.rotate,
        swap: dropsBack ? false : state.swap,
        backDropped: dropsBack || (option === SIDES_OPTION && value !== SIDES_SINGLE ? false : state.backDropped),
        // A later Size change from Edit spec reopens the mismatch dialog and
        // makes any earlier Fit/Fill instruction stale (spec: "resets when
        // the file or Size changes").
        sizeChoice,
        previews: dropsBack ? {} : state.previews,
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
        // The Page picker's choice: which stored source and which of its pages.
        sourceId: action.artwork.sourceId ?? null,
        page: action.artwork.page ?? null,
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
          sourceId: action.artwork.sourceId ?? null,
          page: action.artwork.backPage ?? null,
        };
        frontFilledBoth = true;
      }
      const rotate = withoutRotation(state.rotate, "front", ...(frontFilledBoth ? ["back"] : []));
      return { ...withSlots(state, { ...state.slots, front, back, sameBack: frontFilledBoth ? false : state.slots.sameBack, frontFilledBoth }), rotate };
    }

    case "UPLOAD_BACK": {
      const back = {
        id: action.artwork.id,
        matchedSizeCode: action.artwork.matchedSizeCode ?? null,
        bleedMm: action.artwork.bleedMm ?? null,
        mm: action.artwork.mm ?? null,
        imageUrl: action.artwork.imageUrl ?? null,
        hasError: Boolean(action.artwork.hasError),
        sourceId: action.artwork.sourceId ?? null,
        page: action.artwork.page ?? null,
      };
      return { ...withSlots(state, { ...state.slots, back, sameBack: false }), rotate: withoutRotation(state.rotate, "back"), backDropped: false };
    }

    case "REMOVE_ARTWORK": {
      if (action.slot === "back") {
        return { ...withSlots(state, { ...state.slots, back: null, sameBack: false }), rotate: withoutRotation(state.rotate, "back") };
      }
      const clearBack = state.slots.frontFilledBoth;
      return {
        ...withSlots(state, { front: null, back: clearBack ? null : state.slots.back, sameBack: clearBack ? false : state.slots.sameBack, frontFilledBoth: false }),
        rotate: withoutRotation(state.rotate, "front", ...(clearBack ? ["back"] : [])),
      };
    }

    case "TOGGLE_ROTATE": {
      // Turns (or un-turns) one side. Only the instruction changes; what the customer
      // approved was a different Proof, so the ticks go.
      if (action.slot !== "front" && action.slot !== "back") return state;
      // `action.slot` is the side as printed; the turn is kept with the uploaded file.
      const file = swappedSides(state) ? (action.slot === "front" ? "back" : "front") : action.slot;
      const rotate = { front: false, back: false, ...state.rotate };
      rotate[file] = !rotate[file];
      return clearTicks({ ...state, rotate });
    }

    case "TOGGLE_SWAP": {
      // Needs both files. Only the instruction changes; the Proof is a different
      // one now, so the ticks go.
      if (!state.slots.front || !state.slots.back || state.slots.sameBack) return state;
      return clearTicks({ ...state, swap: !state.swap });
    }

    case "TOGGLE_SAME_BACK": {
      // Doesn't change the Front file or the ordered Size, so an existing
      // Fit/Fill instruction (ticket 09) stays valid — only widen its
      // applies_to to cover the Back slot it now also governs.
      const sameBack = !state.slots.sameBack;
      const slots = { ...state.slots, sameBack, back: sameBack ? state.slots.back : null };
      const next = { ...withSlots(state, slots, { resetSizeChoice: false }), backDropped: sameBack ? false : state.backDropped };
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

    case "GO_TO_PAGE": {
      // Options -> Artwork keeps "return to approval" (Edit options from Approve
      // runs through the Artwork page); landing on Approve ends it.
      const keepReturn = action.page !== PAGE_APPROVE;
      return { ...state, page: action.page, returnToApprove: keepReturn ? state.returnToApprove : false };
    }

    case "EDIT_FROM_APPROVE":
      // Only navigation: the draft (Configuration, Artwork, choices) is left as is.
      return { ...state, page: action.focus === "options" ? PAGE_OPTIONS : PAGE_ARTWORK, returnToApprove: true, focus: action.focus };

    case "CLEAR_FOCUS":
      return { ...state, focus: null };

    case "RETURN_TO_APPROVE":
      // The customer fixed something: whatever they approved before no longer counts.
      return clearTicks({ ...state, page: PAGE_APPROVE, returnToApprove: false, focus: null });

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

    case "RESTORE": {
      const restored = { ...initDraft(action.defaults), ...action.saved };
      delete restored.step; // drafts saved before the journey had pages
      if (restored.page === "check") restored.page = PAGE_ARTWORK; // drafts saved before Check was merged into Artwork
      if (!PAGES.includes(restored.page)) restored.page = PAGE_OPTIONS;
      // Approve draws the Front's preview; without a stored Front there is
      // nothing to draw, so a stale draft reopens on the Artwork page.
      if (restored.page === PAGE_APPROVE && !restored.slots?.front?.id) restored.page = PAGE_ARTWORK;
      return restored;
    }

    default:
      return state;
  }
}

// ---- persistence ------------------------------------------------------

const PERSISTED_KEYS = ["config", "source", "touched", "slots", "resolvedChoices", "sizeChoice", "rotate", "swap", "backDropped", "page", "ticks", "idempotencyKey", "returnToApprove"];

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
