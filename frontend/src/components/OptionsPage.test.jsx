import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe("the Price grid replacing Quantity and Turnaround (ticket 03)", () => {
  const CATALOGUE_QT = {
    options: [
      { code: "quantity", name: "Quantity", values: [{ code: "500", label: "500" }, { code: "1000", label: "1,000" }] },
      { code: "turnaround", name: "Turnaround", values: [{ code: "standard", label: "Standard" }, { code: "same-day", label: "Same-day" }] },
    ],
  };
  const GRID_QUOTE = { base_aed: 100, uplifts: [], subtotal_aed: 100, vat_aed: 5, total_aed: 105, per_piece_aed: 0.21 };
  const PRICE_GRID = [
    {
      quantity: "500",
      cells: [
        { quantity: "500", turnaround: "standard", quote: GRID_QUOTE },
        { quantity: "500", turnaround: "same-day", blocked: true, reason: "Same-day not available for A3" },
      ],
    },
  ];

  function showGrid({ commerceEnabled, onPick = vi.fn() } = {}) {
    const state = {
      commerceEnabled,
      quote: commerceEnabled ? GRID_QUOTE : null,
      notices: [],
      blocked: {},
      priceGrid: commerceEnabled ? PRICE_GRID : [],
      clock: CLOCK,
      turnarounds: [{ code: "standard", ...CLOCK }, { code: "same-day", ...CLOCK }],
      available: true,
    };
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <OptionsPage
          catalogue={CATALOGUE_QT}
          selection={{ quantity: "500", turnaround: "standard" }}
          state={state}
          locale="en"
          syncBanner={null}
          clockNotice={false}
          onPick={onPick}
          onClockExpire={vi.fn()}
          onStart={vi.fn()}
        />
      </NextIntlClientProvider>
    );
    return { onPick };
  }

  it("with Commerce on, shows the grid in place of separate Quantity and Turnaround rows", () => {
    showGrid({ commerceEnabled: true });
    expect(screen.getByText(en.FlyersConfigurator.priceGrid)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Quantity" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Turnaround" })).toBeNull();
  });

  it("with Commerce off, shows Quantity and Turnaround as chips and no grid", () => {
    showGrid({ commerceEnabled: false });
    expect(screen.queryByText(en.FlyersConfigurator.priceGrid)).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Quantity" })).toBeInTheDocument();
  });

  it("clicking an available cell picks both Quantity and Turnaround", () => {
    const { onPick } = showGrid({ commerceEnabled: true });
    const cell = screen.getByRole("table").querySelector("button:not([disabled])");
    fireEvent.click(cell);
    expect(onPick).toHaveBeenCalledWith("quantity", "500");
    expect(onPick).toHaveBeenCalledWith("turnaround", "standard");
  });

  it("a blocked cell is disabled, cannot be picked and shows its reason", () => {
    const { onPick } = showGrid({ commerceEnabled: true });
    const blockedCell = screen.getByTitle("Same-day not available for A3");
    expect(blockedCell).toBeDisabled();
    fireEvent.click(blockedCell);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText("Same-day not available for A3")).toBeInTheDocument();
  });
});
