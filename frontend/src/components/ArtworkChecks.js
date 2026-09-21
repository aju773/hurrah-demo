"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { EDGE_CODES, canGoNext, combineFindings, findingMessage, headlineText, orderHeadline, passedChecks, slotHeadline } from "@/lib/findings";
import { fetchPreview } from "@/lib/preview";
import ArtworkPreview from "./ArtworkPreview";
import PreviewLoupe from "./PreviewLoupe";
import EnlargedPreview from "./EnlargedPreview";
import { Legend, ToggleButton } from "./PreviewControls";
import FirstVisitHint from "./FirstVisitHint";
import LoadFailure from "./LoadFailure";

// A group is "located" (ticket 08) when it has a place to jump to on the
// preview — a bbox, or an edge ring for a bleed code — matching exactly what
// ArtworkPreview is willing to draw a highlight for.
function isLocatable(group) {
  return group.findings.some((f) => f.bbox) || EDGE_CODES.has(group.code);
}

const CHECK_LABEL_KEYS = {
  bleed: "checkBleed",
  images: "checkImages",
  fonts: "checkFonts",
  colour: "checkColour",
  file: "checkFile",
  size: "checkSize",
};

const SEVERITY_LABEL_KEYS = { error: "severityError", warning: "severityWarning", note: "severityNote" };

const HEADLINE_CLASS = {
  ok: "bg-[#e5f4ec] text-[#1f7a4d]",
  warning: "bg-[#fff4d6] text-[#7a4f00]",
  error: "bg-[#fde8eb] text-[#b0001d]",
};

/**
 * The Findings and Proof preview on the Artwork page: one Findings list for both
 * sides above Front/Back previews with pins, an As printed / With guides toggle
 * and legend. `onBlockedChange(true)` tells the page while any Error remains, so
 * its Continue stays disabled. A side whose file was picked from a stored PDF offers
 * "Choose pages" (`canChoosePages.front/back`, answered by `onChoosePages(side)`),
 * so pages can be re-chosen without uploading again. Each side has a Rotate button
 * (`rotate`: {front, back} says which are turned, `onRotate(side)` turns or un-turns
 * one); the preview and Findings arrive already turned.
 */
