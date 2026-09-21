"use client";

import { useTranslations } from "next-intl";
import SummaryPanel from "./SummaryPanel";
import { Notices } from "./OptionsPage";
import ArtworkSlots from "./ArtworkSlots";
import ArtworkTemplatesPanel from "./ArtworkTemplatesPanel";
import DesignHelpDrawer from "./DesignHelpDrawer";
import SyncDialog from "./SyncDialog";
import { ShowHintsLink } from "./FirstVisitHint";
import { toBackPayload, toFrontPayload } from "@/lib/reopenPicker";

/** The Artwork page: upload slots, Artwork templates, Design request, Page picker
 * and Sync dialog, with the live Summary beside them and "Edit options" back to
 * the Options page. */
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
  reopenPicker,
  actions,
}) {
  const t = useTranslations("FlyersConfigurator");
  const { commerceEnabled } = state;

  return (
    <div className="flex flex-col gap-[20px] w-full" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between gap-[12px] bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] p-[16px]">
        <div className="flex flex-col gap-[2px]">
          <span className="text-[#151c27] text-[14px] font-semibold">{t("noArtworkHeading")}</span>
          <span className="text-[#575c64] text-[12px]">{t(commerceEnabled ? "noArtworkBodyPriced" : "noArtworkBody")}</span>
        </div>
        <button
          type="button"
          onClick={() => actions.setDesignHelpOpen(true)}
          className="shrink-0 h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold bg-[#e51937] text-white"
        >
          {t("needDesign")}
        </button>
      </div>

      {syncBanner}

      {state.notices?.length > 0 && <Notices notices={state.notices} />}

      <div className="grid grid-cols-12 gap-[20px] w-full items-start">
        <div className="col-span-12 lg:col-span-7 min-w-0 flex flex-col gap-[20px]">
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

          <ArtworkTemplatesPanel />

          {reopenPicker}
        </div>

        {/* Summary panel */}
        <div className="col-span-12 lg:col-span-5 min-w-0 flex flex-col gap-[12px] lg:sticky lg:top-[16px]">
          <SummaryPanel catalogue={catalogue} selection={selection} state={state} locale={locale} onExpire={actions.refresh} />
          <button
            type="button"
            onClick={actions.editOptions}
            className="self-start h-[40px] px-[16px] rounded-[8px] text-[13px] font-semibold bg-white text-[#151c27] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
          >
            {t("editOptions")}
          </button>
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

      <div className="flex items-center justify-end">
        <button
          type="button"
          disabled={!canContinue}
          title={!state.slots.front ? t("continueNeedsArtwork") : dialog ? t("continueHasOpenDialog") : ""}
          onClick={actions.onContinue}
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
        onClose={() => actions.setDesignHelpOpen(false)}
        product={{ id: catalogue.product_id }}
        configurationLine={configurationLine}
        configurationSnapshot={selection}
        commerceEnabled={commerceEnabled}
      />
    </div>
  );
}
