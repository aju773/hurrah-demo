"use client";

import { useTranslations } from "next-intl";
import Countdown from "./Countdown";
import ConfigurationSummary from "./ConfigurationSummary";

/** The Summary of the current Configuration: the Quote when the Commerce switch is
 * on, the plain-words Configuration summary when it is off. Shown on the Options
 * page and beside the Artwork page. The Cut-off countdown shows here only when
 * `showCountdown` is on (the Options page); the Artwork page keeps a small line instead. */
export default function SummaryPanel({ catalogue, selection, state, locale, onExpire, showCountdown = true }) {
  const t = useTranslations("FlyersConfigurator");
  const { quote, commerceEnabled } = state;

  if (!commerceEnabled) {
    return (
      <ConfigurationSummary
        catalogue={catalogue}
        selection={selection}
        available={state.available}
        turnarounds={state.turnarounds}
        locale={locale}
      />
    );
  }

  return (
    <div className="bg-white rounded-[16px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] overflow-clip">
      <div className="bg-[#2a313d] px-[16px] py-[12px]">
        <span className="text-[#ebf1ff] text-[16px] font-semibold">{t("summary")}</span>
      </div>
      <div className="flex flex-col gap-[8px] p-[16px]">
        {quote ? (
          <>
            <Line label={t("basePrice")} value={t("aed", { amount: quote.base_aed })} />
            {quote.uplifts.map((uplift) => (
              <Line
                key={uplift.option}
                label={t("upliftLabel", { label: uplift.label, percent: uplift.percent })}
                value={t("aedPlus", { amount: uplift.amount_aed })}
              />
            ))}
            <div className="h-px bg-[#f0f3ff] my-[4px]" />
            <Line label={t("subtotalExVat")} value={t("aed", { amount: quote.subtotal_aed })} />
            <Line label={t("vat")} value={t("aed", { amount: quote.vat_aed })} />
            <div className="flex items-center justify-between pt-[8px]">
              <span className="text-[#151c27] text-[16px] font-bold">{t("totalInclVat")}</span>
              <span className="text-[#bb0027] text-[24px] font-extrabold">{t("aed", { amount: quote.total_aed })}</span>
            </div>
            <span className="text-[#575c64] text-[12px]">{t("perPiece", { amount: quote.per_piece_aed })}</span>
            {showCountdown && state.clock && (
              // Keyed on clock.now: a fresh Configuration (new pick, or the
              // countdown expiring below) remounts this with a clean countdown
              // rather than syncing a ticking value in from a changing prop.
              <Countdown key={state.clock.now} clock={state.clock} locale={locale} onExpire={onExpire} commerceEnabled />
            )}
          </>
        ) : (
          <span className="text-[#bb0027] text-[13px] font-semibold">{t("notAvailable")}</span>
        )}
      </div>
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#5d3f3e] text-[12px]">{label}</span>
      <span className="text-[#151c27] text-[12px] font-semibold">{value}</span>
    </div>
  );
}
