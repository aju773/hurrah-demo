import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import OptionsPage from "./OptionsPage";

// One act per second, so each tick renders and re-arms its timer before the next.
function tick(seconds) {
  for (let i = 0; i < seconds; i++) act(() => vi.advanceTimersByTime(1000));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const CATALOGUE = {
  options: [
    { code: "quantity", name: "Quantity", values: [{ code: "500", label: "500" }] },
    { code: "turnaround", name: "Turnaround", values: [{ code: "same-day", label: "Same-day" }] },
  ],
};
const CLOCK = { now: "n1", seconds_to_cutoff: 2, cutoff_time: "11:00", promised_date: "2026-09-22", window_start: "15:00", window_end: "20:00" };
const QUOTE = { base_aed: 100, uplifts: [], subtotal_aed: 100, vat_aed: 5, total_aed: 105, per_piece_aed: 0.21 };

function show({ commerceEnabled, clockNotice = false, onClockExpire = vi.fn() }) {
  const state = {
    commerceEnabled,
    quote: commerceEnabled ? QUOTE : null,
    notices: [],
    blocked: {},
    priceGrid: [],
    clock: CLOCK,
    turnarounds: [{ code: "same-day", ...CLOCK }],
    available: true,
  };
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <OptionsPage
        catalogue={CATALOGUE}
        selection={{ quantity: "500", turnaround: "same-day" }}
        state={state}
        locale="en"
        syncBanner={null}
        clockNotice={clockNotice}
        onPick={vi.fn()}
        onClockExpire={onClockExpire}
        onStart={vi.fn()}
      />
    </NextIntlClientProvider>
  );
  return { onClockExpire };
}

describe("the Cut-off clock on the Options page", () => {
  for (const commerceEnabled of [false, true]) {
    it(`shows the live countdown and re-checks the Turnaround when it expires (Commerce ${commerceEnabled ? "on" : "off"})`, () => {
      const { onClockExpire } = show({ commerceEnabled });
      expect(screen.getByText(/Approve in/)).toHaveTextContent("2s");
      tick(2);
      expect(onClockExpire).toHaveBeenCalled();
    });
  }

  it("says the promised date moved after an expiry", () => {
    show({ commerceEnabled: false, clockNotice: true });
    expect(screen.getByText(en.FlyersConfigurator.clockMovedNotice)).toBeInTheDocument();
  });

  it("shows no notice before any expiry", () => {
    show({ commerceEnabled: false });
    expect(screen.queryByText(en.FlyersConfigurator.clockMovedNotice)).toBeNull();
  });
});
