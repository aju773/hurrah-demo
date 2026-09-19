import { describe, expect, it } from "vitest";
import { deliveryLine, formatCountdown, formatPromisedDate, formatWindow } from "./clock";

describe("formatCountdown", () => {
  it("shows hours and minutes once past an hour", () => {
    expect(formatCountdown(3600 + 24 * 60)).toBe("1h 24m");
  });

  it("drops to minutes and seconds under an hour", () => {
    expect(formatCountdown(24 * 60 + 10)).toBe("24m 10s");
  });

  it("drops to seconds only under a minute", () => {
    expect(formatCountdown(10)).toBe("10s");
  });

  it("floors negative values at zero", () => {
    expect(formatCountdown(-5)).toBe("0s");
  });
});

describe("formatPromisedDate", () => {
  it("renders a short weekday, day and month in Dubai", () => {
    expect(formatPromisedDate("2026-09-22", "en")).toBe("Tue 22 Sep");
  });
});

describe("formatWindow", () => {
  it("shows a start-end range when the Turnaround has a window start", () => {
    expect(formatWindow({ window_start: "15:00", window_end: "20:00" })).toBe("15:00–20:00");
  });

  it("shows 'by <end>' when there is no window start (Standard)", () => {
    expect(formatWindow({ window_start: null, window_end: "20:00" })).toBe("by 20:00");
  });
});

describe("deliveryLine", () => {
  it("matches the spec's example line", () => {
    const clock = { promised_date: "2026-09-22", window_start: "15:00", window_end: "20:00", seconds_to_cutoff: 5040 };
    expect(deliveryLine(clock, 5040, "en")).toBe("Approve in 1h 24m for delivery Tue 22 Sep, 15:00–20:00 (Dubai)");
  });

  it("falls back to the clock's own seconds_to_cutoff when no live countdown is given", () => {
    const clock = { promised_date: "2026-09-22", window_start: null, window_end: "20:00", seconds_to_cutoff: 30 };
    expect(deliveryLine(clock, null, "en")).toBe("Approve in 30s for delivery Tue 22 Sep, by 20:00 (Dubai)");
  });
});
