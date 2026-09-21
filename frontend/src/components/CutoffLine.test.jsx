import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import CutoffLine from "./CutoffLine";

// One act per second, so each tick renders and re-arms its timer before the next.
function tick(seconds) {
  for (let i = 0; i < seconds; i++) act(() => vi.advanceTimersByTime(1000));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const CLOCK = { now: "n1", seconds_to_cutoff: 3, cutoff_time: "11:00", promised_date: "2026-09-22", window_start: null, window_end: "20:00" };

function show({ locale = "en", clock = CLOCK, onExpire = vi.fn() } = {}) {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
      <CutoffLine clock={clock} turnaroundLabel={locale === "ar" ? "في نفس اليوم" : "Same-day"} onExpire={onExpire} />
    </NextIntlClientProvider>
  );
  return { onExpire };
}

describe("CutoffLine", () => {
  it("is a small line naming the Turnaround and its Cut-off time, with no countdown", () => {
    show();
    expect(document.body.textContent).toBe("Same-day: order by 11:00");
    expect(document.body.textContent).not.toMatch(/\d+s\b/);
  });

  it("reads in Arabic", () => {
    show({ locale: "ar" });
    expect(document.body.textContent).toContain("في نفس اليوم");
    expect(document.body.textContent).toContain("11:00");
  });

  it("calls onExpire when the Cut-off passes, even though no countdown is shown", () => {
    const { onExpire } = show();
    expect(onExpire).not.toHaveBeenCalled();
    tick(3);
    expect(onExpire).toHaveBeenCalled();
  });
});
