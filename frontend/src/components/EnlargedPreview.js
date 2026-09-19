"use client";

import { useEffect, useRef, useState } from "react";
import ArtworkPreview, { findingCenterMm, previewGeometry } from "./ArtworkPreview";
import { Legend, ToggleButton } from "./PreviewControls";

const MM_TO_PX = 96 / 25.4; // CSS px per mm at "actual size" (96dpi)
const ZOOM_MULT = { "200": 2, "400": 4 };

/** The enlarged view (ticket 08): opens from a preview, a pin or a located
 * Finding row, with Front/Back switching, Fit/200%/400% zoom and the As
 * printed / With guides toggle, reusing ArtworkPreview (ticket 07) — no
 * second renderer. The chosen Finding stays outlined, pulses and is scrolled
 * into view. */
export default function EnlargedPreview({ t, initialSlot, initialSelectedKey, preview, orderedTrimMm, productBleedMm, productSafeMm, groups, onClose }) {
  const hasBack = Boolean(preview.back);
  const [slot, setSlot] = useState(initialSlot);
  const [zoom, setZoom] = useState("fit");
  const [withGuides, setWithGuides] = useState(true);
  const [selectedKey, setSelectedKey] = useState(initialSelectedKey ?? null);
  const scrollRef = useRef(null);

  const sameAsFront = Boolean(preview.back?.same_as_front);
  const image = slot === "front" ? preview.front : sameAsFront ? preview.front : preview.back;
  const geom = previewGeometry(orderedTrimMm, productBleedMm);
  const widthPx = zoom === "fit" ? null : geom.vw * ZOOM_MULT[zoom] * MM_TO_PX;

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!selectedKey || !container || zoom === "fit") return;
    const group = groups.find((g) => g.key === selectedKey && g.slot === slot);
    if (!group) return;
    const pxPerMm = ZOOM_MULT[zoom] * MM_TO_PX;
    const [cx, cy] = findingCenterMm(group, geom);
    const left = (cx - geom.vx) * pxPerMm - container.clientWidth / 2;
    const top = (cy - geom.vy) * pxPerMm - container.clientHeight / 2;
    container.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: "smooth" });
    // Re-run whenever the zoomed content actually changes; geom/groups are
    // derived fresh each render from stable props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, slot, zoom]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-[560px] bg-white shadow-xl flex flex-col p-[16px] gap-[12px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between">
          <div className="flex gap-[8px]">
            <ToggleButton active={slot === "front"} onClick={() => setSlot("front")} label={t("front")} />
            {hasBack && <ToggleButton active={slot === "back"} onClick={() => setSlot("back")} label={t("back")} />}
          </div>
          <button type="button" onClick={onClose} aria-label={t("close")} className="text-[20px] leading-none px-[8px] text-[#575c64]">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-[8px] flex-wrap">
          <ToggleButton active={zoom === "fit"} onClick={() => setZoom("fit")} label={t("zoomFit")} />
          <ToggleButton active={zoom === "200"} onClick={() => setZoom("200")} label="200%" />
          <ToggleButton active={zoom === "400"} onClick={() => setZoom("400")} label="400%" />
          <span className="flex-1" />
          <ToggleButton active={!withGuides} onClick={() => setWithGuides(false)} label={t("asPrinted")} />
          <ToggleButton active={withGuides} onClick={() => setWithGuides(true)} label={t("withGuides")} />
        </div>

        <div ref={scrollRef} dir="ltr" className="flex-1 overflow-auto bg-[#f0f3ff] rounded-[12px] p-[10px]">
          <div style={widthPx ? { width: `${widthPx}px` } : undefined}>
            <ArtworkPreview
              slot={slot}
              image={image}
              orderedTrimMm={orderedTrimMm}
              productBleedMm={productBleedMm}
              productSafeMm={productSafeMm}
              groups={groups}
              withGuides={withGuides}
              selectedKey={selectedKey}
              onSelectFinding={(group) => setSelectedKey(group.key)}
              ariaLabel={t("previewLabel", { side: t(slot === "front" ? "front" : "back") })}
            />
          </div>
        </div>

        {slot === "back" && sameAsFront && <p className="text-[#575c64] text-[11px] text-center">{t("sameAsFront")}</p>}

        <Legend t={t} missingBleedLabel={t("legendMissingBleed")} />

        <p className="text-[#575c64] text-[11px] text-center">{t("previewOnlyNote")}</p>
      </div>
    </div>
  );
}
