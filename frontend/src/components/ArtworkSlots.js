"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { API_BASE_URL } from "@/lib/api";
import { NETWORK_FAILED, SERVER_BUSY } from "@/lib/artworkErrors";
import { newUploadKey, startUpload } from "@/lib/uploadArtwork";
import ArtworkSlot from "./ArtworkSlot";
import DesignHelpDrawer from "./DesignHelpDrawer";

// A slot's error is {code, message}: the code picks the translated text in
// ArtworkSlot, and the server's English message covers a code we don't know yet.
// The file is never judged by its name here; the server checks what it is.
// `key` identifies one upload across Retry, so the server never stores it twice.
const RETRYABLE = new Set([NETWORK_FAILED, SERVER_BUSY]);
const EMPTY_SLOT = { status: "empty", fileName: "", file: null, artwork: null, error: null, progress: 0, key: null, cancelled: false };

/**
 * Step 1's Front/Back artwork slots. A 2-page PDF dropped into Front fills
 * both slots. "Use the same artwork for the back" re-uploads Front's file
 * into the Back slot without the customer picking it twice.
 *
 * `sameAsBack` and its toggle are controlled by the parent (the draft-order
 * state, ticket 05) so a sync dialog's "use the same artwork for the back"
 * choice can drive this slot exactly like the checkbox does. The on*Result
 * callbacks report every successful upload/removal up to that same draft.
 */
