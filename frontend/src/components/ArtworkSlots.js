"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL, ARTWORK_ERROR_MESSAGES } from "@/lib/api";
import ArtworkSlot from "./ArtworkSlot";
import DesignHelpDrawer from "./DesignHelpDrawer";

const EMPTY_SLOT = { status: "empty", fileName: "", file: null, artwork: null, error: "" };

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

function firstErrorMessage(data, fallback) {
  const first = data?.errors?.[0];
  if (!first) return fallback;
  return first.message || ARTWORK_ERROR_MESSAGES[first.code] || fallback;
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
  sameAsBack,
  onSameAsBackChange,
  onFrontResult,
  onBackResult,
  onFrontRemoved,
  onBackRemoved,
}) {
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
      setFront({ status: "error", fileName: file.name, file, artwork: null, error: ARTWORK_ERROR_MESSAGES.not_a_pdf });
      return;
    }
    setFront({ status: "checking", fileName: file.name, file, artwork: null, error: "" });

    const { ok, data } = await uploadSlot({ file, slot: "front", productId });
    if (!ok) {
      setFront({ status: "error", fileName: file.name, file, artwork: null, error: firstErrorMessage(data, "Upload failed.") });
      return;
    }

    setFront({ status: "ok", fileName: file.name, file, artwork: data.front, error: "" });
    onFrontResult?.(data.front, data.back);
    frontFilledBothRef.current = Boolean(data.back);

    if (data.back) {
      // A 2-page PDF dropped into Front auto-fills Back from page 2.
      setBack({ status: "ok", fileName: file.name, file, artwork: data.back, error: "" });
      onSameAsBackChange?.(false);
    } else if (sameAsBack) {
      await syncBackToFront(file, data.front?.id);
    }
  }

  async function syncBackToFront(file, frontId) {
    setBack({ status: "checking", fileName: file.name, file, artwork: null, error: "" });
    const { ok, data } = await uploadSlot({ file, slot: "back", productId, frontId });
    if (!ok) {
      setBack({ status: "error", fileName: file.name, file, artwork: null, error: firstErrorMessage(data, "Upload failed.") });
      return;
    }
    setBack({ status: "ok", fileName: file.name, file, artwork: data.back, error: "" });
    onBackResult?.(data.back);
  }

  async function handleBackFile(file) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setBack({ status: "error", fileName: file.name, file, artwork: null, error: ARTWORK_ERROR_MESSAGES.not_a_pdf });
      return;
    }
    setBack({ status: "checking", fileName: file.name, file, artwork: null, error: "" });

    const { ok, data } = await uploadSlot({ file, slot: "back", productId, frontId: front.artwork?.id });
    if (!ok) {
      setBack({ status: "error", fileName: file.name, file, artwork: null, error: firstErrorMessage(data, "Upload failed.") });
      return;
    }
    setBack({ status: "ok", fileName: file.name, file, artwork: data.back, error: "" });
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
          label="Front"
          status={front.status}
          fileName={front.fileName}
          artwork={front.artwork}
          error={front.error}
          onFile={handleFrontFile}
          onRemove={handleRemoveFront}
        />
        <ArtworkSlot
          label="Back"
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
        Use the same artwork for the back
      </label>

      <button
        type="button"
        onClick={() => setDesignHelpOpen(true)}
        className="self-start text-[#bb0027] text-[12px] font-bold underline"
      >
        No file? Get design help
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
