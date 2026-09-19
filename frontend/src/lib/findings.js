// Step 2's one Findings list for both sides (ticket 07:
// .scratch/flyer-demo-build/issues/07-check-and-preview-step.md). Pure: takes
// the Front/Back Preflight reports (orders/preflight.py) already fetched by
// the caller and groups, sorts and numbers them the same way regardless of
// which component renders the list or the previews' pins.

export const SEVERITY_RANK = { error: 0, warning: 1, note: 2 };

// Which Preflight check a code belongs to, for the "Passed: …" line.
const CHECK_OF = {
  bleed_missing: "bleed",
  bleed_short: "bleed",
  low_ppi: "images",
  font_not_embedded: "fonts",
  rgb_colour: "colour",
  file_repaired: "file",
  check_incomplete: "file",
  fit_border: "size",
  fill_crop: "size",
};
const ALL_CHECKS = ["bleed", "images", "fonts", "colour", "file"];
// "size" only ever joins the passed-checks line when a Fit/Fill instruction
// was actually applied (ticket 09) — otherwise there was nothing to check.
const RESIZE_CHECK = "size";

// A code whose Findings mark the page edge rather than one place on it (drawn
// as a ring around the trim, pin top-right — see components/ArtworkPreview.js)
// when they carry no bbox of their own.
export const EDGE_CODES = new Set(["bleed_missing", "bleed_short"]);

// A code where a lower measured value is the worse one (so grouping keeps the
// worst, e.g. "lowest 180 ppi"). Every other code keeps the highest.
const WORSE_IS_LOWER = new Set(["low_ppi"]);

function slotFindings(report, slot) {
  return (report?.findings ?? []).map((f) => ({ ...f, slot: f.slot ?? slot }));
}

/** Groups repeated Findings per code per slot (worst Severity wins), sorts
 * Error -> Warning -> Note, and numbers 1..n. A "Same as front" Back
 * contributes no Findings of its own — the list isn't padded (spec story 73).
 * `front`/`back` are Preflight reports ({findings: [...]})  or null. */
export function combineFindings({ front, back, sameAsFront }) {
  const raw = [...slotFindings(front, "front"), ...(sameAsFront ? [] : slotFindings(back, "back"))];

  const groups = new Map();
  for (const finding of raw) {
    const key = `${finding.slot}:${finding.code}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, code: finding.code, slot: finding.slot, severity: finding.severity, findings: [] };
      groups.set(key, group);
    }
    group.findings.push(finding);
    if (SEVERITY_RANK[finding.severity] < SEVERITY_RANK[group.severity]) group.severity = finding.severity;
  }

  const grouped = [...groups.values()].map((group) => {
    const values = group.findings.map((f) => f.value).filter((v) => typeof v === "number");
    let worstValue = null;
    if (values.length) {
      worstValue = WORSE_IS_LOWER.has(group.code) ? Math.min(...values) : Math.max(...values);
    }
    return { ...group, count: group.findings.length, worstValue, message: group.findings[0].message };
  });

  grouped.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.slot.localeCompare(b.slot) ||
      a.code.localeCompare(b.code)
  );

  return grouped.map((group, i) => ({ ...group, n: i + 1 }));
}

/** The checks that raised no Finding at all, for the "Passed: …" line.
 * `resized` (a Fit/Fill instruction was applied, ticket 09) adds "size" to
 * the list the same way — checked, and clean unless a fit_border/fill_crop
 * Finding says otherwise. */
export function passedChecks(groups, { resized = false } = {}) {
  const failed = new Set(groups.map((g) => CHECK_OF[g.code]).filter(Boolean));
  const checks = resized ? [...ALL_CHECKS, RESIZE_CHECK] : ALL_CHECKS;
  return checks.filter((c) => !failed.has(c));
}

/** The order headline: worst Severity across both sides (spec story 66). */
export function orderHeadline(groups) {
  if (groups.some((g) => g.severity === "error")) {
    return { severity: "error", icon: "⛔", count: 0, text: "Must fix before ordering" };
  }
  const warningCount = groups.filter((g) => g.severity === "warning").length;
  if (warningCount > 0) {
    return {
      severity: "warning",
      icon: "⚠️",
      count: warningCount,
      text: `Can print — ${warningCount} thing${warningCount === 1 ? "" : "s"} to check`,
    };
  }
  return { severity: "ok", icon: "✅", count: 0, text: "Ready to print" };
}

/** The headline as translated text: `t` is a next-intl translator over the
 * "Preflight" messages (headlineOk / headlineWarning with a plural `count` /
 * headlineError). `text` on the headline stays the English wording. */
export function headlineText(t, headline) {
  if (headline.severity === "error") return t("headlineError");
  if (headline.severity === "warning") return t("headlineWarning", { count: headline.count });
  return t("headlineOk");
}

/** A Finding group's sentence in the viewer's language. Server codes are the
 * message keys ("<code>_<severity>": low_ppi is a Warning and an Error with
 * different wording); a code the message file doesn't know yet keeps the
 * server's English sentence. `t` is a next-intl translator with `t.has`. */
export function findingMessage(t, group) {
  const key = `${group.code}_${group.severity}`;
  return t.has(key) ? t(key) : group.message;
}

/** A slot's upload error ({code, message} from the artwork API) in the viewer's
 * language, falling back to the server's English message for an unknown code. */
export function slotErrorMessage(t, error) {
  if (!error) return null;
  return t.has(error.code) ? t(error.code) : error.message ?? null;
}

export function slotHeadline(groups, slot) {
  return orderHeadline(groups.filter((g) => g.slot === slot));
}

/** Next is disabled on step 2 while any Error remains (spec story 75). */
export function canGoNext(groups) {
  return !groups.some((g) => g.severity === "error");
}

// Short names for the step 3 "I accept…" warnings tick (spec story 79: "a
// warning tick listing them by short name"). Plain JS, not next-intl
// messages, the same way lib/api.js's ARTWORK_ERROR_MESSAGES are — these
// aren't UI copy the client owns, they're server Finding codes relabelled.
const WARNING_SHORT_NAMES = {
  bleed_missing: { en: "missing bleed", ar: "بدون نزيف" },
  bleed_short: { en: "short bleed", ar: "نزيف غير كافٍ" },
  low_ppi: { en: "low resolution image", ar: "صورة منخفضة الدقة" },
  file_repaired: { en: "repaired file", ar: "ملف تم إصلاحه" },
  check_incomplete: { en: "not fully checked", ar: "لم يتم فحصه بالكامل" },
  fit_border: { en: "white border", ar: "حاشية بيضاء" },
  fill_crop: { en: "cropped edges", ar: "حواف مقصوصة" },
};

export function warningShortName(code, locale) {
  const entry = WARNING_SHORT_NAMES[code];
  if (!entry) return code;
  return locale === "ar" ? entry.ar : entry.en;
}
