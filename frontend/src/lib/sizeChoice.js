// Fit/Fill maths (ticket 09: .scratch/flyer-demo-build/issues/09-keep-size-and-resize-fit-fill.md,
// mirrors backend/orders/size_choice.py exactly so the "Keep {Size} and
// resize my file" dialog can show both previews and their scale/border/crop
// note instantly, with no round trip. The uploaded file is never rewritten —
// this only computes the instruction the preview (and, once confirmed, the
// preview API's `resize_mode`) draws.

export const FIT = "fit";
export const FILL = "fill";

function targetTrimMm([orderedW, orderedH], [fileW, fileH]) {
  const orderedLandscape = orderedW > orderedH;
  const fileLandscape = fileW > fileH;
  return orderedLandscape === fileLandscape ? [orderedW, orderedH] : [orderedH, orderedW];
}

/** Returns { mode, scale, scalePct, whiteBorderMm, cropMm, edges }. `edges`
 * is ["top","bottom"] or ["left","right"] (whichever axis carries the
 * border/crop), or null when it rounds to zero. */
export function computeSizeChoice(mode, orderedTrimMm, fileTrimMm, fileBleedMm, productBleedMm) {
  const [targetW, targetH] = targetTrimMm(orderedTrimMm, fileTrimMm);
  const [fileW, fileH] = fileTrimMm;
  const bleed = fileBleedMm ?? 0;

  if (mode === FIT) {
    const scale = Math.min(targetW / fileW, targetH / fileH);
    const borderW = (targetW - fileW * scale) / 2;
    const borderH = (targetH - fileH * scale) / 2;
    const borderMm = Math.max(borderW, borderH);
    return {
      mode: FIT,
      scale,
      scalePct: Math.round(scale * 1000) / 10,
      whiteBorderMm: Math.round(borderMm * 10) / 10,
      cropMm: null,
      edges: borderMm > 0 ? (borderW > borderH ? ["left", "right"] : ["top", "bottom"]) : null,
    };
  }

  if (mode === FILL) {
    const scale = Math.max(
      (targetW + 2 * productBleedMm) / (fileW + 2 * bleed),
      (targetH + 2 * productBleedMm) / (fileH + 2 * bleed)
    );
    const cropW = (fileW * scale - targetW) / 2;
    const cropH = (fileH * scale - targetH) / 2;
    const cropMm = Math.max(cropW, cropH);
    return {
      mode: FILL,
      scale,
      scalePct: Math.round(scale * 1000) / 10,
      whiteBorderMm: null,
      cropMm: Math.round(cropMm * 10) / 10,
      edges: cropMm > 0 ? (cropW > cropH ? ["left", "right"] : ["top", "bottom"]) : null,
    };
  }

  throw new Error(`mode must be "${FIT}" or "${FILL}", got ${JSON.stringify(mode)}`);
}

/** The dialog's note copy under the Fit/Fill previews (spec wording:
 * "Shrunk to 74%. White border 31.0mm on top & bottom." / "Scaled to 108%.
 * 34.0mm cut off left & right — check nothing important is lost."). */
export function scaleNote(result) {
  const edgeLabel = result.edges ? result.edges.join(" & ") : null;
  if (result.mode === FIT) {
    if (!result.whiteBorderMm) return `Scaled to ${result.scalePct}%. Fits exactly, no border.`;
    return `Shrunk to ${result.scalePct}%. White border ${result.whiteBorderMm.toFixed(1)}mm on ${edgeLabel}.`;
  }
  if (!result.cropMm) return `Scaled to ${result.scalePct}%. Fills exactly, nothing cut off.`;
  return `Scaled to ${result.scalePct}%. ${result.cropMm.toFixed(1)}mm cut off ${edgeLabel} — check nothing important is lost.`;
}

/** The same note as `scaleNote`, as a message key plus values so the dialog can
 * translate it (`edges` is "topBottom" or "leftRight", also message keys). */
export function scaleNoteMessage(result) {
  const edges = result.edges ? (result.edges[0] === "top" ? "topBottom" : "leftRight") : null;
  if (result.mode === FIT) {
    if (!result.whiteBorderMm) return { key: "noteFitExact", values: { pct: result.scalePct } };
    return { key: "noteFitBorder", values: { pct: result.scalePct, amount: result.whiteBorderMm.toFixed(1), edges } };
  }
  if (!result.cropMm) return { key: "noteFillExact", values: { pct: result.scalePct } };
  return { key: "noteFillCrop", values: { pct: result.scalePct, amount: result.cropMm.toFixed(1), edges } };
}
