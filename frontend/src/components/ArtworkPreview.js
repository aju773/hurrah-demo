"use client";

import { useId } from "react";
import { EDGE_CODES } from "@/lib/findings";

const SEVERITY_COLOURS = { error: "#d7263d", warning: "#c98200", note: "#2563eb" };
const VIEWBOX_PAD = 6;

// Shared viewBox geometry (trim-mm, padded) so the enlarged view (ticket 08)
// can size its zoom levels and scroll a Finding into view without a second
// renderer knowing the padding/bleed maths baked into the SVG below.
export function previewGeometry(orderedTrimMm, productBleedMm) {
  const [W, H] = orderedTrimMm;
  const bleed = productBleedMm;
  return {
    W,
    H,
    bleed,
    vx: -bleed - VIEWBOX_PAD,
    vy: -bleed - VIEWBOX_PAD,
    vw: W + 2 * bleed + 2 * VIEWBOX_PAD,
    vh: H + 2 * bleed + 2 * VIEWBOX_PAD,
  };
}

// The centre, in trim-mm, of a combineFindings() group — the first bbox it
// carries, or the page centre for an edge-ring code (ticket 08's "scrolled
// into view").
export function findingCenterMm(group, geom) {
  const withBbox = group.findings.find((f) => f.bbox);
  if (withBbox) {
    const [x0, y0, x1, y1] = withBbox.bbox;
    return [(x0 + x1) / 2, (y0 + y1) / 2];
  }
  return [geom.W / 2, geom.H / 2];
}

