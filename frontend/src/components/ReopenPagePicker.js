"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { API_BASE_URL } from "@/lib/api";
import { assignPages, newUploadKey } from "@/lib/uploadArtwork";
import { changedFromInitial } from "@/lib/reopenPicker";
import PagePicker from "./PagePicker";

/**
 * The Page picker reopened on a file already stored (Step 1 or Step 2): it lists the
 * source's pages again, starting from the pages in use, and makes new Artwork only
 * when the choice changed. `target` is lib/pagePicker.pickerTargetFor's answer
 * ({sourceId, mode, initial, fixed}); `slots` are the draft's slots (their Artwork
 * ids let one side be checked against the side that stays).
 *
 * `onAssigned({mode, front, back, same})` gets the new Artwork (API shape) for the
 * caller to put into the draft; `onCancel()` closes without changing anything.
 */
export default function ReopenPagePicker({ target, slots, orderedSize, onAssigned, onCancel }) {
  const t = useTranslations("PagePicker");
  const tErrors = useTranslations("ArtworkErrors");
  const [source, setSource] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const attemptRef = useRef({ signature: null, keys: [] }); // one key per identical choice, so a resend is safe

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/sources/${target.sourceId}/`, { cache: "no-store" });
        const data = res.ok ? await res.json() : null;
        if (cancelled) return;
        if (data) setSource(data);
        else setLoadError(res.status === 410 ? "sourceExpired" : "loadError");
      } catch {
        if (!cancelled) setLoadError("loadError");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target.sourceId]);

  function keyFor(signature, step) {
    if (attemptRef.current.signature !== signature) attemptRef.current = { signature, keys: [] };
    attemptRef.current.keys[step] ??= newUploadKey();
    return attemptRef.current.keys[step];
  }

  async function handleConfirm({ front, back, same }) {
    if (!changedFromInitial({ front, back, same }, target.initial, target.mode)) {
      onCancel();
      return;
    }
    const sourceId = source.id;
    const signature = `${sourceId}:${target.mode}:${front}:${back}:${same}`;
    setBusy(true);
    setError(null);
    let result;
    if (target.mode === "back") {
      result = await assignPages({ sourceId, back, frontId: slots.front?.id, key: keyFor(signature, 0) });
    } else if (target.mode === "front") {
      result = await assignPages({ sourceId, front, backId: slots.back?.id, key: keyFor(signature, 0) });
    } else {
      result = await assignPages({ sourceId, front, back: same ? undefined : back, key: keyFor(signature, 0) });
      if (result.ok && same) {
        // Back is Front's own page: the server allows that only for a Back added to an existing Front.
        const copy = await assignPages({ sourceId, back: front, frontId: result.data.front.id, key: keyFor(signature, 1) });
        result = copy.ok ? { ok: true, data: { front: result.data.front, back: copy.data.back } } : copy;
      }
    }
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    onAssigned({ mode: target.mode, front: result.data.front ?? null, back: result.data.back ?? null, same: Boolean(same) });
  }

  if (loadError) {
    return (
      <Overlay onClose={onCancel}>
        <p role="alert" className="text-[#bb0027] text-[13px]">{t(loadError)}</p>
        <button type="button" onClick={onCancel} className="self-end h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold border border-[#e2e8f8]">
          {t("cancel")}
        </button>
      </Overlay>
    );
  }
  if (!source) {
    return (
      <Overlay onClose={onCancel}>
        <p role="status" className="text-[#575c64] text-[13px]">{t("loading")}</p>
      </Overlay>
    );
  }
  return (
    <PagePicker
      source={source}
      orderedSize={orderedSize}
      mode={target.mode}
      fixed={target.fixed}
      initialChoice={target.initial}
      busy={busy}
      error={error}
      onConfirm={handleConfirm}
      onCancel={onCancel}
    />
  );
}

function Overlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-[16px]" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div role="dialog" aria-modal="true" tabIndex={-1} ref={(el) => el?.focus()} className="bg-white rounded-[16px] shadow-lg p-[20px] flex flex-col gap-[12px] outline-none">
        {children}
      </div>
    </div>
  );
}
