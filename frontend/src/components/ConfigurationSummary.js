"use client";

import { useTranslations } from "next-intl";
import { formatPromisedDate, formatWindow } from "@/lib/clock";

/** The plain-words Configuration summary that replaces the Quote panel when the
 * Commerce switch is off: every Option's chosen value in words, and when the
 * order would be ready. No amounts. */
export default function ConfigurationSummary({ catalogue, selection, available, turnarounds, locale }) {
  const t = useTranslations("FlyersConfigurator");
  const tClock = useTranslations("Clock");
  const turnaround = (turnarounds ?? []).find((entry) => entry.code === selection.turnaround);

  return (
    <div className="bg-white rounded-[16px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] overflow-clip">
      <div className="bg-[#2a313d] px-[16px] py-[12px]">
        <h2 className="text-[#ebf1ff] text-[16px] font-semibold">{t("configurationSummary")}</h2>
      </div>
      <div className="flex flex-col gap-[8px] p-[16px]">
        {available ? (
          <>
            <dl className="flex flex-col gap-[8px]">
              {catalogue.options.map((option) => (
                <div key={option.code} className="flex items-center justify-between gap-[12px]">
                  <dt className="text-[#5d3f3e] text-[12px]">{option.name}</dt>
                  <dd className="text-[#151c27] text-[13px] font-semibold text-end">
                    {option.values.find((value) => value.code === selection[option.code])?.label}
                  </dd>
                </div>
              ))}
            </dl>
            {turnaround && (
              <>
                <div className="h-px bg-[#f0f3ff] my-[4px]" />
                <span className="text-[#151c27] text-[13px] font-semibold">
                  {t.rich("cardReady", {
                    date: formatPromisedDate(turnaround.promised_date, locale),
                    window: formatWindow(turnaround, tClock("by")),
                    ltr: (chunks) => <bdi dir="ltr">{chunks}</bdi>,
                  })}
                </span>
              </>
            )}
          </>
        ) : (
          <span className="text-[#bb0027] text-[13px] font-semibold">{t("notAvailable")}</span>
        )}
      </div>
    </div>
  );
}
