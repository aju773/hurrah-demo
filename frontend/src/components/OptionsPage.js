"use client";

import { useTranslations } from "next-intl";
import TurnaroundCards from "./TurnaroundCards";
import SummaryPanel from "./SummaryPanel";
import FirstVisitHint from "./FirstVisitHint";
import JourneyActionBar from "./JourneyActionBar";

/** The Options page: every Option, the Summary (Quote and Price grid when the
 * Commerce switch is on), Restriction reasons and "Start ordering". No Artwork.
 * Single-screen at a desktop/laptop floor of 1024x700 (CONTEXT.md): every Option
 * on one compact row, label on one side and its choices on the other, with the
 * live Summary beside them and "Start ordering" in the action bar pinned at the
 * bottom. Below the floor the row stacks (label above its choices) as before.
 * With the Commerce switch on, the Price grid takes the place of the separate
 * Quantity and Turnaround rows (PriceGridRow, below): a cell picks both. */
export default function OptionsPage({ catalogue, selection, state, locale, syncBanner, clockNotice, onPick, onClockExpire, onStart }) {
  const t = useTranslations("FlyersConfigurator");
  const { commerceEnabled } = state;
  const blocked = state.blocked ?? {};
  const quantityOption = catalogue.options.find((o) => o.code === "quantity");
  const turnaroundOption = catalogue.options.find((o) => o.code === "turnaround");
  // With the Commerce switch on, the Price grid replaces the separate Quantity and
  // Turnaround rows (a cell picks both): rendered once, in their place in the
  // option list, so the visual order is unchanged. With the switch off, or if the
  // catalogue is missing either Option, they stay as ordinary rows below.
  const gridReplaces = commerceEnabled && Boolean(quantityOption) && Boolean(turnaroundOption);
  // Options to render as rows, with Quantity and Turnaround collapsed into one
  // "grid" row in their place when the Price grid replaces them.
  const rows = [];
  for (const option of catalogue.options) {
    if (gridReplaces && (option.code === "quantity" || option.code === "turnaround")) {
      if (!rows.some((row) => row.type === "grid")) rows.push({ type: "grid" });
      continue;
    }
    rows.push({ type: "option", option });
  }

  return (
    <div className="flex flex-col gap-[16px] w-full lg:flex-1 lg:min-h-0" dir={locale === "ar" ? "rtl" : "ltr"}>
      <FirstVisitHint step="options" />

      {syncBanner}
      {clockNotice && <Notices notices={[{ reason: t("clockMovedNotice") }]} />}
      {state.notices?.length > 0 && <Notices notices={state.notices} />}

      <div className="grid grid-cols-12 gap-[20px] w-full items-start lg:flex-1 lg:min-h-0">
        {/* Options panel */}
        <div id="options-panel" tabIndex={-1} className="col-span-12 lg:col-span-7 min-w-0 flex flex-col gap-[10px] lg:self-stretch lg:min-h-0">
          {rows.map((row) => {
            if (row.type === "grid") {
              return (
                <PriceGridRow
                  key="price-grid"
                  t={t}
                  quantityOption={quantityOption}
                  turnaroundOption={turnaroundOption}
                  priceGrid={state.priceGrid ?? []}
                  selection={selection}
                  onPick={onPick}
                />
              );
            }
            const option = row.option;
            const usesCards = !commerceEnabled && option.code === "turnaround";
            const reasons = [...new Set(option.values.map((value) => blocked[option.code]?.[value.code]?.reason).filter(Boolean))];
            return (
              <div
                key={option.code}
                className="bg-[#f0f3ff] rounded-[12px] px-[12px] py-[10px] flex flex-col gap-[6px] lg:flex-row lg:items-center lg:gap-[16px]"
              >
                <span className="text-[#5d3f3e] text-[10px] font-bold tracking-[0.5px] uppercase lg:w-[110px] lg:shrink-0">{option.name}</span>
                <div className="flex-1 min-w-0 flex flex-col gap-[6px]">
                  {usesCards ? (
                    <TurnaroundCards
                      option={option}
                      selected={selection.turnaround}
                      blocked={blocked.turnaround}
                      turnarounds={state.turnarounds}
                      clock={state.clock}
                      locale={locale}
                      onPick={(code) => onPick("turnaround", code)}
                      onExpire={onClockExpire}
                    />
                  ) : (
                    <div
                      className="flex flex-wrap gap-[8px]"
                      {...(option.code === "quantity" ? { role: "radiogroup", "aria-label": option.name } : { role: "group", "aria-label": option.name })}
                    >
                      {option.values.map((value) => {
                        const reason = blocked[option.code]?.[value.code];
                        const selected = selection[option.code] === value.code;
                        return (
                          <button
                            key={value.code}
                            type="button"
                            {...(option.code === "quantity" ? { role: "radio", "aria-checked": selected } : { "aria-pressed": selected })}
                            disabled={Boolean(reason)}
                            title={reason?.reason ?? ""}
                            aria-description={reason?.reason}
                            onClick={() => onPick(option.code, value.code)}
                            className={`tap h-[36px] px-[14px] rounded-[8px] text-[12px] font-semibold transition-colors ${
                              reason
                                ? "bg-[#e2e8f8] text-[#9aa1ad] cursor-not-allowed"
                                : selected
                                ? "bg-[#e51937] text-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
                                : "bg-white text-[#151c27] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
                            }`}
                          >
                            {selected && <span aria-hidden="true">✓ </span>}
                            {value.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {/* Restriction reasons stay visible next to the choices, not only in a tooltip
                     (TurnaroundCards already writes its own reason out on the blocked card). */}
                  {!usesCards && reasons.length > 0 && <p className="text-[#b0001d] text-[11px]">{reasons.join(" · ")}</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary panel */}
        <div className="col-span-12 lg:col-span-5 min-w-0">
          <SummaryPanel catalogue={catalogue} selection={selection} state={state} locale={locale} onExpire={onClockExpire} />
        </div>
      </div>

      <JourneyActionBar
        primary={
          <>
            {!state.available && (
              <span id="start-ordering-disabled-reason" className="text-[#b0001d] text-[13px] font-semibold">
                {t("notAvailable")}
              </span>
            )}
            <button
              type="button"
              disabled={!state.available}
              aria-describedby={!state.available ? "start-ordering-disabled-reason" : undefined}
              onClick={onStart}
              className="tap h-[44px] px-[24px] rounded-[8px] text-[14px] font-semibold bg-[#e51937] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("startOrdering")}
            </button>
          </>
        }
      />
    </div>
  );
}

/** The Price grid (Quantity x Turnaround), in the Options row it replaces: a cell
 * picks both at once. Its own panel scrolls internally (header kept in view) once
 * it has more rows than fit, so it never grows the Options page taller than the
 * viewport — `lg:flex-1 lg:min-h-0` lets it take exactly the room left over from
 * the other rows in the flex column above it. */
function PriceGridRow({ t, quantityOption, turnaroundOption, priceGrid, selection, onPick }) {
  const reasons = [...new Set(priceGrid.flatMap((row) => row.cells).map((cell) => cell.blocked && cell.reason).filter(Boolean))];

  return (
    <div className="bg-[#f0f3ff] rounded-[12px] px-[12px] py-[10px] flex flex-col gap-[6px] lg:flex-1 lg:min-h-0">
      <span className="text-[#5d3f3e] text-[10px] font-bold tracking-[0.5px] uppercase">{t("priceGrid")}</span>
      <div className="flex-1 min-h-0 rounded-[8px] bg-white overflow-x-auto overflow-y-auto">
        <table className="w-full text-left" style={{ minWidth: "600px" }}>
          <thead>
            <tr>
              <th scope="col" className="sticky top-0 z-[1] bg-[#f0f3ff] p-[10px] text-[#5d3f3e] text-[11px] font-bold uppercase">
                {t("quantity")}
              </th>
              {turnaroundOption.values.map((turnaround) => (
                <th key={turnaround.code} scope="col" className="sticky top-0 z-[1] bg-[#f0f3ff] p-[10px] text-[#5d3f3e] text-[11px] font-bold uppercase text-center">
                  {turnaround.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {priceGrid.map((row) => (
              <tr key={row.quantity} className="border-t border-[#f0f3ff]">
                <th scope="row" className="p-[10px] text-[#151c27] text-[13px] font-bold text-left">
                  {quantityOption.values.find((v) => v.code === row.quantity)?.label}
                </th>
                {row.cells.map((cell) => {
                  const isSelected = selection.quantity === cell.quantity && selection.turnaround === cell.turnaround;
                  return (
                    <td key={cell.turnaround} className="p-[6px] text-center">
                      <button
                        type="button"
                        disabled={cell.blocked}
                        aria-pressed={isSelected}
                        title={cell.blocked ? cell.reason : ""}
                        aria-description={cell.blocked ? cell.reason : undefined}
                        onClick={() => {
                          onPick("quantity", cell.quantity);
                          onPick("turnaround", cell.turnaround);
                        }}
                        className={`tap w-full rounded-[8px] px-[8px] py-[6px] ${
                          cell.blocked
                            ? "text-[#9aa1ad] cursor-not-allowed"
                            : isSelected
                            ? "bg-[#e51937] text-white"
                            : "bg-[#f0f3ff] text-[#151c27] hover:bg-[#e2e8f8]"
                        }`}
                      >
                        {cell.blocked ? (
                          <span className="text-[13px]">—</span>
                        ) : (
                          <div className="flex flex-col">
                            <span className="text-[13px] font-bold">{t("aed", { amount: cell.quote.total_aed })}</span>
                            <span className={`text-[10px] ${isSelected ? "text-white" : "text-[#575c64]"}`}>
                              {t("gridCellDetail", { subtotal: cell.quote.subtotal_aed, perPiece: cell.quote.per_piece_aed })}
                            </span>
                          </div>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reasons.length > 0 && <p className="text-[#b0001d] text-[11px]">{reasons.join(" · ")}</p>}
    </div>
  );
}

/** Restriction and fallback notices from the Configuration API ("Same-day not
 * available for A3", "Sides changed to single-sided"…). */
export function Notices({ notices }) {
  return (
    <div role="status" className="bg-[#fff8e1] border border-[#ffc72c] rounded-[8px] p-[12px] text-[#6f5400] text-[13px]">
      {notices.map((notice, i) => (
        <div key={i}>{notice.reason}</div>
      ))}
    </div>
  );
}
