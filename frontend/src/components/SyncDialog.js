"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import ArtworkPreview from "./ArtworkPreview";
import { FILL, FIT, computeSizeChoice, scaleNoteMessage } from "@/lib/sizeChoice";

/**
 * The blocking dialog for one option–file difference (ticket 05, stories
 * 39-45; the middle "Keep {Size} and resize my file" choice is ticket 09).
 * Shown for whichever dialog is first in the draft's openDialogs — only one
 * is ever open at a time in this flow, since resolving it either fixes the
 * mismatch or removes the file.
 */
export default function SyncDialog({
  dialog,
  preview,
  onPreviewSwitch,
  onResolve,
  sizeValues = [],
  productBleedMm,
  productSafeMm,
  fileTrimMm,
  fileBleedMm,
  fileImageUrl,
  commerceEnabled = false,
}) {
  const t = useTranslations("SyncDialog");
  // "front-only" and "back-on-single" always offer a switch; fetch its
  // preview as soon as the dialog appears instead of waiting for a click.
  // With the Commerce switch off there is no total to ask for, but the preview also
  // carries any Turnaround fallback notice, so a size mismatch fetches it up front too.
  const autoPreviewKind =
    dialog?.kind === "front-only" || dialog?.kind === "back-on-single" || (!commerceEnabled && dialog?.kind === "size-mismatch");
  useEffect(() => {
    if (dialog && autoPreviewKind && !preview) onPreviewSwitch(dialog.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog?.key, autoPreviewKind, preview]);

  // Local to one dialog: the parent remounts this component on `dialog.key`
  // (see FlyersConfigurator), so these reset to their defaults whenever a
  // different dialog opens, with no effect needed.
  const [resizeOpen, setResizeOpen] = useState(false);
  const [resizeMode, setResizeMode] = useState(FIT); // Fit is the default sub-choice

  if (!dialog) return null;

  const sizeLabel = (code) => code.toUpperCase();
  const canOfferResize = dialog.kind === "size-mismatch" || dialog.kind === "unknown-size";
  const orderedValue = canOfferResize ? sizeValues.find((v) => v.code === dialog.ordered) : null;
  const orderedTrimMm = orderedValue ? [orderedValue.width_mm, orderedValue.height_mm] : null;
  const canComputeResize = canOfferResize && orderedTrimMm && fileTrimMm;
  const fitResult = canComputeResize ? computeSizeChoice(FIT, orderedTrimMm, fileTrimMm, fileBleedMm ?? 0, productBleedMm ?? 0) : null;
  const fillResult = canComputeResize ? computeSizeChoice(FILL, orderedTrimMm, fileTrimMm, fileBleedMm ?? 0, productBleedMm ?? 0) : null;
  const activeResult = resizeMode === FIT ? fitResult : fillResult;

  let title;
  let body = null;
  const actions = [];

  if (dialog.kind === "size-mismatch") {
    title = t("sizeMismatchTitle", { file: sizeLabel(dialog.file), ordered: sizeLabel(dialog.ordered) });
    body = <SwitchPreview t={t} preview={preview} commerceEnabled={commerceEnabled} onPreview={() => onPreviewSwitch(dialog.key)} />;
    actions.push(
      <button
        key="switch"
        type="button"
        disabled={preview?.status !== "ready"}
        onClick={() => onResolve(dialog.key, "switch")}
        className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold bg-[#e51937] text-white disabled:opacity-50"
      >
        {preview?.status === "ready" ? t("confirmSwitch", { file: sizeLabel(dialog.file) }) : t("changeOrder", { file: sizeLabel(dialog.file) })}
      </button>,
      <button key="replace" type="button" onClick={() => onResolve(dialog.key, "replace")} className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold border border-[#e2e8f8]">
        {t("uploadDifferent")}
      </button>
    );
  } else if (dialog.kind === "unknown-size") {
    title = t("unknownSizeTitle", { width: dialog.mm?.width, height: dialog.mm?.height });
    actions.push(
      <button key="replace" type="button" onClick={() => onResolve(dialog.key, "replace")} className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold border border-[#e2e8f8]">
        {t("uploadDifferent")}
      </button>
    );
  } else if (dialog.kind === "front-only") {
    title = t("frontOnlyTitle");
    body = <PreviewNotices preview={preview} />;
    actions.push(
      <button
        key="switch"
        type="button"
        disabled={preview?.status !== "ready"}
        onClick={() => onResolve(dialog.key, "switch")}
        className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold bg-[#e51937] text-white disabled:opacity-50"
      >
        {t("switchToSingle")}
      </button>,
      <button key="same" type="button" onClick={() => onResolve(dialog.key, "same")} className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold border border-[#e2e8f8]">
        {t("useSame")}
      </button>,
      <button key="hint" type="button" onClick={() => onResolve(dialog.key, "upload-back")} className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold border border-[#e2e8f8]">
        {t("uploadBack")}
      </button>
    );
  } else if (dialog.kind === "back-on-single") {
    title = t("backOnSingleTitle");
    body = <PreviewNotices preview={preview} />;
    actions.push(
      <button
        key="switch"
        type="button"
        disabled={preview?.status !== "ready"}
        onClick={() => onResolve(dialog.key, "switch")}
        className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold bg-[#e51937] text-white disabled:opacity-50"
      >
        {t("switchToDouble")}
      </button>,
      <button key="keep" type="button" onClick={() => onResolve(dialog.key, "keep")} className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold border border-[#e2e8f8]">
        {t("printFrontOnly")}
      </button>
    );
  }

  if (canOfferResize) {
    // "Keep {ordered Size} and resize my file" — the middle choice (spec:
    // .scratch/flyer-demo/issues/06-size-mismatch-handling.md). For a
    // no-match file this is the only way forward besides uploading another.
    actions.push(
      <button
        key="resize"
        type="button"
        onClick={() => setResizeOpen((open) => !open)}
        aria-expanded={resizeOpen}
        className={`h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold border ${
          resizeOpen ? "border-[#e51937] text-[#e51937]" : "border-[#e2e8f8] text-[#151c27]"
        }`}
      >
        {t("keepAndResize", { size: orderedValue ? sizeLabel(orderedValue.code) : dialog.ordered })}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-[16px]">
      <div className={`bg-white rounded-[16px] shadow-lg w-full p-[20px] flex flex-col gap-[12px] ${resizeOpen ? "max-w-[680px]" : "max-w-[420px]"}`}>
        <span className="text-[#151c27] text-[16px] font-bold">{title}</span>
        {body}
        {resizeOpen && canComputeResize && (
          <ResizeChoice
            t={t}
            resizeMode={resizeMode}
            onModeChange={setResizeMode}
            fitResult={fitResult}
            fillResult={fillResult}
            orderedTrimMm={orderedTrimMm}
            productBleedMm={productBleedMm}
            productSafeMm={productSafeMm}
            fileTrimMm={fileTrimMm}
            fileBleedMm={fileBleedMm}
            fileImageUrl={fileImageUrl}
            onConfirm={() =>
              onResolve(dialog.key, resizeMode, { result: activeResult, fileTrimMm })
            }
          />
        )}
        <div className="flex flex-wrap gap-[8px] pt-[4px]">{actions}</div>
      </div>
    </div>
  );
}

function ResizeChoice({
  t,
  resizeMode,
  onModeChange,
  fitResult,
  fillResult,
  orderedTrimMm,
  productBleedMm,
  productSafeMm,
  fileTrimMm,
  fileBleedMm,
  fileImageUrl,
  onConfirm,
}) {
  const active = resizeMode === FIT ? fitResult : fillResult;
  return (
    <div className="bg-[#f0f3ff] rounded-[10px] p-[12px] flex flex-col gap-[10px]">
      <div className="grid grid-cols-2 gap-[10px]">
        <ResizeOption
          label={t("fitInside")}
          sub={t("fitInsideSub")}
          selected={resizeMode === FIT}
          onSelect={() => onModeChange(FIT)}
          image={{ image_url: fileImageUrl, file_trim_mm: fileTrimMm, file_bleed_mm: fileBleedMm, transform: { mode: FIT, scale: fitResult.scale } }}
          orderedTrimMm={orderedTrimMm}
          productBleedMm={productBleedMm}
          productSafeMm={productSafeMm}
        />
        <ResizeOption
          label={t("fillPage")}
          sub={t("fillPageSub")}
          selected={resizeMode === FILL}
          onSelect={() => onModeChange(FILL)}
          image={{ image_url: fileImageUrl, file_trim_mm: fileTrimMm, file_bleed_mm: fileBleedMm, transform: { mode: FILL, scale: fillResult.scale } }}
          orderedTrimMm={orderedTrimMm}
          productBleedMm={productBleedMm}
          productSafeMm={productSafeMm}
        />
      </div>
      <span className="text-[#151c27] text-[13px]">{translatedScaleNote(t, active)}</span>
      <button
        type="button"
        onClick={onConfirm}
        className="self-start h-[36px] px-[14px] rounded-[8px] text-[13px] font-semibold bg-[#e51937] text-white"
      >
        {resizeMode === FIT ? t("confirmFit") : t("confirmFill")}
      </button>
    </div>
  );
}

function ResizeOption({ label, sub, selected, onSelect, image, orderedTrimMm, productBleedMm, productSafeMm }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col gap-[6px] p-[8px] rounded-[8px] bg-white border-2 text-start ${selected ? "border-[#e51937]" : "border-transparent"}`}
    >
      <ArtworkPreview slot="front" image={image} orderedTrimMm={orderedTrimMm} productBleedMm={productBleedMm} productSafeMm={productSafeMm} groups={[]} withGuides />
      <span className="text-[#151c27] text-[12px] font-semibold">{label}</span>
      <span className="text-[#575c64] text-[11px]">{sub}</span>
    </button>
  );
}

// The Fit/Fill note under the previews, translated (lib/sizeChoice.scaleNoteMessage).
function translatedScaleNote(t, result) {
  const { key, values } = scaleNoteMessage(result);
  return t(key, { ...values, edges: values.edges ? t(values.edges) : "" });
}

// What the switch would change besides the option itself (e.g. a Turnaround falling
// back), shown before the customer confirms. Never carries money.
function PreviewNotices({ preview }) {
  if (!preview?.notices?.length) return null;
  return (
    <div className="bg-[#f0f3ff] rounded-[10px] p-[10px] flex flex-col gap-[4px] text-[13px]">
      {preview.notices.map((n, i) => (
        <span key={i} className="text-[#6f5400]">{n.reason}</span>
      ))}
    </div>
  );
}

function SwitchPreview({ t, preview, onPreview, commerceEnabled }) {
  if (!commerceEnabled) return <PreviewNotices preview={preview} />;
  if (!preview) {
    return (
      <button type="button" onClick={onPreview} className="self-start text-[#bb0027] text-[12px] font-bold underline">
        {t("seeNewTotal")}
      </button>
    );
  }
  if (preview.status === "pending") {
    return <span className="text-[#575c64] text-[13px]">{t("gettingTotal")}</span>;
  }
  return (
    <div className="bg-[#f0f3ff] rounded-[10px] p-[10px] flex flex-col gap-[4px] text-[13px]">
      {preview.quote && (
        <span className="text-[#151c27] font-semibold">
          {t("newTotal", { amount: preview.quote.total_aed })}
        </span>
      )}
      {preview.notices?.map((n, i) => (
        <span key={i} className="text-[#6f5400]">{n.reason}</span>
      ))}
    </div>
  );
}