// The one preview component (ticket 07): a single SVG with a viewBox in
// trim-mm, drawing the server-rendered page image plus every overlay (cut
// line, bleed, safe area, missing-bleed hatch, Finding highlights and pins).
// `image.transform` (ticket 09: orders/views._slot_preview, `{mode, scale}`)
// is null unless the customer picked "Keep {Size} and resize" — the file's
// own trim is then centred on the ordered trim at that scale instead of
// assumed to equal it. Orientation mismatches (file landscape, order
// portrait — the no-match-size case only; a matched Size never differs in
// orientation, see .scratch/flyer-demo/issues/08-size-detection-rules.md)
// aren't rotated in the drawing, only in the backend's scale maths
// (orders/size_choice._target_trim_mm) — a documented simplification for the
// demo. The rendered page image is drawn stretched to exactly the scaled
// [trim + 2*file_bleed_mm]; this only matches the image's real aspect ratio
// when the file's bleed is uniform on every side, true for every fixture
// this demo builds (F1: no bleed; F2: uniform 3mm) but not guaranteed for a
// real TrimBox with asymmetric BleedBox margins.
export default function ArtworkPreview({
  slot,
  image,
  orderedTrimMm,
  productBleedMm,
  productSafeMm,
  groups,
  withGuides,
  selectedKey,
  onSelectFinding,
}) {
  const uid = useId().replace(/:/g, "");
  const clipId = `clip-${uid}`;
  const outsideClipId = `outside-${uid}`;
  const hatchId = `hatch-${uid}`;

  const safe = productSafeMm;
  const fileBleed = image?.file_bleed_mm ?? 0;
  const transform = image?.transform ?? null;
  const scale = transform?.scale ?? 1;

  const { W, H, bleed, vx, vy, vw, vh } = previewGeometry(orderedTrimMm, productBleedMm);

  const clip = withGuides
    ? { x: -bleed, y: -bleed, w: W + 2 * bleed, h: H + 2 * bleed }
    : { x: 0, y: 0, w: W, h: H };

  // The file's own actual coverage in ordered trim-mm: at scale 1 with no
  // offset (no transform), this reduces to exactly the old "file trim sits
  // on the ordered trim" assumption.
  const [fileTrimW, fileTrimH] = image?.file_trim_mm ?? [W, H];
  const offsetX = (W - fileTrimW * scale) / 2;
  const offsetY = (H - fileTrimH * scale) / 2;
  const scaledBleed = fileBleed * scale;
  const fileX = offsetX - scaledBleed;
  const fileY = offsetY - scaledBleed;
  const fileW = fileTrimW * scale + 2 * scaledBleed;
  const fileH = fileTrimH * scale + 2 * scaledBleed;
  const missingBleed = withGuides && !transform && fileBleed < bleed;

  const slotGroups = (groups ?? []).filter((g) => g.slot === slot);

  if (!image) return null;

  return (
    <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} className="w-full h-auto block" role="img" aria-label={`${slot} preview`}>
      <defs>
        <clipPath id={clipId}>
          <rect x={clip.x} y={clip.y} width={clip.w} height={clip.h} />
        </clipPath>
        {/* The ring between the visible clip and the padded viewBox — where a
            Fill's scaled-up artwork keeps going past what actually prints
            (spec: "Preview... darkening what's cut off"). */}
        <clipPath id={outsideClipId}>
          <path
            fillRule="evenodd"
            d={`M${vx} ${vy}h${vw}v${vh}h${-vw}z M${clip.x} ${clip.y}h${clip.w}v${clip.h}h${-clip.w}z`}
          />
        </clipPath>
        <pattern id={hatchId} width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="1" height="2" fill="#d7263d" opacity="0.55" />
        </pattern>
      </defs>

      <rect x={clip.x} y={clip.y} width={clip.w} height={clip.h} fill="#ffffff" />

      <g clipPath={`url(#${clipId})`}>
        {image.image_url && (
          <image
            href={image.image_url}
            x={fileX}
            y={fileY}
            width={fileW}
            height={fileH}
            preserveAspectRatio="none"
          />
        )}
      </g>

      {transform?.mode === "fill" && image.image_url && (
        <g clipPath={`url(#${outsideClipId})`}>
          <rect x={vx} y={vy} width={vw} height={vh} fill="#151c27" opacity="0.55" />
          <image href={image.image_url} x={fileX} y={fileY} width={fileW} height={fileH} preserveAspectRatio="none" opacity="0.45" />
        </g>
      )}

      {withGuides && missingBleed && (
        <path
          fillRule="evenodd"
          fill={`url(#${hatchId})`}
          d={`M${-bleed} ${-bleed}h${W + 2 * bleed}v${H + 2 * bleed}h${-(W + 2 * bleed)}z M${fileX} ${fileY}h${fileW}v${fileH}h${-fileW}z`}
        />
      )}

      {withGuides && (
        <>
          <rect x={-bleed} y={-bleed} width={W + 2 * bleed} height={H + 2 * bleed} fill="none" stroke="#2563eb" strokeWidth="0.4" />
          <rect x={0} y={0} width={W} height={H} fill="none" stroke="#d7263d" strokeWidth="0.6" strokeDasharray="3 1.5" />
          <rect x={safe} y={safe} width={W - 2 * safe} height={H - 2 * safe} fill="none" stroke="#1f7a4d" strokeWidth="0.45" strokeDasharray="0.8 1.2" />
        </>
      )}

      {withGuides &&
        slotGroups.flatMap((group) =>
          group.findings.map((finding, i) => {
            const colour = SEVERITY_COLOURS[group.severity];
            const isEdge = !finding.bbox && EDGE_CODES.has(group.code);
            if (!finding.bbox && !isEdge) return null;
            const rect = highlightRect(finding, isEdge, { W, H, bleed });
            const handleClick = onSelectFinding
              ? (e) => {
                  e.stopPropagation();
                  onSelectFinding(group);
                }
              : undefined;
            const pin = isEdge ? { x: W - 4, y: -bleed - 1 } : { x: rect.x, y: rect.y };
            return (
              <g key={`${group.key}-${i}`} onClick={handleClick} className={onSelectFinding ? "cursor-pointer" : undefined}>
                <rect
                  {...rect}
                  fill={isEdge ? "none" : colour}
                  fillOpacity={isEdge ? undefined : 0.1}
                  stroke={colour}
                  strokeWidth={isEdge ? bleed : 0.6}
                  strokeOpacity={isEdge ? 0.35 : undefined}
                />
                <Pin x={pin.x} y={pin.y} n={group.n} colour={colour} />
              </g>
            );
          })
        )}

      {/* The chosen Finding stays outlined and pulsing regardless of the As
          printed / With guides toggle (spec story 70) — unlike the pins and
          base highlights above, it isn't gated on `withGuides`. */}
      {slotGroups.flatMap((group) => {
        if (group.key !== selectedKey) return [];
        return group.findings.map((finding, i) => {
          const isEdge = !finding.bbox && EDGE_CODES.has(group.code);
          if (!finding.bbox && !isEdge) return null;
          const colour = SEVERITY_COLOURS[group.severity];
          const rect = highlightRect(finding, isEdge, { W, H, bleed });
          return (
            <rect
              key={`sel-${group.key}-${i}`}
              {...rect}
              fill="none"
              stroke={colour}
              strokeWidth={isEdge ? bleed : 1.4}
              strokeOpacity={isEdge ? 0.6 : undefined}
              className="animate-pulse"
            />
          );
        });
      })}
    </svg>
  );
}

// Geometry shared by a Finding's base highlight and its selected pulse
// outline (trim-mm): a bbox rect as-is, or a ring around the whole page for
// an edge code (EDGE_CODES) with no bbox of its own.
function highlightRect(finding, isEdge, { W, H, bleed }) {
  if (!isEdge) {
    const [x0, y0, x1, y1] = finding.bbox;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: "1" };
  }
  return { x: -bleed / 2, y: -bleed / 2, width: W + bleed, height: H + bleed };
}

function Pin({ x, y, n, colour }) {
  return (
    <g>
      <circle cx={x} cy={y} r="3.8" fill={colour} stroke="#fff" strokeWidth="0.7" />
      <text x={x} y={y + 1.4} textAnchor="middle" fontSize="4.2" fontWeight="700" fill="#fff">
        {n}
      </text>
    </g>
  );
}
