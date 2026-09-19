"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, FLYERS_SLUG } from "@/lib/api";
import {
  canContinue as computeCanContinue,
  initDraft,
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

async function fetchConfiguration(locale, selection) {
  const params = new URLSearchParams({ ...selection, locale });
  const res = await fetch(`${API_BASE_URL}/api/products/${FLYERS_SLUG}/configuration/?${params}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

async function fetchArtwork(id) {
  const res = await fetch(`${API_BASE_URL}/api/artworks/${id}/`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

function toSlotArtwork(data) {
  return {
    id: data.id,
    matchedSizeCode: data.matched_size_code ?? null,
    mm: { width: data.trim_width_mm, height: data.trim_height_mm },
    bleedMm: data.bleed_mm ?? null,
    imageUrl: data.page_image ?? null,
    hasError: !data.is_valid,
  };
}

/** Wires the pure draftOrder reducer to the Configuration API, sessionStorage
 * and the URL. The reducer never fetches; this hook is the only place that
 * turns a `pendingEffect` into a network call. */
export default function useDraftOrder({ defaults, locale, initialConfiguration }) {
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
  const dispatch = useCallback((action) => setState((s) => reduce(s, action)), []);

  // Rehydrate once on mount: sessionStorage/URL hold Option picks, slot
  // Artwork ids and resolved choices — never file bytes — so a refresh
  // re-fetches each Artwork's detection instead of asking for the file again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = readStoredDraft();
      if (!saved) {
        setRehydrating(false);
        return;
      }
      const slots = { ...saved.slots };
      for (const key of ["front", "back"]) {
        const slot = slots[key];
        if (!slot?.id) continue;
        const fresh = await fetchArtwork(slot.id);
        slots[key] = fresh ? { ...slot, ...toSlotArtwork(fresh) } : null;
      }
      if (cancelled) return;
      // The persisted snapshot never carries quote/blocked/price-grid (they're
      // not JSON-safe "state", they're a requote away) — ask for a fresh one
      // immediately so the page isn't stuck showing "Not available".
      let restored = reduce(restoreDraft({ ...saved, slots }, defaults), { type: "REQUEST_REQUOTE" });
      // A draft saved before this key existed carries none — keep the one
      // generated at mount above rather than leaving it null.
      if (!restored.idempotencyKey) restored = { ...restored, idempotencyKey: newIdempotencyKey() };
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
      if (!data) return; // a later effect (or unmount) will retry
      // A newer pick/upload may have started a different request while this
      // one was in flight; an out-of-order, now-stale response must not
      // clobber state a newer request already (or will soon) supersede.
      if (inFlight.current !== token) return;
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
  }, [state, rehydrating, locale, dispatch]);

  return {
    state,
    rehydrating,
    dialogs: computeOpenDialogs(state),
    canContinue: computeCanContinue(state),
    pick: (option, value) => dispatch({ type: "PICK", option, value }),
    uploadFront: (artwork) => dispatch({ type: "UPLOAD_FRONT", artwork }),
    uploadBack: (artwork) => dispatch({ type: "UPLOAD_BACK", artwork }),
    removeArtwork: (slot) => dispatch({ type: "REMOVE_ARTWORK", slot }),
    toggleSameBack: () => dispatch({ type: "TOGGLE_SAME_BACK" }),
    previewSwitch: (key) => dispatch({ type: "PREVIEW_SWITCH", key }),
    // `extra` carries { result, fileTrimMm } for how="fit"/"fill" (ticket 09):
    // lib/sizeChoice.computeSizeChoice()'s return value plus the file's own
    // trim mm, computed by the caller so this hook and the reducer stay pure.
    resolveDialog: (key, how, extra) => dispatch({ type: "RESOLVE_DIALOG", key, how, ...extra }),
    refresh: () => dispatch({ type: "REQUEST_REQUOTE" }),
    goToStep: (step) => dispatch({ type: "GO_TO_STEP", step }),
    setTick: (name, value) => dispatch({ type: "SET_TICK", name, value }),
    clearTicks: () => dispatch({ type: "CLEAR_TICKS" }),
    // The proof just went stale (409) or the Cut-off countdown hit zero: the
    // *next* Submit is a different submission, not a retry of this one, so
    // it needs a fresh idempotency key alongside the cleared ticks.
    resetIdempotencyKey: () => dispatch({ type: "RESET_IDEMPOTENCY_KEY", key: newIdempotencyKey() }),
  };
}

export { toSlotArtwork };
