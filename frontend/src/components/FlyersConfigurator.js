"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { deliveryLine } from "@/lib/clock";
import useDraftOrder, { clearPersistedDraft } from "@/lib/useDraftOrder";
import DesignHelpDrawer from "./DesignHelpDrawer";
import ArtworkSlots from "./ArtworkSlots";
import SyncDialog from "./SyncDialog";
import CheckAndPreviewStep from "./CheckAndPreviewStep";
import ApproveAndConfirmStep from "./ApproveAndConfirmStep";

export default function FlyersConfigurator({ initialCatalogue, initialConfiguration }) {
  const locale = useLocale();
  const t = useTranslations("FlyersConfigurator");
  const router = useRouter();
  const [catalogue] = useState(initialCatalogue);
  const [designHelpOpen, setDesignHelpOpen] = useState(false);
  const [artworkResetKey, setArtworkResetKey] = useState(0);
  const mountedLocale = useRef(locale);
  const draft = useDraftOrder({
    defaults: initialConfiguration?.selection ?? initialCatalogue?.defaults ?? {},
    locale,
    initialConfiguration,
  });
  const {
    state,
    rehydrating,
    dialogs,
    pick: draftPick,
    uploadFront,
    uploadBack,
    removeArtwork,
    toggleSameBack,
    previewSwitch,
    resolveDialog,
    refresh,
    goToStep,
    setTick,
    clearTicks,
    resetIdempotencyKey,
  } = draft;
  const selection = state.config;

  // Re-fetch server text (labels, reasons) when the locale changes; the initial
  // render already has its data from the server-fetched props.
  useEffect(() => {
    if (mountedLocale.current === locale) return;
    mountedLocale.current = locale;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  function pick(optionCode, valueCode) {
    draftPick(optionCode, valueCode);
  }

  const priorFrontId = useRef(state.slots.front?.id ?? null);
  useEffect(() => {
    // A dialog's "Upload a different file" clears the draft's slots; reset
    // the (uncontrolled) upload widgets to match rather than leaving a stale
    // "Detected" card on screen for a file the draft no longer knows about.
    if (priorFrontId.current && !state.slots.front) setArtworkResetKey((k) => k + 1);
    priorFrontId.current = state.slots.front?.id ?? null;
  }, [state.slots.front]);

  const quote = state.quote;
  const blocked = state.blocked ?? {};
  const quantityOption = catalogue?.options.find((o) => o.code === "quantity");
  const turnaroundOption = catalogue?.options.find((o) => o.code === "turnaround");

  if (!catalogue) {
    return <div className="p-[24px] text-[#575c64] text-[14px]">{t("loading")}</div>;
  }

  // A deep link carrying a persisted draft (sessionStorage/URL) needs its
  // async rehydrate (useDraftOrder) to finish — including step, ticks and
  // idempotency key — before this renders off `state`; otherwise a
  // draft parked on step 2/3 flashes step 0's fresh (unticked) defaults first.
  if (rehydrating) {
    return <div className="p-[24px] text-[#575c64] text-[14px]">{t("loading")}</div>;
  }

  // Defensive: a catalogue that has dropped or renamed either option would
  // otherwise crash the page below on `turnaroundOption.values.map(...)` etc.
  if (!quantityOption || !turnaroundOption) {
    return <div className="p-[24px] text-[#bb0027] text-[14px]">{t("catalogueError")}</div>;
  }

  const configurationLine = catalogue.options
    .map((option) => option.values.find((value) => value.code === selection[option.code])?.label)
    .filter(Boolean)
    .join(" · ");

  const dialog = dialogs[0] ?? null;

  function handleClockExpire() {
    refresh();
    clearTicks();
    resetIdempotencyKey();
  }

  function handleOrderSubmitted(order) {
    clearPersistedDraft();
    router.push(`/order/${order.token}`);
  }

  if (state.step === 1) {
    return (
      <div className="flex flex-col gap-[20px] w-full" dir={locale === "ar" ? "rtl" : "ltr"}>
        <CheckAndPreviewStep
          frontId={state.slots.front?.id}
          backId={state.slots.back?.id}
          sameAsFront={state.slots.sameBack}
          sizeCode={selection.size}
          sizeChoice={state.sizeChoice}
          onBack={() => goToStep(0)}
          onNext={() => goToStep(2)}
        />
      </div>
    );
  }

  if (state.step === 2) {
    return (
      <div className="flex flex-col gap-[20px] w-full" dir={locale === "ar" ? "rtl" : "ltr"}>
        <ApproveAndConfirmStep
          catalogue={catalogue}
          selection={selection}
          quote={quote}
          clock={state.clock}
          frontId={state.slots.front?.id}
          backId={state.slots.back?.id}
          sameAsFront={state.slots.sameBack}
          sizeCode={selection.size}
          sizeChoice={state.sizeChoice}
          ticks={state.ticks}
          onSetTick={setTick}
          onClockExpire={handleClockExpire}
          browsingLanguage={locale}
          locale={locale}
          idempotencyKey={state.idempotencyKey}
          onBack={() => goToStep(1)}
          onSubmitted={handleOrderSubmitted}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[20px] w-full" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between gap-[12px] bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] p-[16px]">
        <div className="flex flex-col gap-[2px]">
          <span className="text-[#151c27] text-[14px] font-semibold">{t("noArtworkHeading")}</span>
          <span className="text-[#575c64] text-[12px]">{t("noArtworkBody")}</span>
        </div>
        <button
          type="button"
          onClick={() => setDesignHelpOpen(true)}
          className="shrink-0 h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold bg-[#e51937] text-white"
        >
          {t("needDesign")}
        </button>
      </div>

      <div className="flex items-center gap-[10px] bg-[#f0f3ff] rounded-[12px] p-[12px]">
        <span className="text-[#5d3f3e] text-[12px] font-semibold">{t("hotlineLabel")}</span>
        <button type="button" onClick={() => setDesignHelpOpen(true)} className="text-[#bb0027] text-[12px] font-bold underline">
          {t("chatWithUs")}
        </button>
      </div>

      {state.notices?.length > 0 && (
        <div className="bg-[#fff8e1] border border-[#ffc72c] rounded-[8px] p-[12px] text-[#6f5400] text-[13px]">
          {state.notices.map((notice, i) => (
            <div key={i}>{notice.reason}</div>
          ))}
        </div>
      )}

      <ArtworkSlots
        key={artworkResetKey}
        productId={catalogue.product_id}
        sameAsBack={state.slots.sameBack}
        onSameAsBackChange={(checked) => {
          if (checked !== state.slots.sameBack) toggleSameBack();
        }}
        onFrontResult={(front, back) => {
          uploadFront({
            id: front.id,
            matchedSizeCode: front.matched_size_code ?? null,
            mm: { width: front.trim_width_mm, height: front.trim_height_mm },
            bleedMm: front.bleed_mm ?? null,
            imageUrl: front.page_image ?? null,
            pages: back ? 2 : 1,
            backId: back?.id,
            backImageUrl: back?.page_image ?? null,
            hasError: !front.is_valid,
            backHasError: back ? !back.is_valid : false,
          });
        }}
        onBackResult={(back) =>
          uploadBack({
            id: back.id,
            matchedSizeCode: back.matched_size_code ?? null,
            mm: { width: back.trim_width_mm, height: back.trim_height_mm },
            bleedMm: back.bleed_mm ?? null,
            imageUrl: back.page_image ?? null,
            hasError: !back.is_valid,
          })
        }
        onFrontRemoved={() => removeArtwork("front")}
        onBackRemoved={() => removeArtwork("back")}
      />

      <SyncDialog
        key={dialog?.key ?? "none"}
        dialog={dialog}
        preview={dialog ? state.previews[dialog.key] : null}
        onPreviewSwitch={previewSwitch}
        onResolve={resolveDialog}
        sizeValues={catalogue.options.find((o) => o.code === "size")?.values ?? []}
        productBleedMm={catalogue.bleed_mm}
        productSafeMm={catalogue.safe_mm}
        fileTrimMm={state.slots.front?.mm ? [state.slots.front.mm.width, state.slots.front.mm.height] : null}
        fileBleedMm={state.slots.front?.bleedMm ?? 0}
        fileImageUrl={state.slots.front?.imageUrl ?? null}
      />

      <div className="grid grid-cols-12 gap-[20px] w-full items-start">
        {/* Options panel */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-[16px]">
          {catalogue.options.map((option) => (
            <div key={option.code} className="bg-[#f0f3ff] rounded-[12px] p-[12px] flex flex-col gap-[8px]">
              <span className="text-[#5d3f3e] text-[10px] font-bold tracking-[0.5px] uppercase">{option.name}</span>
              <div className="flex flex-wrap gap-[8px]">
                {option.values.map((value) => {
                  const reason = blocked[option.code]?.[value.code];
                  const selected = selection[option.code] === value.code;
                  return (
                    <button
                      key={value.code}
                      type="button"
                      disabled={Boolean(reason)}
                      title={reason?.reason ?? ""}
                      onClick={() => pick(option.code, value.code)}
                      className={`h-[36px] px-[14px] rounded-[8px] text-[12px] font-semibold transition-colors ${
                        reason
                          ? "bg-[#e2e8f8] text-[#9aa1ad] cursor-not-allowed"
                          : selected
                          ? "bg-[#e51937] text-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
                          : "bg-white text-[#151c27] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
                      }`}
                    >
                      {value.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Summary panel */}
        <div className="col-span-12 lg:col-span-5 bg-white rounded-[16px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] overflow-clip">
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
                {state.clock && (
                  // Keyed on clock.now: a fresh Configuration (new pick, or the
                  // countdown expiring below) remounts this with a clean countdown
                  // rather than syncing a ticking value in from a changing prop.
                  <Countdown key={state.clock.now} clock={state.clock} locale={locale} onExpire={refresh} />
                )}
              </>
            ) : (
              <span className="text-[#bb0027] text-[13px] font-semibold">{t("notAvailable")}</span>
            )}
          </div>
        </div>
      </div>

      {/* Price grid: Quantity x Turnaround */}
      <div className="flex flex-col gap-[8px] w-full">
        <h2 className="text-[#151c27] text-[16px] font-bold">{t("priceGrid")}</h2>
        <div className="bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: "600px" }}>
            <thead>
              <tr className="bg-[#f0f3ff]">
                <th className="p-[10px] text-[#5d3f3e] text-[11px] font-bold uppercase">{t("quantity")}</th>
                {turnaroundOption.values.map((turnaround) => (
                  <th key={turnaround.code} className="p-[10px] text-[#5d3f3e] text-[11px] font-bold uppercase text-center">
                    {turnaround.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(state.priceGrid ?? []).map((row) => (
                <tr key={row.quantity} className="border-t border-[#f0f3ff]">
                  <td className="p-[10px] text-[#151c27] text-[13px] font-bold">
                    {quantityOption.values.find((v) => v.code === row.quantity)?.label}
                  </td>
                  {row.cells.map((cell) => {
                    const isSelected = selection.quantity === cell.quantity && selection.turnaround === cell.turnaround;
                    return (
                      <td key={cell.turnaround} className="p-[6px] text-center">
                        <button
                          type="button"
                          disabled={cell.blocked}
                          title={cell.blocked ? cell.reason : ""}
                          onClick={() => {
                            pick("quantity", cell.quantity);
                            pick("turnaround", cell.turnaround);
                          }}
                          className={`w-full rounded-[8px] px-[8px] py-[6px] ${
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
                              <span className={`text-[10px] ${isSelected ? "text-[#ffdad9]" : "text-[#575c64]"}`}>
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
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          disabled={!draft.canContinue}
          title={!state.slots.front ? t("continueNeedsArtwork") : dialog ? t("continueHasOpenDialog") : ""}
          onClick={() => goToStep(1)}
          className="h-[44px] px-[24px] rounded-[8px] text-[14px] font-semibold bg-[#e51937] text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("continue")}
        </button>
      </div>

      <DesignHelpDrawer
        open={designHelpOpen}
        onClose={() => setDesignHelpOpen(false)}
        product={{ id: catalogue.product_id }}
        configurationLine={configurationLine}
        configurationSnapshot={selection}
      />
    </div>
  );
}

const EXPIRED_RETRY_MS = 5000;

// Ticks the current Turnaround's Cut-off countdown down once a second and shows the
// delivery line beneath it; calls onExpire (a refetch) when it reaches zero, so a
// Same-day pick past its Cut-off (or a weekend) falls back and its notice shows
// without the customer touching anything. A successful refetch brings a new
// clock.now, which remounts this component (see its `key` at the call site) with a
// fresh countdown; if the refetch fails instead, we keep retrying on a delay rather
// than freezing on "0s" forever.
function Countdown({ clock, locale, onExpire }) {
  const [secondsLeft, setSecondsLeft] = useState(clock.seconds_to_cutoff);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (secondsLeft > 0) {
      const timer = setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
      return () => clearTimeout(timer);
    }
    onExpire();
    const retry = setTimeout(() => setRetryCount((c) => c + 1), EXPIRED_RETRY_MS);
    return () => clearTimeout(retry);
  }, [secondsLeft, retryCount, onExpire]);

  return <span className="text-[#575c64] text-[12px]">{deliveryLine(clock, secondsLeft, locale)}</span>;
}

function Line({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#5d3f3e] text-[12px]">{label}</span>
      <span className="text-[#151c27] text-[12px] font-semibold">{value}</span>
    </div>
  );
}
