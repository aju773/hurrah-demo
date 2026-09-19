"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Countdown from "./Countdown";
import TurnaroundCards from "./TurnaroundCards";
import ConfigurationSummary from "./ConfigurationSummary";
import LoadFailure from "./LoadFailure";
import useDraftOrder, { clearPersistedDraft } from "@/lib/useDraftOrder";
import DesignHelpDrawer from "./DesignHelpDrawer";
import ArtworkSlots from "./ArtworkSlots";
import ArtworkTemplatesPanel from "./ArtworkTemplatesPanel";
import FirstVisitHint, { ShowHintsLink } from "./FirstVisitHint";
import ReopenPagePicker from "./ReopenPagePicker";
import { pickerTargetFor } from "@/lib/pagePicker";
import { reopenedActions, toBackPayload, toFrontPayload } from "@/lib/reopenPicker";
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
  const [reopenTarget, setReopenTarget] = useState(null); // the Page picker reopened from Step 1 or 2
  const mountedLocale = useRef(locale);
  const draft = useDraftOrder({
    defaults: initialConfiguration?.selection ?? initialCatalogue?.defaults ?? {},
    locale,
    initialConfiguration,
  });
  const {
    state,
    rehydrating,
    syncFailed,
    retrySync,
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
    editFromApprove,
    clearFocus,
    returnToApprove,
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

  // Moving to another step replaces the whole page content, which would leave keyboard
  // focus on a control that is gone: park it at the top of the main content instead.
  const priorStep = useRef(state.step);
  useEffect(() => {
    if (rehydrating || priorStep.current === state.step) return;
    priorStep.current = state.step;
    document.getElementById("main")?.focus({ preventScroll: true });
    window.scrollTo?.({ top: 0 });
  }, [rehydrating, state.step]);

  // Step 3's "Edit options" / "Change file" land here with a focus target:
  // put the cursor on the option area or the Front/Back slot, then forget it.
  useEffect(() => {
    if (rehydrating || state.step !== 0 || !state.focus) return;
    const el = document.getElementById(state.focus === "options" ? "options-panel" : `artwork-slot-${state.focus}`);
    el?.scrollIntoView?.({ block: "center" });
    el?.focus({ preventScroll: true });
    clearFocus();
  }, [rehydrating, state.step, state.focus, clearFocus]);

  const quote = state.quote;
  const commerceEnabled = state.commerceEnabled;
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

  const syncBanner = syncFailed && <LoadFailure message={t("syncError")} retryLabel={t("retry")} onRetry={retrySync} />;

  // "Choose pages" (Step 1 and Step 2): the same picker, on the file already stored.
  const canChoosePages = { front: Boolean(pickerTargetFor("front", state.slots)), back: Boolean(pickerTargetFor("back", state.slots)) };
  function openChoosePages(which) {
    const target = pickerTargetFor(which, state.slots);
    if (target) setReopenTarget(target);
  }
  function handlePagesReassigned(result) {
    for (const action of reopenedActions(result, state.slots)) {
      if (action.type === "UPLOAD_FRONT") uploadFront(action.artwork);
      else if (action.type === "UPLOAD_BACK") uploadBack(action.artwork);
      else removeArtwork(action.slot);
    }
    setReopenTarget(null);
    setArtworkResetKey((k) => k + 1); // Step 1's slots show the new Artwork
  }
  const reopenPicker = reopenTarget && (
    <ReopenPagePicker
      target={reopenTarget}
      slots={state.slots}
      orderedSize={selection.size ?? null}
      onAssigned={handlePagesReassigned}
      onCancel={() => setReopenTarget(null)}
    />
  );

  function handleClockExpire() {
    refresh();
    clearTicks();
    resetIdempotencyKey();
  }

  // After "Edit options" / "Change file" the customer goes straight back to
  // Step 3; the Order is different now, so it gets a fresh idempotency key too
  // (returnToApprove already clears the ticks).
  function handleContinue() {
    if (!state.returnToApprove) {
      goToStep(1);
      return;
    }
    returnToApprove();
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
          canChoosePages={canChoosePages}
          onChoosePages={openChoosePages}
        />
        {reopenPicker}
        <div className="flex justify-end">
          <ShowHintsLink />
        </div>
      </div>
    );
  }

  if (state.step === 2) {
    return (
      <div className="flex flex-col gap-[20px] w-full" dir={locale === "ar" ? "rtl" : "ltr"}>
        {syncBanner}
        <ApproveAndConfirmStep
          catalogue={catalogue}
          selection={selection}
          quote={quote}
          commerceEnabled={commerceEnabled}
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
          onEdit={editFromApprove}
          onSubmitted={handleOrderSubmitted}
        />
        <div className="flex justify-end">
          <ShowHintsLink />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[20px] w-full" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between gap-[12px] bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] p-[16px]">
        <div className="flex flex-col gap-[2px]">
          <span className="text-[#151c27] text-[14px] font-semibold">{t("noArtworkHeading")}</span>
          <span className="text-[#575c64] text-[12px]">{t(commerceEnabled ? "noArtworkBodyPriced" : "noArtworkBody")}</span>
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

      {syncBanner}

      {state.notices?.length > 0 && (
        <div role="status" className="bg-[#fff8e1] border border-[#ffc72c] rounded-[8px] p-[12px] text-[#6f5400] text-[13px]">
          {state.notices.map((notice, i) => (
            <div key={i}>{notice.reason}</div>
          ))}
        </div>
      )}

      <ArtworkSlots
        key={artworkResetKey}
        productId={catalogue.product_id}
        orderedSize={selection.size ?? null}
        initialFrontId={state.slots.front?.id}
        initialBackId={state.slots.back?.id}
        sameAsBack={state.slots.sameBack}
        onSameAsBackChange={(checked) => {
          if (checked !== state.slots.sameBack) toggleSameBack();
        }}
        onFrontResult={(front, back) => uploadFront(toFrontPayload(front, back))}
        onBackResult={(back) => uploadBack(toBackPayload(back))}
        onChoosePages={openChoosePages}
        onFrontRemoved={() => removeArtwork("front")}
        onBackRemoved={() => removeArtwork("back")}
      />

      <ArtworkTemplatesPanel />

      {reopenPicker}

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
        commerceEnabled={commerceEnabled}
      />

      <div className="grid grid-cols-12 gap-[20px] w-full items-start">
        {/* Options panel */}
        <div id="options-panel" tabIndex={-1} className="col-span-12 lg:col-span-7 min-w-0 flex flex-col gap-[16px]">
          <FirstVisitHint step="options" />
          {catalogue.options.map((option) => (
            <div key={option.code} className="bg-[#f0f3ff] rounded-[12px] p-[12px] flex flex-col gap-[8px]">
              <span className="text-[#5d3f3e] text-[10px] font-bold tracking-[0.5px] uppercase">{option.name}</span>
              {!commerceEnabled && option.code === "turnaround" ? (
                <TurnaroundCards
                  option={option}
                  selected={selection.turnaround}
                  blocked={blocked.turnaround}
                  turnarounds={state.turnarounds}
                  clock={state.clock}
                  locale={locale}
                  onPick={(code) => pick("turnaround", code)}
                  onExpire={refresh}
                />
              ) : (
              <div className="flex flex-wrap gap-[8px]" {...(option.code === "quantity" ? { role: "radiogroup", "aria-label": option.name } : { role: "group", "aria-label": option.name })}>
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
                      onClick={() => pick(option.code, value.code)}
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
            </div>
          ))}
        </div>

        {/* Summary panel */}
        <div className="col-span-12 lg:col-span-5 min-w-0">
          {commerceEnabled ? (
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
                  {state.clock && (
                    // Keyed on clock.now: a fresh Configuration (new pick, or the
                    // countdown expiring below) remounts this with a clean countdown
                    // rather than syncing a ticking value in from a changing prop.
                    <Countdown key={state.clock.now} clock={state.clock} locale={locale} onExpire={refresh} commerceEnabled />
                  )}
                </>
              ) : (
                <span className="text-[#bb0027] text-[13px] font-semibold">{t("notAvailable")}</span>
              )}
            </div>
          </div>
          ) : (
            <ConfigurationSummary
              catalogue={catalogue}
              selection={selection}
              available={state.available}
              turnarounds={state.turnarounds}
              locale={locale}
            />
          )}
        </div>
      </div>

      {/* Price grid: Quantity x Turnaround (only with the Commerce switch on) */}
      {commerceEnabled && <div className="flex flex-col gap-[8px] w-full">
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
      </div>}

      <div className="flex items-center justify-end">
        <button
          type="button"
          disabled={!draft.canContinue}
          title={!state.slots.front ? t("continueNeedsArtwork") : dialog ? t("continueHasOpenDialog") : ""}
          onClick={handleContinue}
          className="h-[44px] px-[24px] rounded-[8px] text-[14px] font-semibold bg-[#e51937] text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state.returnToApprove ? t("returnToApproval") : t("continue")}
        </button>
      </div>

      <div className="flex justify-end">
        <ShowHintsLink />
      </div>

      <DesignHelpDrawer
        open={designHelpOpen}
        onClose={() => setDesignHelpOpen(false)}
        product={{ id: catalogue.product_id }}
        configurationLine={configurationLine}
        configurationSnapshot={selection}
        commerceEnabled={commerceEnabled}
      />
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
