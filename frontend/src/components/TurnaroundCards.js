"use client";

import { useTranslations } from "next-intl";
import { formatPromisedDate, formatWindow } from "@/lib/clock";
import Countdown from "./Countdown";

/** The Turnaround Option as cards, for when the Commerce switch is off and
 * there is no Price grid to choose from: each card shows when the order would be
 * ready (date and window from the demo clock), the selected one adds the live
 * Cut-off countdown, and a Turnaround that can't be used stays greyed with its
 * reason written out (not only in a tooltip). */
export default function TurnaroundCards({ option, selected, blocked, turnarounds, clock, locale, onPick, onExpire }) {
  const t = useTranslations("FlyersConfigurator");
  const tClock = useTranslations("Clock");
  const byCode = Object.fromEntries((turnarounds ?? []).map((entry) => [entry.code, entry]));

  return (
    <div role="radiogroup" aria-label={option.name} className="grid grid-cols-1 sm:grid-cols-3 gap-[8px]">
      {option.values.map((value) => {
        const reason = blocked?.[value.code];
        const isSelected = selected === value.code;
        const entry = byCode[value.code];
        return (
          <button
            key={value.code}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={Boolean(reason)}
            onClick={() => onPick(value.code)}
            className={`tap flex flex-col gap-[4px] p-[12px] rounded-[10px] text-start border-2 transition-colors ${
              reason
                ? "bg-[#e2e8f8] border-transparent text-[#6b7280] cursor-not-allowed"
                : isSelected
                ? "bg-white border-[#e51937] text-[#151c27]"
                : "bg-white border-transparent text-[#151c27] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
            }`}
          >
            <span className="flex items-center justify-between gap-[8px] text-[13px] font-bold">
              {value.label}
              {isSelected && !reason && <span aria-hidden="true" className="text-[#e51937]">✓</span>}
            </span>
            {reason ? (
              <span className="text-[12px]">{reason.reason}</span>
            ) : isSelected && clock ? (
              // Keyed on clock.now like the summary countdown used to be: a fresh
              // Configuration remounts it with a clean countdown.
              <Countdown key={clock.now} clock={clock} locale={locale} onExpire={onExpire} commerceEnabled={false} className="text-[#575c64] text-[12px]" />
            ) : entry ? (
              <span className="text-[#575c64] text-[12px]">
                {t.rich("cardReady", {
                  date: formatPromisedDate(entry.promised_date, locale),
                  window: formatWindow(entry, tClock("by")),
                  ltr: (chunks) => <bdi dir="ltr">{chunks}</bdi>,
                })}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
