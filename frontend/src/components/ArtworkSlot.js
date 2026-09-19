"use client";

import { useRef } from "react";
import { preflightHeadline } from "@/lib/preflight";

const TRIM_SOURCE_LABELS = {
  trimbox: "from TrimBox",
  crop: "from CropBox",
  media: "page size, no bleed",
  media_minus_bleed: "page size minus bleed",
};

/**
 * One Front/Back upload slot: drop zone, "Checking your file…" spinner state,
 * a detected summary (size/orientation/bleed) or an error message, and a
 * remove-file control. Purely presentational — ArtworkSlots owns the upload.
 */
export default function ArtworkSlot({ label, status, fileName, artwork, error, disabled, onFile, onRemove }) {
  const inputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  const isEmpty = status === "empty";
  const isChecking = status === "checking";
  const isDone = status === "ok" || status === "error";
  const hasSlotError = status === "error" || (artwork && !artwork.is_valid);
  const headline = status === "ok" ? preflightHeadline(artwork) : null;
  const sizeLabel = artwork?.matched_size_code
    ? artwork.matched_size_code.toUpperCase()
    : artwork
    ? `Custom (${artwork.trim_width_mm} × ${artwork.trim_height_mm} mm)`
    : null;

  return (
    <div className="bg-white flex flex-col overflow-clip rounded-[16px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] w-full">
      <div className="bg-[#2a313d] flex items-center justify-between px-[16px] py-[12px] w-full">
        <span className="text-[#ebf1ff] text-[16px] font-semibold tracking-[-0.16px]">{label}</span>
        {isDone && !hasSlotError && (
          <span className="bg-[#1a7f37] text-white text-[10px] font-semibold tracking-[0.4px] uppercase px-[8px] py-[2px] rounded-[4px]">
            Detected
          </span>
        )}
        {hasSlotError && (
          <span className="bg-[#bb0027] text-white text-[10px] font-semibold tracking-[0.4px] uppercase px-[8px] py-[2px] rounded-[4px]">
            Error
          </span>
        )}
      </div>

      <div className="p-[16px] w-full">
        {isEmpty && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-[12px] px-[16px] py-[32px] w-full transition-colors ${
              disabled ? "bg-[#f0f3ff] opacity-50" : "bg-[rgba(240,243,255,0.6)]"
            }`}
          >
            <p className="text-[#151c27] text-[14px] font-semibold text-center mb-[4px]">
              Drag &amp; drop a PDF here
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="text-[#575c64] text-[12px] text-center mb-[8px]"
            >
              or <span className="text-[#bb0027] font-bold underline">browse from your computer</span>
            </button>
            <span className="bg-white text-[#575c64] text-[11px] font-bold tracking-[0.22px] px-[12px] py-[6px] rounded-full">
              PDF only
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={disabled}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFile(file);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {isChecking && (
          <div className="flex flex-col items-center justify-center rounded-[12px] px-[16px] py-[32px] w-full bg-[rgba(240,243,255,0.6)]">
            <div className="size-[24px] border-2 border-[#e2e8f8] border-t-[#bb0027] rounded-full animate-spin mb-[8px]" />
            <p className="text-[#575c64] text-[13px]">Checking your file…</p>
          </div>
        )}

        {isDone && (
          <div className="flex flex-col gap-[8px]">
            <div className="flex items-center justify-between bg-[#f0f3ff] px-[10px] py-[8px] rounded-[10px] w-full">
              <span className="text-[#151c27] text-[12px] truncate" style={{ maxWidth: "260px" }}>
                {fileName}
              </span>
              <button type="button" onClick={onRemove} className="text-[#575c64] text-[11px] font-semibold underline shrink-0">
                {hasSlotError ? "Upload another file" : "Remove"}
              </button>
            </div>

            {headline && (
              <p className="text-[13px] font-semibold flex items-center gap-[6px]" style={{ color: headline.severity === "warning" ? "#6f5400" : "#151c27" }}>
                <span>{headline.icon}</span>
                <span>{headline.text}</span>
              </p>
            )}

            {hasSlotError ? (
              <p className="text-[#bb0027] text-[12px]">{error || artwork?.error_message}</p>
            ) : (
              artwork && (
                <div className="bg-[#f0f3ff] rounded-[10px] p-[10px] flex flex-col gap-[2px]">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#5d3f3e]">Size</span>
                    <span className="text-[#151c27] font-bold">{sizeLabel}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#5d3f3e]">Dimensions</span>
                    <span className="text-[#151c27]">
                      {artwork.trim_width_mm} × {artwork.trim_height_mm} mm
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#5d3f3e]">Orientation</span>
                    <span className="text-[#151c27] capitalize">{artwork.orientation}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#5d3f3e]">Bleed</span>
                    <span className="text-[#151c27]">
                      {artwork.bleed_mm == null ? "Unknown" : artwork.bleed_mm > 0 ? `${artwork.bleed_mm}mm` : "None"}
                      {artwork.trim_source ? ` (${TRIM_SOURCE_LABELS[artwork.trim_source] ?? artwork.trim_source})` : ""}
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
