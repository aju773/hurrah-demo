"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, FLYERS_SLUG } from "@/lib/api";
import { fetchWithTimeout } from "@/lib/network";
import {
  canContinue as computeCanContinue,
  guardPage,
  initDraft,
  isRestorableDraft,
  PAGE_OPTIONS,
  openDialogs as computeOpenDialogs,
  pendingEffect,
  reduce,
  restoreDraft,
  serializeDraft,
} from "@/lib/draftOrder";

const STORAGE_KEY = "flyers-draft-order";
const URL_PARAM = "draft";

function readStoredDraft() {
  if (typeof window === "undefined") return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get(URL_PARAM);
    const raw = fromUrl ? decodeURIComponent(fromUrl) : window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistDraft(state) {
  if (typeof window === "undefined") return;
  const saved = serializeDraft(state);
  const json = JSON.stringify(saved);
  try {
    window.sessionStorage.setItem(STORAGE_KEY, json);
  } catch {
    // sessionStorage unavailable (private mode, quota) — the URL still carries it.
  }
  const url = new URL(window.location.href);
  url.searchParams.set(URL_PARAM, encodeURIComponent(json));
  window.history.replaceState(window.history.state, "", url);
}

/** Draft cleared on success (spec story 89's flip side): a placed Order is
 * final, so nothing should offer to resume it as a draft. */
export function clearPersistedDraft() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  const url = new URL(window.location.href);
  url.searchParams.delete(URL_PARAM);
  window.history.replaceState(window.history.state, "", url);
}

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Null when the Configuration can't be had (offline, server error, too slow);
// the page then offers Retry and keeps the customer's choices.
async function fetchConfiguration(locale, selection) {
  const params = new URLSearchParams({ ...selection, locale });
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/products/${FLYERS_SLUG}/configuration/?${params}`, { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// {data} when found; {gone: true} when the server no longer has it (404); otherwise
// neither (offline, server error): the saved slot is kept rather than dropped.
async function fetchArtwork(id) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/artworks/${id}/`, { cache: "no-store" });
    if (res.ok) return { data: await res.json() };
    return { gone: res.status === 404 };
  } catch {
    return {};
  }
}

function toSlotArtwork(data) {
  return {
    id: data.id,
    matchedSizeCode: data.matched_size_code ?? null,
    mm: { width: data.trim_width_mm, height: data.trim_height_mm },
    bleedMm: data.bleed_mm ?? null,
    imageUrl: data.page_image ?? null,
    hasError: !data.is_valid,
    sourceId: data.source_id ?? null,
    page: data.page_index ?? null,
  };
}

/** Wires the pure draftOrder reducer to the Configuration API, sessionStorage
 * and the URL. The reducer never fetches; this hook is the only place that
 * turns a `pendingEffect` into a network call. */
