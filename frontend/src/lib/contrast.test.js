import { describe, expect, it } from "vitest";

// WCAG 2.2 AA contrast (1.4.3 text 4.5:1, 1.4.11 graphics 3:1) for the colour pairs that
// carry meaning in the journey: Severity, status banners and the buttons. jsdom cannot
// measure paint, so the pairs the components use are listed here and checked as numbers.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS = [
  ["Findings headline: Error", "#b0001d", "#fde8eb"],
  ["Findings headline: Warning", "#7a4f00", "#fff4d6"],
  ["Findings headline: OK", "#1f7a4d", "#e5f4ec"],
  ["Finding number badge: Error", "#ffffff", "#d7263d"],
  ["Finding number badge: Warning", "#ffffff", "#946000"],
  ["Finding number badge: Note", "#ffffff", "#2563eb"],
  ["Picker problem: can't continue", "#93000a", "#ffdad6"],
  ["Picker note", "#6f5400", "#fff8e1"],
  ["Order-changed notice", "#8a4b00", "#fff4e5"],
  ["Order status banner", "#1f7a4d", "#e5f4ec"],
  ["Error text on white", "#bb0027", "#ffffff"],
  ["Error text on the panel tint", "#bb0027", "#f0f3ff"],
  ["Primary button", "#ffffff", "#e51937"],
  ["Slot header badge: Detected", "#ffffff", "#1a7f37"],
  ["Slot header badge: Error", "#ffffff", "#bb0027"],
  ["Secondary text on white", "#575c64", "#ffffff"],
  ["Secondary text on the panel tint", "#575c64", "#f0f3ff"],
  ["Label text on the panel tint", "#5d3f3e", "#f0f3ff"],
  ["Header text on dark", "#ebf1ff", "#2a313d"],
  ["Draft translation pill", "#7a4f00", "#fff4d6"],
];

describe("colour contrast of meaningful pairs", () => {
  for (const [name, fg, bg] of TEXT_PAIRS) {
    it(`${name} is at least 4.5:1`, () => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
