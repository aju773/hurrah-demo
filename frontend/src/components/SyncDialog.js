"use client";

import { useEffect, useState } from "react";
import ArtworkPreview from "./ArtworkPreview";
import { FILL, FIT, computeSizeChoice, scaleNote } from "@/lib/sizeChoice";

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
}) {
  // "front-only" and "back-on-single" always offer a switch; fetch its
  // preview as soon as the dialog appears instead of waiting for a click.
  const autoPreviewKind = dialog?.kind === "front-only" || dialog?.kind === "back-on-single";
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
    title = `Your file is ${sizeLabel(dialog.file)}, your order is ${sizeLabel(dialog.ordered)}.`;
    body = <SwitchPreview preview={preview} onPreview={() => onPreviewSwitch(dialog.key)} />;
    actions.push(
      <button
        key="switch"
        type="button"
        disabled={preview?.status !== "ready"}
        onClick={() => onResolve(dialog.key, "switch")}
        className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold bg-[#e51937] text-white disabled:opacity-50"
      >
        {preview?.status === "ready" ? `Confirm — switch to ${sizeLabel(dialog.file)}` : `Change my order to ${sizeLabel(dialog.file)}`}
      </button>,
      <button key="replace" type="button" onClick={() => onResolve(dialog.key, "replace")} className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold border border-[#e2e8f8]">
        Upload a different file
      </button>
    );
  } else if (dialog.kind === "unknown-size") {
    title = `Your file's size (${dialog.mm?.width} × ${dialog.mm?.height} mm) doesn't match any flyer size.`;
    actions.push(
      <button key="replace" type="button" onClick={() => onResolve(dialog.key, "replace")} className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold border border-[#e2e8f8]">
        Upload a different file
      </button>
    );
  } else if (dialog.kind === "front-only") {
    title = "Your file has only a front, your order is double-sided.";
    actions.push(
      <button
        key="switch"
        type="button"
        disabled={preview?.status !== "ready"}
        onClick={() => onResolve(dialog.key, "switch")}
        className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold bg-[#e51937] text-white disabled:opacity-50"
      >
        Switch order to single-sided
      </button>,
      <button key="same" type="button" onClick={() => onResolve(dialog.key, "same")} className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold border border-[#e2e8f8]">
        Use the same artwork for the back
      </button>,
      <button key="hint" type="button" onClick={() => onResolve(dialog.key, "upload-back")} className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold border border-[#e2e8f8]">
        I&apos;ll upload a back
      </button>
    );
  } else if (dialog.kind === "back-on-single") {
    title = "Your file has a back side, your order is single-sided.";
    actions.push(
      <button
        key="switch"
        type="button"
        disabled={preview?.status !== "ready"}
        onClick={() => onResolve(dialog.key, "switch")}
        className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold bg-[#e51937] text-white disabled:opacity-50"
      >
        Switch order to double-sided
      </button>,
      <button key="keep" type="button" onClick={() => onResolve(dialog.key, "keep")} className="h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold border border-[#e2e8f8]">
        Print the front only
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
        Keep {orderedValue ? sizeLabel(orderedValue.code) : dialog.ordered} and resize my file
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
          label="Fit inside"
          sub="Nothing cut off"
          selected={resizeMode === FIT}
          onSelect={() => onModeChange(FIT)}
          image={{ image_url: fileImageUrl, file_trim_mm: fileTrimMm, file_bleed_mm: fileBleedMm, transform: { mode: FIT, scale: fitResult.scale } }}
          orderedTrimMm={orderedTrimMm}
          productBleedMm={productBleedMm}
          productSafeMm={productSafeMm}
        />
        <ResizeOption
          label="Fill the page"
          sub="Edges cut off"
          selected={resizeMode === FILL}
          onSelect={() => onModeChange(FILL)}
          image={{ image_url: fileImageUrl, file_trim_mm: fileTrimMm, file_bleed_mm: fileBleedMm, transform: { mode: FILL, scale: fillResult.scale } }}
          orderedTrimMm={orderedTrimMm}
          productBleedMm={productBleedMm}
          productSafeMm={productSafeMm}
        />
      </div>
      <span className="text-[#151c27] text-[13px]">{scaleNote(active)}</span>
      <button
        type="button"
        onClick={onConfirm}
        className="self-start h-[36px] px-[14px] rounded-[8px] text-[13px] font-semibold bg-[#e51937] text-white"
      >
        Confirm — {resizeMode === FIT ? "fit inside" : "fill the page"}
      </button>
    </div>
  );
}

function ResizeOption({ label, sub, selected, onSelect, image, orderedTrimMm, productBleedMm, productSafeMm }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col gap-[6px] p-[8px] rounded-[8px] bg-white border-2 text-left ${selected ? "border-[#e51937]" : "border-transparent"}`}
    >
      <ArtworkPreview slot="front" image={image} orderedTrimMm={orderedTrimMm} productBleedMm={productBleedMm} productSafeMm={productSafeMm} groups={[]} withGuides />
      <span className="text-[#151c27] text-[12px] font-semibold">{label}</span>
      <span className="text-[#575c64] text-[11px]">{sub}</span>
    </button>
  );
}

function SwitchPreview({ preview, onPreview }) {
  if (!preview) {
    return (
      <button type="button" onClick={onPreview} className="self-start text-[#bb0027] text-[12px] font-bold underline">
        See the new total
      </button>
    );
  }
  if (preview.status === "pending") {
    return <span className="text-[#575c64] text-[13px]">Getting the new total…</span>;
  }
  return (
    <div className="bg-[#f0f3ff] rounded-[10px] p-[10px] flex flex-col gap-[4px] text-[13px]">
      {preview.quote && (
        <span className="text-[#151c27] font-semibold">
          New total: AED {preview.quote.total_aed}
        </span>
      )}
      {preview.notices?.map((n, i) => (
        <span key={i} className="text-[#6f5400]">{n.reason}</span>
      ))}
    </div>
  );
}
