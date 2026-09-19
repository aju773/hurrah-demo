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

const HEADLINE_CLASS = {
  ok: "bg-[#e5f4ec] text-[#1f7a4d]",
  warning: "bg-[#fff4d6] text-[#a86b00]",
  error: "bg-[#fde8eb] text-[#d7263d]",
};

/**
 * Step 2, "Check & preview" (ticket 07): one Findings list for both sides
 * next to Front/Back previews with pins, an As printed / With guides toggle
 * and legend. Next is disabled while any Error remains. A side whose file was
 * picked from a stored PDF offers "Choose pages" (`canChoosePages.front/back`,
 * answered by `onChoosePages(side)`), so pages can be re-chosen without uploading again.
 */
export default function CheckAndPreviewStep({ frontId, backId, sameAsFront, sizeCode, sizeChoice, onBack, onNext, canChoosePages = {}, onChoosePages }) {
  const t = useTranslations("CheckAndPreviewStep");
  const tPreflight = useTranslations("Preflight");
  const tFindings = useTranslations("Findings");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(false);
  const [withGuides, setWithGuides] = useState(true);
  const [enlarged, setEnlarged] = useState(null); // { slot, selectedKey } | null

  function openEnlarged(slot, selectedKey = null) {
    setEnlarged({ slot, selectedKey });
  }

  useEffect(() => {
    let cancelled = false;
    fetchPreview({ frontId, backId, sameAsFront, sizeCode, sizeChoice }).then((data) => {
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
  }, [frontId, backId, sameAsFront, sizeCode, sizeChoice?.mode, sizeChoice?.choice, sizeChoice?.applies_to?.join(",")]);

  if (error) {
    return <div className="p-[24px] text-[#bb0027] text-[14px]">{t("loadError")}</div>;
  }
  if (!preview) {
    return <div className="p-[24px] text-[#575c64] text-[14px]">{t("loading")}</div>;
  }

  const groups = combineFindings({
    front: { findings: preview.front?.findings ?? [] },
    back: preview.back?.same_as_front ? null : { findings: preview.back?.findings ?? [] },
    sameAsFront: Boolean(preview.back?.same_as_front),
  });
  const overallHeadline = orderHeadline(groups);
  const passed = passedChecks(groups, { resized: sizeChoice?.choice === "keep_size_scale" });
  const nextEnabled = canGoNext(groups);

  return (
    <div className="flex flex-col gap-[16px] w-full">
      <div className={`rounded-[8px] px-[16px] py-[10px] text-[16px] font-semibold ${HEADLINE_CLASS[overallHeadline.severity]}`}>
        {headlineText(tPreflight, overallHeadline)}
      </div>

      <div className="grid grid-cols-12 gap-[20px] w-full items-start">
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-[8px]">
          <FirstVisitHint step="findings" />
          {groups.length === 0 ? (
            <p className="text-[#575c64] text-[13px]">{t("noFindings")}</p>
          ) : (
            groups.map((group) => (
              <FindingRow
                key={group.key}
                group={group}
                slotLabel={t(group.slot === "front" ? "front" : "back")}
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

        <div className="col-span-12 lg:col-span-7 flex flex-col gap-[10px]">
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
              />
            ) : null}
          </div>

          <Legend t={t} missingBleedLabel={t("legendMissingBleed")} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-[12px]">
        <button type="button" onClick={onBack} className="h-[44px] px-[24px] rounded-[8px] text-[14px] font-semibold bg-white text-[#151c27] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
          {t("backButton")}
        </button>
        {!nextEnabled && (
          <button type="button" className="h-[44px] px-[24px] rounded-[8px] text-[14px] font-semibold bg-[#e2e8f8] text-[#575c64]">
            {t("uploadAnotherFile")}
          </button>
        )}
        <button
          type="button"
          disabled={!nextEnabled}
          title={!nextEnabled ? t("nextDisabledError") : ""}
          onClick={onNext}
          className="h-[44px] px-[24px] rounded-[8px] text-[14px] font-semibold bg-[#e51937] text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("next")}
        </button>
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

function FindingRow({ group, slotLabel, message, countText, locatable, onOpen }) {
  const icon = { error: "⛔", warning: "⚠️", note: "ℹ️" }[group.severity];
  const badgeClass = { error: "bg-[#d7263d]", warning: "bg-[#c98200]", note: "bg-[#2563eb]" }[group.severity];
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
          {icon} {slotLabel}
        </span>
        <span className="text-[#575c64] text-[12px]">
          {message}
          {countText ? <bdi dir="ltr">{countText}</bdi> : null}
        </span>
      </div>
    </Wrapper>
  );
}

function PreviewCell({ slot, label, headline, ariaLabel, image, orderedTrimMm, productBleedMm, productSafeMm, groups, withGuides, onOpen, onSelectFinding, choosePagesLabel, onChoosePages }) {
  return (
    <div className="bg-[#f0f3ff] rounded-[12px] p-[10px] flex flex-col gap-[6px]">
      <PreviewLoupe onClick={onOpen}>
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
      {choosePagesLabel && (
        <button type="button" onClick={onChoosePages} className="self-center text-[#bb0027] text-[11px] font-bold underline">
          {choosePagesLabel}
        </button>
      )}
    </div>
  );
}

