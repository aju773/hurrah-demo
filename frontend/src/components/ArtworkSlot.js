"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { headlineText, slotErrorMessage } from "@/lib/findings";
import { preflightHeadline } from "@/lib/preflight";

// Progress is announced to screen readers a quarter at a time, not on every tick.
const ANNOUNCE_STEP = 25;

const TRIM_SOURCES = ["trimbox", "crop", "media", "media_minus_bleed"];

/**
 * One Front/Back upload slot: drop zone, a progress bar while the file is sent,
 * a separate "Checking your file…" stage, a detected summary (size/orientation/
 * bleed) or an error message with Retry, and Cancel / remove controls. Purely
 * presentational — ArtworkSlots owns the upload. `progress` is bytes sent as
 * 0–1; `canRetry` says the file is still in memory and the error is worth
 * retrying. A polite status region announces each stage and the result; an
 * error is an alert. `cancelled` marks an empty slot the customer just cancelled.
 * `error` is the upload's {code, message}; the code picks the translated text.
 * File names, sizes in mm and the size code stay left-to-right in Arabic.
 */
export default function ArtworkSlot({
  id,
  label,
  status,
  fileName,
  artwork,
  error,
  progress = 0,
  cancelled = false,
  canRetry = false,
  disabled,
  onFile,
  onRemove,
  onCancel,
  onRetry,
}) {
  const t = useTranslations("ArtworkSlot");
  const tErrors = useTranslations("ArtworkErrors");
  const tPreflight = useTranslations("Preflight");
  const inputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  const isEmpty = status === "empty";
  const isUploading = status === "uploading";
  const isChecking = status === "checking";
  const percent = Math.round(Math.min(Math.max(progress, 0), 1) * 100);
  const isDone = status === "ok" || status === "error";
  const hasSlotError = status === "error" || (artwork && !artwork.is_valid);
  const headline = status === "ok" ? preflightHeadline(artwork) : null;
  const sizeLabel = artwork?.matched_size_code
    ? artwork.matched_size_code.toUpperCase()
    : artwork
    ? t("custom", { width: artwork.trim_width_mm, height: artwork.trim_height_mm })
    : null;
  const errorText = slotErrorMessage(tErrors, error ?? (artwork?.error_code ? { code: artwork.error_code, message: artwork.error_message } : null));

  let liveMessage = "";
  if (isUploading) {
    liveMessage = t("uploadingAnnounce", { fileName, percent: Math.floor(percent / ANNOUNCE_STEP) * ANNOUNCE_STEP });
  } else if (isChecking) {
    liveMessage = t("checking");
  } else if (status === "ok" && !hasSlotError) {
    liveMessage = headline ? headlineText(tPreflight, headline) : t("detected");
  } else if (isEmpty && cancelled) {
    liveMessage = t("cancelled");
  }

  return (
    <div
      id={id}
      tabIndex={id ? -1 : undefined}
      role="group"
      aria-label={label}
      className="bg-white flex flex-col overflow-clip rounded-[16px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] w-full"
    >
      <div className="bg-[#2a313d] flex items-center justify-between px-[16px] py-[12px] w-full">
        <span className="text-[#ebf1ff] text-[16px] font-semibold tracking-[-0.16px]">{label}</span>
        {isDone && !hasSlotError && (
          <span className="bg-[#1a7f37] text-white text-[10px] font-semibold tracking-[0.4px] uppercase px-[8px] py-[2px] rounded-[4px]">
            {t("detected")}
          </span>
        )}
        {hasSlotError && (
          <span className="bg-[#bb0027] text-white text-[10px] font-semibold tracking-[0.4px] uppercase px-[8px] py-[2px] rounded-[4px]">
            {t("error")}
          </span>
        )}
      </div>

      <div className="p-[16px] w-full">
        <p role="status" aria-live="polite" className="sr-only">
          {liveMessage}
        </p>

        {isEmpty && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-[12px] px-[16px] py-[32px] w-full transition-colors ${
              disabled ? "bg-[#f0f3ff] opacity-50" : "bg-[rgba(240,243,255,0.6)]"
            }`}
          >
            <p className="text-[#151c27] text-[14px] font-semibold text-center mb-[4px]">
              {t("dragDrop")}
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="text-[#575c64] text-[12px] text-center mb-[8px]"
            >
              {t.rich("browsePrompt", {
                link: (chunks) => <span className="text-[#bb0027] font-bold underline">{chunks}</span>,
              })}
            </button>
            <span className="bg-white text-[#575c64] text-[11px] font-bold tracking-[0.22px] px-[12px] py-[6px] rounded-full">
              {t("pdfOnly")}
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

        {isUploading && (
          <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] px-[16px] py-[32px] w-full bg-[rgba(240,243,255,0.6)]">
            <p className="text-[#575c64] text-[13px] flex items-center gap-[6px] max-w-full">
              <bdi dir="ltr" className="truncate">{t("uploading", { fileName })}</bdi>
              <bdi dir="ltr" className="font-semibold shrink-0">{t("uploadingPercent", { percent })}</bdi>
            </p>
            <div
              role="progressbar"
              aria-label={t("uploading", { fileName })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-[8px] w-full max-w-[240px] rounded-full bg-[#e2e8f8] overflow-hidden"
            >
              <div className="h-full bg-[#bb0027] transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
            </div>
            <button type="button" onClick={onCancel} className="text-[#575c64] text-[12px] font-semibold underline">
              {t("cancel")}
            </button>
          </div>
        )}

        {isChecking && (
          <div className="flex flex-col items-center justify-center rounded-[12px] px-[16px] py-[32px] w-full bg-[rgba(240,243,255,0.6)]">
            <div className="size-[24px] border-2 border-[#e2e8f8] border-t-[#bb0027] rounded-full animate-spin motion-reduce:animate-none mb-[8px]" />
            <p className="text-[#575c64] text-[13px] mb-[8px]">{t("checking")}</p>
            <button type="button" onClick={onCancel} className="text-[#575c64] text-[12px] font-semibold underline">
              {t("cancel")}
            </button>
          </div>
        )}

        {isDone && (
          <div className="flex flex-col gap-[8px]">
            <div className="flex items-center justify-between bg-[#f0f3ff] px-[10px] py-[8px] rounded-[10px] w-full">
              <bdi dir="ltr" className="text-[#151c27] text-[12px] truncate" style={{ maxWidth: "260px" }}>
                {fileName}
              </bdi>
              <div className="flex items-center gap-[12px] shrink-0">
                {status === "error" && canRetry && (
                  <button type="button" onClick={onRetry} className="text-[#bb0027] text-[11px] font-bold underline">
                    {t("retry")}
                  </button>
                )}
                <button type="button" onClick={onRemove} className="text-[#575c64] text-[11px] font-semibold underline">
                  {hasSlotError ? t("uploadAnother") : t("remove")}
                </button>
              </div>
            </div>

            {headline && (
              <p className="text-[13px] font-semibold flex items-center gap-[6px]" style={{ color: headline.severity === "warning" ? "#6f5400" : "#151c27" }}>
                <span>{headline.icon}</span>
                <span>{headlineText(tPreflight, headline)}</span>
              </p>
            )}

            {hasSlotError ? (
              <p role="alert" className="text-[#bb0027] text-[12px]">{errorText}</p>
            ) : (
              artwork && (
                <div className="bg-[#f0f3ff] rounded-[10px] p-[10px] flex flex-col gap-[2px]">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#5d3f3e]">{t("size")}</span>
                    {artwork.matched_size_code ? (
                      <bdi dir="ltr" className="text-[#151c27] font-bold">{sizeLabel}</bdi>
                    ) : (
                      <span className="text-[#151c27] font-bold">{sizeLabel}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#5d3f3e]">{t("dimensions")}</span>
                    <bdi dir="ltr" className="text-[#151c27]">
                      {artwork.trim_width_mm} × {artwork.trim_height_mm} mm
                    </bdi>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#5d3f3e]">{t("orientation")}</span>
                    <span className="text-[#151c27]">{artwork.orientation ? t(artwork.orientation) : ""}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#5d3f3e]">{t("bleed")}</span>
                    <span className="text-[#151c27]">
                      {artwork.bleed_mm == null ? (
                        t("bleedUnknown")
                      ) : artwork.bleed_mm > 0 ? (
                        <bdi dir="ltr">{t("mm", { value: artwork.bleed_mm })}</bdi>
                      ) : (
                        t("bleedNone")
                      )}
                      {artwork.trim_source
                        ? ` (${TRIM_SOURCES.includes(artwork.trim_source) ? t(artwork.trim_source) : artwork.trim_source})`
                        : ""}
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
