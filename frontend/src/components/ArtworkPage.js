"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import SummaryPanel from "./SummaryPanel";
import { Notices } from "./OptionsPage";
import ArtworkSlots from "./ArtworkSlots";
import ArtworkChecks from "./ArtworkChecks";
import ArtworkTemplatesPanel from "./ArtworkTemplatesPanel";
import DesignHelpDrawer from "./DesignHelpDrawer";
import CutoffLine from "./CutoffLine";
import SyncDialog from "./SyncDialog";
import JourneyActionBar from "./JourneyActionBar";
import FirstVisitHint from "./FirstVisitHint";
import { rotatedSides, swappedSides } from "@/lib/draftOrder";
import { toBackPayload, toFrontPayload } from "@/lib/reopenPicker";

/** The Artwork page: three Single-screen zones (CONTEXT.md, ticket 04). Front
 * and Back slots sit side by side (left column), with the Findings ArtworkChecks
 * draws below them, in a panel that scrolls inside itself; a large Proof preview
 * sits on the other side (right column), with the compact Summary and the
 * Cut-off under it. Artwork templates and the Design request open from the
 * buttons in the banner at the top, always reachable so they are easy to find
 * before any Artwork is uploaded. Continue and Edit options live in the pinned
 * action bar from ticket 02, with the reason Continue is disabled beside it. */
