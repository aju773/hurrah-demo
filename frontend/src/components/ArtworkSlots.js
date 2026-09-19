"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { API_BASE_URL, ARTWORK_ERROR_MESSAGES } from "@/lib/api";
import ArtworkSlot from "./ArtworkSlot";
import DesignHelpDrawer from "./DesignHelpDrawer";

const EMPTY_SLOT = { status: "empty", fileName: "", file: null, artwork: null, error: null };

// A slot's error is the server's {code, message}; the code picks the translated
// text in ArtworkSlot, and the English message covers a code we don't know yet.
function errorOf(code) {
  return { code, message: ARTWORK_ERROR_MESSAGES[code] };
}

async function uploadSlot({ file, slot, productId, frontId }) {
  const form = new FormData();
  form.append("file", file);
  form.append("slot", slot);
  form.append("product", productId);
  if (frontId) form.append("front_id", frontId);

  const res = await fetch(`${API_BASE_URL}/api/artworks/`, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function firstError(data) {
  const first = data?.errors?.[0];
  if (!first) return errorOf("upload_failed");
  return { code: first.code, message: first.message || ARTWORK_ERROR_MESSAGES[first.code] };
}

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

  async function handleFrontFile(file) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setFront({ status: "error", fileName: file.name, file, artwork: null, error: errorOf("not_a_pdf") });
      return;
    }
    setFront({ status: "checking", fileName: file.name, file, artwork: null, error: null });

    const { ok, data } = await uploadSlot({ file, slot: "front", productId });
    if (!ok) {
      setFront({ status: "error", fileName: file.name, file, artwork: null, error: firstError(data) });
      return;
    }

    setFront({ status: "ok", fileName: file.name, file, artwork: data.front, error: null });
    onFrontResult?.(data.front, data.back);
    frontFilledBothRef.current = Boolean(data.back);

    if (data.back) {
      // A 2-page PDF dropped into Front auto-fills Back from page 2.
      setBack({ status: "ok", fileName: file.name, file, artwork: data.back, error: null });
      onSameAsBackChange?.(false);
    } else if (sameAsBack) {
      await syncBackToFront(file, data.front?.id);
    }
  }

  async function syncBackToFront(file, frontId) {
    setBack({ status: "checking", fileName: file.name, file, artwork: null, error: null });
    const { ok, data } = await uploadSlot({ file, slot: "back", productId, frontId });
    if (!ok) {
      setBack({ status: "error", fileName: file.name, file, artwork: null, error: firstError(data) });
      return;
    }
    setBack({ status: "ok", fileName: file.name, file, artwork: data.back, error: null });
    onBackResult?.(data.back);
  }

  async function handleBackFile(file) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setBack({ status: "error", fileName: file.name, file, artwork: null, error: errorOf("not_a_pdf") });
      return;
    }
    setBack({ status: "checking", fileName: file.name, file, artwork: null, error: null });

    const { ok, data } = await uploadSlot({ file, slot: "back", productId, frontId: front.artwork?.id });
    if (!ok) {
      setBack({ status: "error", fileName: file.name, file, artwork: null, error: firstError(data) });
      return;
    }
    setBack({ status: "ok", fileName: file.name, file, artwork: data.back, error: null });
    onBackResult?.(data.back);
    frontFilledBothRef.current = false; // Back is now its own upload, not Front's page 2.
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
      const asSlot = (data) => ({ status: "ok", fileName: data.original_filename, file: null, artwork: data, error: null });
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
    if (sameAsBack && front.status === "ok" && front.file && back.status !== "ok" && back.status !== "checking") {
      syncBackToFront(front.file, front.artwork?.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameAsBack, front.status]);

  return (
    <div className="flex flex-col gap-[16px] w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[16px] w-full">
        <ArtworkSlot
          label={t("front")}
          status={front.status}
          fileName={front.fileName}
          artwork={front.artwork}
          error={front.error}
          onFile={handleFrontFile}
          onRemove={handleRemoveFront}
        />
        <ArtworkSlot
          label={t("back")}
          status={back.status}
          fileName={back.fileName}
          artwork={back.artwork}
          error={back.error}
          disabled={sameAsBack}
          onFile={handleBackFile}
          onRemove={handleRemoveBack}
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
