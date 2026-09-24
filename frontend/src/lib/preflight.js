// Step 1's slot headline (spec: .scratch/flyer-demo/issues/09-preflight-checks-and-severity.md
// section 6). The full findings list and preview live on step 2 (ticket 07);
// step 1 only ever shows this headline plus, on Error, "Upload another file".

export function preflightHeadline(artwork) {
  if (!artwork) return null;
  const findings = artwork.preflight_report?.findings ?? [];
  // `is_valid` (backend/orders/preflight.py's BLOCKING_CODES) is already the
  // single source of truth for "must fix before ordering" — an Error finding
  // outside that set is a caution, folded into the warning count below.
  if (!artwork.is_valid) {
    return { severity: "error", icon: "⛔", count: 0, text: "Must fix before ordering" };
  }
  const warningCount = findings.filter((f) => f.severity === "warning" || f.severity === "error").length;
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