export default function useDraftOrder({ defaults, locale, initialConfiguration, initialPage = null }) {
  const [state, setState] = useState(() => {
    const base = initDraft(defaults);
    // Every draft needs an idempotency key before Submit can be enabled — one
    // it keeps reusing for retries (spec story 88). Generated once here (the
    // initial render, not an effect) so a fresh mount never needs a second
    // render just to fill it in; a rehydrated draft's own saved key (below)
    // takes over once that finishes.
    const withKey = { ...base, idempotencyKey: newIdempotencyKey() };
    if (!initialConfiguration) return withKey;
    // Seed the server-rendered Configuration (quote, blocked map, price grid,
    // clock) so the page isn't blank until the first client-side effect runs.
    return reduce(withKey, {
      type: "REQUOTED",
      selection: initialConfiguration.selection ?? defaults,
      notices: initialConfiguration.notices,
      quote: initialConfiguration.quote,
      blocked: initialConfiguration.blocked,
      priceGrid: initialConfiguration.price_grid,
      clock: initialConfiguration.clock,
      commerceEnabled: initialConfiguration.commerce_enabled,
      turnarounds: initialConfiguration.turnarounds,
      available: initialConfiguration.available,
    });
  });
  const [rehydrating, setRehydrating] = useState(true);
  const [syncFailed, setSyncFailed] = useState(false); // the last Configuration request didn't come back
  const [retryTick, setRetryTick] = useState(0); // bumped by retrySync to run the pending request again
  const dispatch = useCallback((action) => setState((s) => reduce(s, action)), []);
  // True once the customer has a Configuration worth opening a later page for:
  // a restorable saved draft, or a move past the Options page in this visit.
  const startedRef = useRef(false);

  // Rehydrate once on mount: sessionStorage/URL hold Option picks, slot
  // Artwork ids and resolved choices — never file bytes — so a refresh
  // re-fetches each Artwork's detection instead of asking for the file again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = readStoredDraft();
      startedRef.current = isRestorableDraft(saved);
      if (!saved) {
        setRehydrating(false);
        return;
      }
      const slots = { ...saved.slots };
      for (const key of ["front", "back"]) {
        const slot = slots[key];
        if (!slot?.id) continue;
        const fresh = await fetchArtwork(slot.id);
        if (fresh.data) slots[key] = { ...slot, ...toSlotArtwork(fresh.data) };
        else if (fresh.gone) slots[key] = null;
      }
      if (cancelled) return;
      // The persisted snapshot never carries quote/blocked/price-grid (they're
      // not JSON-safe "state", they're a requote away) — ask for a fresh one
      // immediately so the page isn't stuck showing "Not available".
      let restored = reduce(restoreDraft({ ...saved, slots }, defaults), { type: "REQUEST_REQUOTE" });
      // A draft saved before this key existed carries none — keep the one
      // generated at mount above rather than leaving it null.
      if (!restored.idempotencyKey) restored = { ...restored, idempotencyKey: newIdempotencyKey() };
      // The address the customer opened wins over the page the draft was last on.
      if (initialPage) {
        restored = { ...restored, page: guardPage(restored, initialPage, { restorable: startedRef.current }) };
      }
      setState(restored);
      setRehydrating(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (rehydrating) return;
    persistDraft(state);
  }, [state, rehydrating]);

  // Drive whatever effect the reducer is waiting on.
  const inFlight = useRef(null);
  useEffect(() => {
    if (rehydrating) return;
    const effect = pendingEffect(state);
    if (!effect) return;
    const token = `${effect.type}:${JSON.stringify(effect.selection)}:${effect.key ?? ""}`;
    if (inFlight.current === token) return;
    inFlight.current = token;

    (async () => {
      const data = await fetchConfiguration(locale, effect.selection);
      // A newer pick/upload may have started a different request while this
      // one was in flight; an out-of-order, now-stale response must not
      // clobber state a newer request already (or will soon) supersede.
      if (inFlight.current !== token) return;
      if (!data) {
        setSyncFailed(true); // the customer can Retry; a later pick also tries again
        return;
      }
      setSyncFailed(false);
      if (effect.type === "requote") {
        dispatch({
          type: "REQUOTED",
          selection: data.selection,
          notices: data.notices,
          quote: data.quote,
          blocked: data.blocked,
          priceGrid: data.price_grid,
          clock: data.clock,
          commerceEnabled: data.commerce_enabled,
          turnarounds: data.turnarounds,
          available: data.available,
        });
      } else if (effect.type === "preview-switch") {
        dispatch({ type: "PREVIEW_READY", key: effect.key, quote: data.quote, notices: data.notices, resolvedSelection: data.selection });
      }
    })().finally(() => {
      // Only clear it if nothing newer has already taken over the slot —
      // otherwise a stale request finishing late would let a duplicate of
      // the *current* one be launched again on the next render.
      if (inFlight.current === token) inFlight.current = null;
    });
  }, [state, rehydrating, locale, dispatch, retryTick]);

  return {
    state,
    rehydrating,
    syncFailed,
    retrySync: () => {
      inFlight.current = null;
      setSyncFailed(false);
      setRetryTick((n) => n + 1);
    },
    dialogs: computeOpenDialogs(state),
    canContinue: computeCanContinue(state),
    pick: (option, value) => dispatch({ type: "PICK", option, value }),
    uploadFront: (artwork) => dispatch({ type: "UPLOAD_FRONT", artwork }),
    uploadBack: (artwork) => dispatch({ type: "UPLOAD_BACK", artwork }),
    removeArtwork: (slot) => dispatch({ type: "REMOVE_ARTWORK", slot }),
    toggleSameBack: () => dispatch({ type: "TOGGLE_SAME_BACK" }),
    rotate: (slot) => dispatch({ type: "TOGGLE_ROTATE", slot }),
    previewSwitch: (key) => dispatch({ type: "PREVIEW_SWITCH", key }),
    // `extra` carries { result, fileTrimMm } for how="fit"/"fill" (ticket 09):
    // lib/sizeChoice.computeSizeChoice()'s return value plus the file's own
    // trim mm, computed by the caller so this hook and the reducer stay pure.
    resolveDialog: (key, how, extra) => dispatch({ type: "RESOLVE_DIALOG", key, how, ...extra }),
    refresh: () => dispatch({ type: "REQUEST_REQUOTE" }),
    goToPage: (page) => {
      if (page !== PAGE_OPTIONS) startedRef.current = true;
      dispatch({ type: "GO_TO_PAGE", page });
    },
    isRestorable: () => startedRef.current,
    // The Approve page's "Edit options" / "Change file": `focus` is "options" | "front" | "back".
    editFromApprove: (focus) => {
      startedRef.current = true;
      dispatch({ type: "EDIT_FROM_APPROVE", focus });
    },
    clearFocus: () => dispatch({ type: "CLEAR_FOCUS" }),
    returnToApprove: () => dispatch({ type: "RETURN_TO_APPROVE" }),
    setTick: (name, value) => dispatch({ type: "SET_TICK", name, value }),
    clearTicks: () => dispatch({ type: "CLEAR_TICKS" }),
    // The proof just went stale (409) or the Cut-off countdown hit zero: the
    // *next* Submit is a different submission, not a retry of this one, so
    // it needs a fresh idempotency key alongside the cleared ticks.
    resetIdempotencyKey: () => dispatch({ type: "RESET_IDEMPOTENCY_KEY", key: newIdempotencyKey() }),
  };
}

export { toSlotArtwork };
