import { describe, expect, it } from "vitest";
import { deliveryParts, formatCountdown, formatPromisedDate, formatWindow } from "./clock";

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

  it("uses Arabic unit letters with Western digits", () => {
    expect(formatCountdown(3600 + 24 * 60, "ar")).toBe("1س 24د");
    expect(formatCountdown(24 * 60 + 10, "ar")).toBe("24د 10ث");
    expect(formatCountdown(10, "ar")).toBe("10ث");
  });
});

describe("formatPromisedDate", () => {
  it("renders a short weekday, day and month in Dubai", () => {
    expect(formatPromisedDate("2026-09-22", "en")).toBe("Tue 22 Sep");
  });

  it("renders Gregorian Arabic names with Western digits", () => {
    expect(formatPromisedDate("2026-09-22", "ar")).toBe("الثلاثاء 22 سبتمبر");
  });

  it("never emits Arabic-Indic digits", () => {
    for (let month = 1; month <= 12; month++) {
      const iso = `2026-${String(month).padStart(2, "0")}-15`;
      expect(formatPromisedDate(iso, "ar")).not.toMatch(/[٠-٩]/);
    }
  });
});

describe("formatWindow", () => {
  it("shows a start-end range when the Turnaround has a window start", () => {
    expect(formatWindow({ window_start: "15:00", window_end: "20:00" })).toBe("15:00–20:00");
  });

  it("shows 'by <end>' when there is no window start (Standard)", () => {
    expect(formatWindow({ window_start: null, window_end: "20:00" })).toBe("by 20:00");
  });

  it("takes the translated 'by' word", () => {
    expect(formatWindow({ window_start: null, window_end: "20:00" }, "بحلول")).toBe("بحلول 20:00");
  });
});

describe("deliveryParts", () => {
  const clock = { promised_date: "2026-09-22", window_start: "15:00", window_end: "20:00", seconds_to_cutoff: 5040 };

  it("matches the spec's example pieces", () => {
    expect(deliveryParts(clock, 5040, "en", "by")).toEqual({
      countdown: "1h 24m",
      date: "Tue 22 Sep",
      window: "15:00–20:00",
    });
  });

  it("falls back to the clock's own seconds_to_cutoff when no live countdown is given", () => {
    const standard = { promised_date: "2026-09-22", window_start: null, window_end: "20:00", seconds_to_cutoff: 30 };
    expect(deliveryParts(standard, null, "en", "by")).toEqual({
      countdown: "30s",
      date: "Tue 22 Sep",
      window: "by 20:00",
    });
  });

  it("formats every piece for Arabic", () => {
    expect(deliveryParts(clock, 5040, "ar", "بحلول")).toEqual({
      countdown: "1س 24د",
      date: "الثلاثاء 22 سبتمبر",
      window: "15:00–20:00",
    });
  });
});