export default function ArtworkPage({
  catalogue,
  selection,
  state,
  locale,
  dialog,
  canContinue,
  artworkResetKey,
  designHelpOpen,
  configurationLine,
  syncBanner,
  clockNotice,
  reopenPicker,
  actions,
}) {
  const t = useTranslations("FlyersConfigurator");
  const { commerceEnabled } = state;
  const [previewBlocked, setPreviewBlocked] = useState(false); // ArtworkChecks: an Error Finding remains
  const [summaryOpen, setSummaryOpen] = useState(false); // the Summary bar at narrow widths
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const front = state.slots.front;
  const turnaroundValues = catalogue.options.find((o) => o.code === "turnaround")?.values ?? [];
  const turnaroundLabel = turnaroundValues.find((v) => v.code === selection.turnaround)?.label ?? selection.turnaround;
  const swapped = swappedSides(state); // Front and Back trade places; the cells below name the sides as printed
  const continueReason = !front ? "continueNeedsArtwork" : dialog ? "continueHasOpenDialog" : !canContinue || previewBlocked ? "continueHasError" : null;

  return (
    <div className="flex flex-col gap-[16px] w-full lg:flex-1 lg:min-h-0" dir={locale === "ar" ? "rtl" : "ltr"}>
      <FirstVisitHint step="artwork" />

      {syncBanner}
      {clockNotice && <Notices notices={[{ reason: t("clockMovedNotice") }]} />}
      {state.notices?.length > 0 && <Notices notices={state.notices} />}
      {state.backDropped && <Notices notices={[{ reason: t("backDroppedNotice") }]} />}

      <div className="shrink-0 flex items-center justify-between gap-[12px] bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] p-[16px]">
        <div className="flex flex-col gap-[2px] min-w-0">
          <span className="text-[#151c27] text-[14px] font-semibold">{t("noArtworkHeading")}</span>
          <span className="text-[#575c64] text-[12px]">{t(commerceEnabled ? "noArtworkBodyPriced" : "noArtworkBody")}</span>
        </div>
        <div className="flex items-center gap-[8px] shrink-0">
          <button
            type="button"
            onClick={() => setTemplatesOpen(true)}
            className="tap h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold bg-white text-[#151c27] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
          >
            {t("artworkTemplates")}
          </button>
          <button
            type="button"
            onClick={() => actions.setDesignHelpOpen(true)}
            className="tap shrink-0 h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold bg-[#e51937] text-white"
          >
            {t("needDesign")}
          </button>
        </div>
      </div>

      {/* Grid contract with ArtworkChecks (findings panel + proof preview): left
         column (slots, findings) is cols 1-5, right column (proof, summary) is
         cols 6-12; row 1 holds the slots and the proof, row 2 the Findings panel
         (filling whatever height is left, scrolling inside itself) and the Summary. */}
      <div className="grid grid-cols-12 gap-x-[20px] gap-y-[16px] w-full lg:flex-1 lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:items-start">
        <div className="col-span-12 lg:col-start-1 lg:col-span-5 lg:row-start-1 min-w-0">
          <ArtworkSlots
            key={artworkResetKey}
            productId={catalogue.product_id}
            orderedSize={selection.size ?? null}
            initialFrontId={state.slots.front?.id}
            initialBackId={state.slots.back?.id}
            sameAsBack={state.slots.sameBack}
            onSameAsBackChange={(checked) => {
              if (checked !== state.slots.sameBack) actions.toggleSameBack();
            }}
            onFrontResult={(front, back) => actions.uploadFront(toFrontPayload(front, back))}
            onBackResult={(back) => actions.uploadBack(toBackPayload(back))}
            onChoosePages={actions.openChoosePages}
            onFrontRemoved={() => actions.removeArtwork("front")}
            onBackRemoved={() => actions.removeArtwork("back")}
          />
        </div>

        {front?.id && (
          <ArtworkChecks
            key={`${front.id}:${state.slots.back?.id ?? ""}:${state.slots.sameBack}`}
            frontId={front.id}
            backId={state.slots.back?.id}
            sameAsFront={state.slots.sameBack}
            sizeCode={selection.size}
            sizeChoice={state.sizeChoice}
            rotate={rotatedSides(state)}
            onRotate={actions.rotate}
            swap={swapped}
            onSwap={actions.swap}
            canChoosePages={swapped ? { front: actions.canChoosePages?.back, back: actions.canChoosePages?.front } : actions.canChoosePages}
            onChoosePages={(side) => actions.openChoosePages(swapped ? (side === "front" ? "back" : "front") : side)}
            onBlockedChange={setPreviewBlocked}
          />
        )}

        {/* Summary and Cut-off: compact, under the Proof preview. On a phone this
           stays first (order-first), above the upload slots, as it always has. */}
        <div className="order-first lg:order-none col-span-12 lg:col-start-6 lg:col-span-7 lg:row-start-2 min-w-0 flex flex-col gap-[12px]">
          <button
            type="button"
            aria-expanded={summaryOpen}
            aria-controls="summary-panel"
            onClick={() => setSummaryOpen((open) => !open)}
            className="tap lg:hidden flex items-center justify-between gap-[12px] min-h-[44px] px-[16px] py-[8px] rounded-[12px] bg-[#2a313d] text-[#ebf1ff] text-start"
          >
            <span className="flex flex-col min-w-0">
              <span className="text-[14px] font-semibold">
                {t("summary")}
                {commerceEnabled && state.quote && <> · {t("aed", { amount: state.quote.total_aed })}</>}
              </span>
              <span className="text-[12px] truncate">{configurationLine}</span>
            </span>
            <span className="shrink-0 text-[12px] font-semibold">{t(summaryOpen ? "summaryHide" : "summaryShow")}</span>
          </button>
          <div id="summary-panel" className={`${summaryOpen ? "block" : "hidden"} lg:block`}>
            <SummaryPanel catalogue={catalogue} selection={selection} state={state} locale={locale} showCountdown={false} />
          </div>
          {state.clock && (
            // Keyed on clock.now like the countdowns elsewhere: a fresh clock remounts it.
            <CutoffLine key={state.clock.now} clock={state.clock} turnaroundLabel={turnaroundLabel} onExpire={actions.onClockExpire} />
          )}
        </div>
      </div>

      <SyncDialog
        key={dialog?.key ?? "none"}
        dialog={dialog}
        preview={dialog ? state.previews[dialog.key] : null}
        onPreviewSwitch={actions.previewSwitch}
        onResolve={actions.resolveDialog}
        sizeValues={catalogue.options.find((o) => o.code === "size")?.values ?? []}
        productBleedMm={catalogue.bleed_mm}
        productSafeMm={catalogue.safe_mm}
        fileTrimMm={state.slots.front?.mm ? [state.slots.front.mm.width, state.slots.front.mm.height] : null}
        fileBleedMm={state.slots.front?.bleedMm ?? 0}
        fileImageUrl={state.slots.front?.imageUrl ?? null}
        commerceEnabled={commerceEnabled}
      />

      {reopenPicker}

      <JourneyActionBar
        secondary={
          <button
            type="button"
            onClick={actions.editOptions}
            className="tap h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold bg-white text-[#151c27] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
          >
            {t("editOptions")}
          </button>
        }
        primary={
          <>
            {continueReason && (
              <span id="continue-disabled-reason" className="text-[#b0001d] text-[13px] font-semibold">
                {t(continueReason)}
              </span>
            )}
            <button
              type="button"
              disabled={Boolean(continueReason)}
              aria-describedby={continueReason ? "continue-disabled-reason" : undefined}
              onClick={actions.onContinue}
              className="tap h-[44px] px-[24px] rounded-[8px] text-[14px] font-semibold bg-[#e51937] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {state.returnToApprove ? t("returnToApproval") : t("continue")}
            </button>
          </>
        }
      />

      <ArtworkTemplatesPanel open={templatesOpen} onClose={() => setTemplatesOpen(false)} />

      <DesignHelpDrawer
        open={designHelpOpen}
        onClose={() => actions.setDesignHelpOpen(false)}
        product={{ id: catalogue.product_id }}
        configurationLine={configurationLine}
        configurationSnapshot={selection}
        commerceEnabled={commerceEnabled}
      />
    </div>
  );
}
