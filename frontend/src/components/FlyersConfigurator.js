"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import LoadFailure from "./LoadFailure";
import useDraftOrder, { clearPersistedDraft } from "@/lib/useDraftOrder";
import { ShowHintsLink } from "./FirstVisitHint";
import ReopenPagePicker from "./ReopenPagePicker";
import { pickerTargetFor } from "@/lib/pagePicker";
import { reopenedActions } from "@/lib/reopenPicker";
import { guardPage, pageForPath, PAGE_APPROVE, PAGE_ARTWORK, PAGE_CHECK, PAGE_OPTIONS, PAGE_PATHS } from "@/lib/draftOrder";
import OptionsPage from "./OptionsPage";
import ArtworkPage from "./ArtworkPage";
import CheckAndPreviewStep from "./CheckAndPreviewStep";
import ApproveAndConfirmStep from "./ApproveAndConfirmStep";

// One draft, four pages, each at its own address (lib/draftOrder PAGE_PATHS). This
// component lives in the flyers layout, so it stays mounted while the customer moves
// between pages and the draft in memory is never lost on the way.
export default function FlyersConfigurator({ initialCatalogue, initialConfiguration }) {
  const locale = useLocale();
  const t = useTranslations("FlyersConfigurator");
  const router = useRouter();
  const pathname = usePathname();
  const [catalogue] = useState(initialCatalogue);
  const [designHelpOpen, setDesignHelpOpen] = useState(false);
  const [artworkResetKey, setArtworkResetKey] = useState(0);
  const [reopenTarget, setReopenTarget] = useState(null); // the Page picker reopened on the Artwork or Check page
  const mountedLocale = useRef(locale);
  const [openedPage] = useState(() => pageForPath(pathname)); // the address the customer arrived at
  const draft = useDraftOrder({
    defaults: initialConfiguration?.selection ?? initialCatalogue?.defaults ?? {},
    locale,
    initialConfiguration,
    initialPage: openedPage,
  });
  const {
    state,
    rehydrating,
    syncFailed,
    retrySync,
    dialogs,
    pick,
    uploadFront,
    uploadBack,
    removeArtwork,
    toggleSameBack,
    previewSwitch,
    resolveDialog,
    refresh,
    goToPage,
    isRestorable,
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

  // The address changed by itself (browser Back or Forward, a typed or bookmarked
  // address): the draft follows it, unless the guard sends the customer elsewhere,
  // in which case the address is corrected instead. Moves the customer makes with
  // the page's own buttons update both at once (`go` below), so they never get here.
  const latest = useRef({ state, isRestorable });
  useEffect(() => {
    latest.current = { state, isRestorable };
  });
  useEffect(() => {
    if (rehydrating) return;
    const requested = pageForPath(pathname);
    if (!requested) return;
    const { state: current, isRestorable: restorable } = latest.current;
    const target = guardPage(current, requested, { restorable: restorable() });
    if (target !== requested) router.replace(PAGE_PATHS[target]);
    if (target !== current.page) goToPage(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, rehydrating]);

  function go(page) {
    goToPage(page);
    router.push(PAGE_PATHS[page]);
  }

  const priorFrontId = useRef(state.slots.front?.id ?? null);
  useEffect(() => {
    // A dialog's "Upload a different file" clears the draft's slots; reset
    // the (uncontrolled) upload widgets to match rather than leaving a stale
    // "Detected" card on screen for a file the draft no longer knows about.
    if (priorFrontId.current && !state.slots.front) setArtworkResetKey((k) => k + 1);
    priorFrontId.current = state.slots.front?.id ?? null;
  }, [state.slots.front]);

  // Moving to another page replaces the whole page content, which would leave keyboard
  // focus on a control that is gone: park it at the top of the main content instead.
  const priorPage = useRef(state.page);
  useEffect(() => {
    if (rehydrating || priorPage.current === state.page) return;
    priorPage.current = state.page;
    document.getElementById("main")?.focus({ preventScroll: true });
    window.scrollTo?.({ top: 0 });
  }, [rehydrating, state.page]);

  // The Approve page's "Edit options" / "Change file" land here with a focus target:
  // put the cursor on the option area or the Front/Back slot, then forget it.
  useEffect(() => {
    if (rehydrating || !state.focus) return;
    const onOptions = state.focus === "options";
    if (state.page !== (onOptions ? PAGE_OPTIONS : PAGE_ARTWORK)) return;
    const el = document.getElementById(onOptions ? "options-panel" : `artwork-slot-${state.focus}`);
    el?.scrollIntoView?.({ block: "center" });
    el?.focus({ preventScroll: true });
    clearFocus();
  }, [rehydrating, state.page, state.focus, clearFocus]);

  const commerceEnabled = state.commerceEnabled;
  const quantityOption = catalogue?.options.find((o) => o.code === "quantity");
  const turnaroundOption = catalogue?.options.find((o) => o.code === "turnaround");

  if (!catalogue) {
    return <div className="p-[24px] text-[#575c64] text-[14px]">{t("loading")}</div>;
  }

  // A deep link carrying a persisted draft (sessionStorage/URL) needs its
  // async rehydrate (useDraftOrder) to finish — including page, ticks and
  // idempotency key — before this renders off `state`; otherwise a
  // draft parked on a later page flashes the Options page's fresh (unticked) defaults first.
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

  // "Choose pages" (Artwork and Check pages): the same picker, on the file already stored.
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
    setArtworkResetKey((k) => k + 1); // the Artwork page's slots show the new Artwork
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
  // Approve; the Order is different now, so it gets a fresh idempotency key too
  // (returnToApprove already clears the ticks).
  function handleContinue() {
    if (!state.returnToApprove) {
      go(PAGE_CHECK);
      return;
    }
    returnToApprove();
    resetIdempotencyKey();
    router.push(PAGE_PATHS[PAGE_APPROVE]);
  }

  // Approve's "Edit options" / "Change file": to the page that holds it.
  function handleEditFromApprove(focus) {
    editFromApprove(focus);
    router.push(PAGE_PATHS[focus === "options" ? PAGE_OPTIONS : PAGE_ARTWORK]);
  }

  function handleOrderSubmitted(order) {
    clearPersistedDraft();
    router.push(`/order/${order.token}`);
  }

  if (state.page === PAGE_CHECK) {
    return (
      <div className="flex flex-col gap-[20px] w-full" dir={locale === "ar" ? "rtl" : "ltr"}>
        <CheckAndPreviewStep
          frontId={state.slots.front?.id}
          backId={state.slots.back?.id}
          sameAsFront={state.slots.sameBack}
          sizeCode={selection.size}
          sizeChoice={state.sizeChoice}
          onBack={() => go(PAGE_ARTWORK)}
          onNext={() => go(PAGE_APPROVE)}
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

  if (state.page === PAGE_APPROVE) {
    return (
      <div className="flex flex-col gap-[20px] w-full" dir={locale === "ar" ? "rtl" : "ltr"}>
        {syncBanner}
        <ApproveAndConfirmStep
          catalogue={catalogue}
          selection={selection}
          quote={state.quote}
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
          onBack={() => go(PAGE_CHECK)}
          onEdit={handleEditFromApprove}
          onSubmitted={handleOrderSubmitted}
        />
        <div className="flex justify-end">
          <ShowHintsLink />
        </div>
      </div>
    );
  }

  if (state.page === PAGE_ARTWORK) {
    return (
      <ArtworkPage
        catalogue={catalogue}
        selection={selection}
        state={state}
        locale={locale}
        dialog={dialog}
        canContinue={draft.canContinue}
        artworkResetKey={artworkResetKey}
        designHelpOpen={designHelpOpen}
        configurationLine={configurationLine}
        syncBanner={syncBanner}
        reopenPicker={reopenPicker}
        actions={{
          setDesignHelpOpen,
          toggleSameBack,
          uploadFront,
          uploadBack,
          removeArtwork,
          openChoosePages,
          previewSwitch,
          resolveDialog,
          refresh,
          editOptions: () => go(PAGE_OPTIONS),
          onContinue: handleContinue,
        }}
      />
    );
  }

  return (
    <OptionsPage
      catalogue={catalogue}
      selection={selection}
      state={state}
      locale={locale}
      syncBanner={syncBanner}
      onPick={pick}
      onRefresh={refresh}
      onStart={() => go(PAGE_ARTWORK)}
    />
  );
}
