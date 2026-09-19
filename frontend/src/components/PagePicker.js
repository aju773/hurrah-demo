"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { chooseBack, chooseFront, enlargedThumbnailUrl, evaluateChoice, pageSizeLabel } from "@/lib/pagePicker";

/**
 * The Page picker: a thumbnail of every page of a multi-page PDF, so the customer
 * can say which page is Front and which is Back (or no Back). Only those pages
 * become Artwork. It mirrors the server's rules so a mistake is explained before
 * anything is sent: Front and Back must be the same Size, and a page that isn't
 * the ordered Size is warned about (the size-mismatch dialog handles it after).
 *
 * `mode` is "both" (Front and Back), or "front" / "back" to choose just that side
 * while the other stays as `fixed` (a page-like with a Size, or null). `initialChoice`
 * ({front, back, same}) is what is already chosen when the picker is reopened.
 * "Use the same artwork for the back" is the one way a page can be on both sides.
 *
 * `onConfirm({front, back, same})` gets 1-based page numbers (either may be null).
 * `busy` shows the pages are being checked; `error` is a {code, message} from a
 * refused choice. Thumbnails are lazy <img>s: the server renders each on first
 * request; any of them can be enlarged.
 */
export default function PagePicker({ source, orderedSize, mode = "both", fixed = null, initialChoice = null, busy = false, error = null, onConfirm, onCancel }) {
  const t = useTranslations("PagePicker");
  const tErrors = useTranslations("ArtworkErrors");
  const [choice, setChoice] = useState({ front: initialChoice?.front ?? null, back: initialChoice?.back ?? null, same: Boolean(initialChoice?.same) });
  const [enlarged, setEnlarged] = useState(null); // page number | null
  const dialogRef = useRef(null);
  const openerRef = useRef(null); // the thumbnail that opened the enlarged view, to give focus back to
  const showFront = mode !== "back";
  const showBack = mode !== "front" && !choice.same;

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const result = evaluateChoice({ pages: source.pages, front: choice.front, back: choice.back, same: choice.same, orderedSize, mode, fixed });

  const sizeText = (page) => {
    const label = pageSizeLabel(page);
    return label.code ?? t("customSize", { width: label.mm.width, height: label.mm.height });
  };
  const orientationText = (page) => t(page.orientation);

  const errorText = error ? (error.code && tErrors.has(error.code) ? tErrors(error.code) : error.message) : null;

  function onKeyDown(e) {
    if (e.key === "Escape" && !busy && enlarged == null) onCancel();
  }

  const summary =
    mode === "both"
      ? t("summary", { front: choice.front ?? t("none"), back: choice.same ? t("sameAsFront") : choice.back ?? t("noBack") })
      : t("summaryOne", { side: t(mode), page: (mode === "front" ? choice.front : choice.back) ?? t("none") });

  const problems = [];
  if (result.backSizeDiffers) {
    problems.push({ key: "differs", tone: "error", text: t("backSizeDiffers", { front: sizeText(result.frontPage), back: sizeText(result.backPage) }) });
  }
  if (result.frontDiffersFromOrder) {
    problems.push({ key: "front-order", tone: "warning", text: t("differsFromOrder", { side: t("front"), page: result.frontPage.number, size: sizeText(result.frontPage), ordered: orderedSize.toUpperCase() }) });
  }
  if (result.backDiffersFromOrder) {
    problems.push({ key: "back-order", tone: "warning", text: t("differsFromOrder", { side: t("back"), page: result.backPage.number, size: sizeText(result.backPage), ordered: orderedSize.toUpperCase() }) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/40 sm:p-[16px]" onKeyDown={onKeyDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="page-picker-title"
        tabIndex={-1}
        className="bg-white sm:rounded-[16px] shadow-lg w-full max-w-[860px] p-[16px] sm:p-[20px] flex flex-col gap-[12px] max-h-full outline-none"
      >
        <div className="flex flex-col gap-[2px]">
          <h2 id="page-picker-title" className="text-[#151c27] text-[16px] font-bold">{t("title")}</h2>
          <p className="text-[#5d3f3e] text-[13px]">
            <bdi>{source.original_filename}</bdi> · {t("pageCount", { count: source.page_count })}
          </p>
          <p className="text-[#5d3f3e] text-[13px]">{t(mode === "both" ? "instructions" : mode === "front" ? "instructionsFront" : "instructionsBack")}</p>
        </div>

        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-[12px] overflow-y-auto min-h-0 list-none p-0 m-0" aria-label={t("pagesLabel")}>
          {source.pages.map((page) => {
            const isFront = showFront && choice.front === page.number;
            const isBack = (showBack || choice.same) && (choice.same ? choice.front === page.number : choice.back === page.number);
            return (
              <li
                key={page.number}
                data-page={page.number}
                className={`rounded-[10px] border p-[8px] flex flex-col gap-[6px] ${isFront || isBack ? "border-[#e51937] bg-[#fff5f6]" : "border-[#e2e8f8]"}`}
              >
                <button
                  type="button"
                  aria-label={t("enlarge", { page: page.number })}
                  onClick={(e) => {
                    openerRef.current = e.currentTarget;
                    setEnlarged(page.number);
                  }}
                  className="bg-[#f0f3ff] rounded-[6px] flex items-center justify-center aspect-[3/4] overflow-hidden cursor-zoom-in w-full"
                  dir="ltr"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={page.thumbnail_url} alt={t("thumbnailAlt", { page: page.number })} loading="lazy" className="max-w-full max-h-full object-contain" />
                </button>
                <div className="text-[12px] text-[#151c27]">
                  <span className="font-bold">{t("page", { page: page.number })}</span>
                  <span className="text-[#5d3f3e]"> · {orientationText(page)} · <bdi>{sizeText(page)}</bdi></span>
                </div>
                <div className="flex gap-[6px]">
                  {showFront && (
                    <button
                      type="button"
                      aria-pressed={isFront}
                      aria-label={t("useAsFront", { page: page.number })}
                      disabled={busy}
                      onClick={() => setChoice((c) => ({ ...c, ...chooseFront(c, page.number) }))}
                      className={`flex-1 h-[36px] rounded-[8px] text-[12px] font-semibold border ${isFront ? "bg-[#e51937] text-white border-[#e51937]" : "border-[#e2e8f8] text-[#151c27]"}`}
                    >
                      {t("front")}
                    </button>
                  )}
                  {showBack && (
                    <button
                      type="button"
                      aria-pressed={isBack}
                      aria-label={t("useAsBack", { page: page.number })}
                      disabled={busy}
                      onClick={() => setChoice((c) => ({ ...c, ...(mode === "back" ? { back: c.back === page.number ? null : page.number } : chooseBack(c, page.number)) }))}
                      className={`flex-1 h-[36px] rounded-[8px] text-[12px] font-semibold border ${isBack ? "bg-[#e51937] text-white border-[#e51937]" : "border-[#e2e8f8] text-[#151c27]"}`}
                    >
                      {t("back")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-[6px]" aria-live="polite">
          {mode === "both" && (
            <label className="flex items-center gap-[8px] text-[13px] text-[#151c27]">
              <input
                type="checkbox"
                checked={choice.same}
                disabled={busy}
                onChange={(e) => setChoice((c) => ({ ...c, same: e.target.checked, back: e.target.checked ? null : c.back }))}
                className="size-[16px]"
              />
              {t("sameArtwork")}
            </label>
          )}
          <p className="text-[13px] text-[#151c27]" data-testid="picker-summary">
            {summary}
          </p>
          {problems.map((problem) => (
            <p
              key={problem.key}
              role={problem.tone === "error" ? "alert" : "status"}
              className={`text-[12px] rounded-[8px] px-[10px] py-[6px] ${problem.tone === "error" ? "bg-[#ffdad6] text-[#93000a]" : "bg-[#fff8e1] text-[#6f5400]"}`}
            >
              {problem.tone === "error" ? t("errorPrefix") : t("warningPrefix")} {problem.text}
            </p>
          ))}
          {errorText && <p role="alert" className="text-[#bb0027] text-[12px]">{errorText}</p>}
        </div>

        <div className="flex flex-wrap gap-[8px] justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold border border-[#e2e8f8] disabled:opacity-50">
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={!result.canConfirm || busy}
            onClick={() => onConfirm({ front: mode === "back" ? null : choice.front, back: mode === "front" || choice.same ? null : choice.back, same: choice.same })}
            className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold bg-[#e51937] text-white disabled:opacity-50"
          >
            {busy ? t("checking") : t("confirm")}
          </button>
        </div>
      </div>
      {enlarged != null && (
        <EnlargedPage
          page={source.pages.find((p) => p.number === enlarged)}
          label={t("enlargedTitle", { page: enlarged })}
          closeLabel={t("closeEnlarged")}
          onClose={() => {
            setEnlarged(null);
            openerRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/** One page at a bigger size over the picker. Escape or the button closes just
 * this view (never the picker under it); the picker gives focus back to the thumbnail. */
function EnlargedPage({ page, label, closeLabel, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  if (!page) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-[16px]"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={label} className="relative max-h-full max-w-full flex flex-col gap-[8px] items-center" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" onClick={onClose} className="self-end h-[36px] px-[14px] rounded-[8px] bg-white text-[#151c27] text-[13px] font-semibold">
          {closeLabel}
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enlargedThumbnailUrl(page.thumbnail_url)} alt={label} className="max-h-[80vh] max-w-full object-contain bg-white rounded-[6px]" />
      </div>
    </div>
  );
}
