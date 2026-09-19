// Step 1's slot headline (spec: .scratch/flyer-demo/issues/09-preflight-checks-and-severity.md
// section 6). The full findings list and preview live on step 2 (ticket 07);
// step 1 only ever shows this headline plus, on Error, "Upload another file".

export function preflightHeadline(artwork) {
  if (!artwork) return null;
  const findings = artwork.preflight_report?.findings ?? [];
  const hasError = !artwork.is_valid || findings.some((f) => f.severity === "error");
  if (hasError) {
    return { severity: "error", icon: "⛔", count: 0, text: "Must fix before ordering" };
  }
  const warningCount = findings.filter((f) => f.severity === "warning").length;
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