export default function ArtworkSlots({
  productId,
  initialFrontId,
  initialBackId,
  sameAsBack,
  onSameAsBackChange,
  onFrontResult,
  onBackResult,
  onFrontRemoved,
  onBackRemoved,
}) {
  const t = useTranslations("ArtworkSlots");
  const [front, setFront] = useState(EMPTY_SLOT);
  const [back, setBack] = useState(EMPTY_SLOT);
  const [designHelpOpen, setDesignHelpOpen] = useState(false);
  // Whether the current Front file is the one that auto-filled Back (a 2-page
  // PDF's page 2) — removing Front then has to clear that Back card too, the
  // same as it does for "same as back", or a stale "Detected" card is left
  // showing a Back the draft no longer knows about.
  const frontFilledBothRef = useRef(false);
  const uploadsRef = useRef({ front: null, back: null }); // the in-flight uploads, to cancel
  const retryRef = useRef({ front: null, back: null }); // re-runs a failed upload with the same file

  const setSlotFor = { front: setFront, back: setBack };

  // One upload into a slot: the slot shows a progress bar while bytes go out,
  // then the "Checking your file…" stage. Resolves with the upload's result; on
  // a failure the slot already shows the error, and Retry (`retryRef`) re-runs
  // the same call with the same file and key so the server stores it once.
  async function runUpload(which, { file, key, frontId, retry }) {
    const setSlot = setSlotFor[which];
    const base = { ...EMPTY_SLOT, fileName: file.name, file, key };
    setSlot({ ...base, status: "uploading" });
    const upload = startUpload({
      file,
      slot: which,
      productId,
      frontId,
      key,
      onProgress: (progress) => setSlot((s) => (s.status === "uploading" ? { ...s, progress } : s)),
      onSent: () => setSlot((s) => (s.status === "uploading" ? { ...s, status: "checking", progress: 1 } : s)),
    });
    uploadsRef.current[which] = upload;
    const result = await upload.promise;
    if (uploadsRef.current[which] === upload) uploadsRef.current[which] = null;
    if (!result.cancelled && !result.ok) {
      retryRef.current[which] = retry;
      setSlot({ ...base, status: "error", error: result.error });
    }
    return result;
  }

  const okSlot = (file, artwork, key) => ({ ...EMPTY_SLOT, status: "ok", fileName: file.name, file, artwork, key });

  async function handleFrontFile(file, key = newUploadKey()) {
    const result = await runUpload("front", { file, key, retry: () => handleFrontFile(file, key) });
    if (!result.ok) return;
    const { data } = result;

    setFront(okSlot(file, data.front, key));
    onFrontResult?.(data.front, data.back);
    frontFilledBothRef.current = Boolean(data.back);

    if (data.back) {
      // A 2-page PDF dropped into Front auto-fills Back from page 2.
      setBack(okSlot(file, data.back, key));
      onSameAsBackChange?.(false);
    } else if (sameAsBack) {
      await syncBackToFront(file, data.front?.id);
    }
  }

  async function syncBackToFront(file, frontId, key = newUploadKey()) {
    const result = await runUpload("back", { file, key, frontId, retry: () => syncBackToFront(file, frontId, key) });
    if (!result.ok) return;
    setBack(okSlot(file, result.data.back, key));
    onBackResult?.(result.data.back);
  }

  async function handleBackFile(file, key = newUploadKey()) {
    const result = await runUpload("back", { file, key, frontId: front.artwork?.id, retry: () => handleBackFile(file, key) });
    if (!result.ok) return;
    setBack(okSlot(file, result.data.back, key));
    onBackResult?.(result.data.back);
    frontFilledBothRef.current = false; // Back is now its own upload, not Front's page 2.
  }

  // Stops the request and returns the slot to "ready for another file". The
  // server is asked to drop anything it had already stored (uploadArtwork.js).
  function handleCancel(which) {
    uploadsRef.current[which]?.cancel();
    uploadsRef.current[which] = null;
    setSlotFor[which]({ ...EMPTY_SLOT, cancelled: true });
    // A cancelled "same as front" copy can't be left switched on with an empty Back.
    if (which === "back" && sameAsBack) onSameAsBackChange?.(false);
  }

  function handleRemoveFront() {
    setFront(EMPTY_SLOT);
    onFrontRemoved?.();
    if (sameAsBack || frontFilledBothRef.current) {
      setBack(EMPTY_SLOT);
      onBackRemoved?.();
    }
    frontFilledBothRef.current = false;
  }

  function handleRemoveBack() {
    setBack(EMPTY_SLOT);
    onBackRemoved?.();
  }

  function handleSameAsBackToggle(checked) {
    onSameAsBackChange?.(checked);
    if (!checked) {
      setBack(EMPTY_SLOT);
      onBackRemoved?.();
    }
  }

  // A draft that already holds Artwork (a language switch or a refresh remounts
  // this component) shows those cards again: the Artwork is fetched by id, never
  // re-uploaded or re-checked. Mount-only on purpose — after that, uploads and
  // removals in this component are the source of truth.
  useEffect(() => {
    let cancelled = false;
    async function load(id) {
      if (!id) return null;
      const res = await fetch(`${API_BASE_URL}/api/artworks/${id}/`, { cache: "no-store" }).catch(() => null);
      return res?.ok ? res.json() : null;
    }
    (async () => {
      const [frontData, backData] = await Promise.all([load(initialFrontId), load(initialBackId)]);
      if (cancelled) return;
      const asSlot = (data) => ({ ...EMPTY_SLOT, status: "ok", fileName: data.original_filename, artwork: data });
      if (frontData) setFront(asSlot(frontData));
      if (backData) setBack(asSlot(backData));
      // A 2-page PDF's page 2 in Back: removing Front has to clear it too.
      frontFilledBothRef.current = Boolean(frontData && backData && frontData.source_page_count === 2 && backData.page_index === 2);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drives the actual re-upload whenever "same as back" turns on — whether
  // from the checkbox above or from a sync dialog's "use the same artwork
  // for the back" choice (ticket 05), which sets this prop from outside.
  useEffect(() => {
    if (sameAsBack && front.status === "ok" && front.file && back.status !== "ok" && back.status !== "uploading" && back.status !== "checking") {
      syncBackToFront(front.file, front.artwork?.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameAsBack, front.status]);

  return (
    <div className="flex flex-col gap-[16px] w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[16px] w-full">
        <ArtworkSlot
          id="artwork-slot-front"
          label={t("front")}
          status={front.status}
          fileName={front.fileName}
          artwork={front.artwork}
          error={front.error}
          progress={front.progress}
          cancelled={front.cancelled}
          canRetry={Boolean(front.file) && RETRYABLE.has(front.error?.code)}
          onFile={handleFrontFile}
          onRemove={handleRemoveFront}
          onCancel={() => handleCancel("front")}
          onRetry={() => retryRef.current.front?.()}
        />
        <ArtworkSlot
          id="artwork-slot-back"
          label={t("back")}
          status={back.status}
          fileName={back.fileName}
          artwork={back.artwork}
          error={back.error}
          progress={back.progress}
          cancelled={back.cancelled}
          canRetry={Boolean(back.file) && RETRYABLE.has(back.error?.code)}
          disabled={sameAsBack}
          onFile={handleBackFile}
          onRemove={handleRemoveBack}
          onCancel={() => handleCancel("back")}
          onRetry={() => retryRef.current.back?.()}
        />
      </div>

      <label className="flex items-center gap-[8px] text-[13px] text-[#151c27]">
        <input
          type="checkbox"
          checked={sameAsBack}
          onChange={(e) => handleSameAsBackToggle(e.target.checked)}
          className="size-[16px]"
        />
        {t("sameAsBack")}
      </label>

      <button
        type="button"
        onClick={() => setDesignHelpOpen(true)}
        className="self-start text-[#bb0027] text-[12px] font-bold underline"
      >
        {t("designHelp")}
      </button>

      <DesignHelpDrawer
        open={designHelpOpen}
        onClose={() => setDesignHelpOpen(false)}
        product={{ id: productId }}
        configurationLine=""
        configurationSnapshot={null}
      />
    </div>
  );
}