export default function ArtworkChecks({ frontId, backId, sameAsFront, sizeCode, sizeChoice, rotate, onRotate, canChoosePages = {}, onChoosePages, onBlockedChange }) {
  const t = useTranslations("ArtworkChecks");
  const tPreflight = useTranslations("Preflight");
  const tFindings = useTranslations("Findings");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0); // bumped by Retry
  const [withGuides, setWithGuides] = useState(true);
  const [enlarged, setEnlarged] = useState(null); // { slot, selectedKey } | null

  function openEnlarged(slot, selectedKey = null) {
    setEnlarged({ slot, selectedKey });
  }

  function retry() {
    setError(false);
    setAttempt((n) => n + 1);
  }

  useEffect(() => {
    let cancelled = false;
    fetchPreview({ frontId, backId, sameAsFront, sizeCode, sizeChoice, rotate }).then((data) => {
      if (cancelled) return;
      if (!data) setError(true);
      else {
        setPreview(data);
        setError(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontId, backId, sameAsFront, sizeCode, sizeChoice?.mode, sizeChoice?.choice, sizeChoice?.applies_to?.join(","), rotate?.front, rotate?.back, attempt]);

  const blocked = preview ? !canGoNext(combineFindings({
    front: { findings: preview.front?.findings ?? [] },
    back: preview.back?.same_as_front ? null : { findings: preview.back?.findings ?? [] },
    sameAsFront: Boolean(preview.back?.same_as_front),
  })) : false;
  useEffect(() => {
    onBlockedChange?.(blocked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);
  // Leaving the page (or losing the Front) must not leave Continue blocked by a preview that is gone.
  useEffect(() => () => onBlockedChange?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  // One live region for the whole step, mounted before the preview arrives, so the
  // result ("Must fix before ordering", "Ready to print"…) is announced when it lands.
  if (error) {
    return <LoadFailure className="p-[24px]" message={t("loadError")} retryLabel={t("retry")} onRetry={retry} />;
  }
  if (!preview) {
    return (
      <div role="status" aria-live="polite" className="p-[24px] text-[#575c64] text-[14px]">
        {t("loading")}
      </div>
    );
  }

  const groups = combineFindings({
    front: { findings: preview.front?.findings ?? [] },
    back: preview.back?.same_as_front ? null : { findings: preview.back?.findings ?? [] },
    sameAsFront: Boolean(preview.back?.same_as_front),
  });
  const overallHeadline = orderHeadline(groups);
  const passed = passedChecks(groups, { resized: sizeChoice?.choice === "keep_size_scale" });

  return (
    <div className="flex flex-col gap-[16px] w-full">
      <div
        role="status"
        aria-live="polite"
        className={`rounded-[8px] px-[16px] py-[10px] text-[16px] font-semibold ${HEADLINE_CLASS[overallHeadline.severity]}`}
      >
        {headlineText(tPreflight, overallHeadline)}
      </div>

      <div className="flex flex-col gap-[16px] w-full">
        <div className="min-w-0 flex flex-col gap-[8px]">
          <FirstVisitHint step="findings" />
          {groups.length === 0 ? (
            <p className="text-[#575c64] text-[13px]">{t("noFindings")}</p>
          ) : (
            groups.map((group) => (
              <FindingRow
                key={group.key}
                group={group}
                slotLabel={t(group.slot === "front" ? "front" : "back")}
                severityLabel={t(SEVERITY_LABEL_KEYS[group.severity])}
                message={findingMessage(tFindings, group)}
                countText={findingCountText(tFindings, group)}
                locatable={isLocatable(group)}
                onOpen={() => openEnlarged(group.slot, group.key)}
              />
            ))
          )}
          <p className="text-[#575c64] text-[12px] mt-[4px]">
            {t("passed", { items: passed.map((c) => t(CHECK_LABEL_KEYS[c])).join(", ") })}
          </p>
        </div>

        <div className="min-w-0 flex flex-col gap-[10px]">
          <div className="flex items-center gap-[8px]">
            <ToggleButton active={!withGuides} onClick={() => setWithGuides(false)} label={t("asPrinted")} />
            <ToggleButton active={withGuides} onClick={() => setWithGuides(true)} label={t("withGuides")} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px]">
            <PreviewCell
              slot="front"
              label={t("front")}
              headline={headlineText(tPreflight, slotHeadline(groups, "front"))}
              ariaLabel={t("previewLabel", { side: t("front") })}
              enlargeLabel={t("enlargePreview", { side: t("front") })}
              image={preview.front}
              orderedTrimMm={preview.ordered_trim_mm}
              productBleedMm={preview.product_bleed_mm}
              productSafeMm={preview.product_safe_mm}
              groups={groups}
              withGuides={withGuides}
              onOpen={() => openEnlarged("front")}
              onSelectFinding={(group) => openEnlarged("front", group.key)}
              choosePagesLabel={canChoosePages.front && onChoosePages ? t("choosePages") : null}
              onChoosePages={() => onChoosePages("front")}
              rotateLabel={onRotate ? t(rotate?.front ? "undoRotateSide" : "rotateSide", { side: t("front") }) : null}
              onRotate={() => onRotate("front")}
            />
            {preview.back?.same_as_front ? (
              <button
                type="button"
                onClick={() => openEnlarged("back")}
                className="bg-[#f0f3ff] rounded-[12px] p-[10px] flex items-center justify-center text-[#575c64] text-[12px] cursor-pointer"
              >
                {t("sameAsFront")}
              </button>
            ) : preview.back ? (
              <PreviewCell
                slot="back"
                label={t("back")}
                headline={headlineText(tPreflight, slotHeadline(groups, "back"))}
                ariaLabel={t("previewLabel", { side: t("back") })}
                enlargeLabel={t("enlargePreview", { side: t("back") })}
                image={preview.back}
                orderedTrimMm={preview.ordered_trim_mm}
                productBleedMm={preview.product_bleed_mm}
                productSafeMm={preview.product_safe_mm}
                groups={groups}
                withGuides={withGuides}
                onOpen={() => openEnlarged("back")}
                onSelectFinding={(group) => openEnlarged("back", group.key)}
                choosePagesLabel={canChoosePages.back && onChoosePages ? t("choosePages") : null}
                onChoosePages={() => onChoosePages("back")}
                rotateLabel={onRotate ? t(rotate?.back ? "undoRotateSide" : "rotateSide", { side: t("back") }) : null}
                onRotate={() => onRotate("back")}
              />
            ) : null}
          </div>

          <Legend t={t} missingBleedLabel={t("legendMissingBleed")} />
        </div>
      </div>

      {enlarged && (
        <EnlargedPreview
          t={t}
          initialSlot={enlarged.slot}
          initialSelectedKey={enlarged.selectedKey}
          preview={preview}
          orderedTrimMm={preview.ordered_trim_mm}
          productBleedMm={preview.product_bleed_mm}
          productSafeMm={preview.product_safe_mm}
          groups={groups}
          onClose={() => setEnlarged(null)}
        />
      )}
    </div>
  );
}

// "(×3, lowest 180 ppi)" — the repeat count and worst measured value of a
// grouped Finding, in the viewer's language; empty for a single Finding.
function findingCountText(tFindings, group) {
  if (group.count <= 1) return "";
  const parts = [tFindings("repeatCount", { count: group.count })];
  if (group.worstValue != null) parts.push(tFindings("lowestPpi", { value: group.worstValue }));
  return ` (${parts.join(", ")})`;
}

function FindingRow({ group, slotLabel, severityLabel, message, countText, locatable, onOpen }) {
  const icon = { error: "⛔", warning: "⚠️", note: "ℹ️" }[group.severity];
  const badgeClass = { error: "bg-[#d7263d]", warning: "bg-[#946000]", note: "bg-[#2563eb]" }[group.severity];
  const Wrapper = locatable ? "button" : "div";
  return (
    <Wrapper
      type={locatable ? "button" : undefined}
      onClick={locatable ? onOpen : undefined}
      className={`w-full flex gap-[8px] p-[10px] bg-white rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] text-left ${locatable ? "cursor-pointer" : ""}`}
    >
      <span className={`shrink-0 size-[20px] rounded-full text-white text-[11px] font-bold flex items-center justify-center ${badgeClass}`}>
        {group.n}
      </span>
      <div className="flex flex-col gap-[2px]">
        <span className="text-[#151c27] text-[13px] font-semibold">
          <span aria-hidden="true">{icon}</span> {severityLabel} · {slotLabel}
        </span>
        <span className="text-[#575c64] text-[12px]">
          {message}
          {countText ? <bdi dir="ltr">{countText}</bdi> : null}
        </span>
      </div>
    </Wrapper>
  );
}

function PreviewCell({ slot, label, headline, ariaLabel, enlargeLabel, image, orderedTrimMm, productBleedMm, productSafeMm, groups, withGuides, onOpen, onSelectFinding, choosePagesLabel, onChoosePages, rotateLabel, onRotate }) {
  return (
    <div className="bg-[#f0f3ff] rounded-[12px] p-[10px] flex flex-col gap-[6px]">
      <PreviewLoupe onClick={onOpen} label={enlargeLabel}>
        <ArtworkPreview
          slot={slot}
          image={image}
          orderedTrimMm={orderedTrimMm}
          productBleedMm={productBleedMm}
          productSafeMm={productSafeMm}
          groups={groups}
          withGuides={withGuides}
          onSelectFinding={onSelectFinding}
          ariaLabel={ariaLabel}
        />
      </PreviewLoupe>
      <span className="text-[#575c64] text-[11px] text-center">
        {label} · {headline}
      </span>
      {(rotateLabel || choosePagesLabel) && (
        <div className="flex flex-wrap items-center justify-center gap-x-[12px]">
          {rotateLabel && (
            <button type="button" onClick={onRotate} className="tap inline-flex items-center justify-center text-[#bb0027] text-[11px] font-bold underline">
              {rotateLabel}
            </button>
          )}
          {choosePagesLabel && (
            <button type="button" onClick={onChoosePages} className="tap inline-flex items-center justify-center text-[#bb0027] text-[11px] font-bold underline">
              {choosePagesLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

