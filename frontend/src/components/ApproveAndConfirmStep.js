"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { API_BASE_URL, FLYERS_SLUG } from "@/lib/api";
import Countdown from "./Countdown";
import { BLOCKING_CODES, canGoNext, combineFindings, warningShortName } from "@/lib/findings";
import { sizeChoiceWithInstructions } from "@/lib/draftOrder";
import { fetchPreview } from "@/lib/preview";
import ArtworkPreview from "./ArtworkPreview";
import { fetchWithTimeout } from "@/lib/network";
import FirstVisitHint from "./FirstVisitHint";
import LoadFailure from "./LoadFailure";
import JourneyActionBar from "./JourneyActionBar";

// A placed Order takes longer to answer than a page load (it re-checks the Artwork).
const SUBMIT_TIMEOUT_MS = 30000;

// +971 is prefilled: every customer is on a UAE mobile.
const EMPTY_DETAILS = { name: "", mobile: "+971", area: "", address_line: "", email: "", company: "", note: "" };

// A group needs the "I accept" tick if it's a Warning, or an Error that no
// longer blocks Submit (outside BLOCKING_CODES) — the tick is how the
// customer acknowledges that caution instead.
function needsWarningsTick(g) {
  return g.severity === "warning" || (g.severity === "error" && !BLOCKING_CODES.has(g.code));
}

function warningCodesOf(groups) {
  return [...new Set(groups.filter(needsWarningsTick).map((g) => g.code))].sort();
}

/**
 * Step 3, "Approve & confirm" (ticket 10): a read-only summary of the
 * Configuration and Proof, the guest contact form, the Cut-off
 * countdown, the approval ticks and a server-checked Submit. With the Commerce
 * switch on it also shows the Quote, the delivery address form and pay on
 * delivery. Configuration/Artwork changes and the countdown reaching zero clear
 * the ticks (spec stories 81-82) — the caller (FlyersConfigurator) owns that
 * shared draft state; this component just renders it and calls back.
 *
 * Single-screen (ticket 05): the Proof is the largest area and fills the
 * height of its column (left); the Configuration/delivery card, the
 * countdown and the acknowledgements sit beside it (right) and stay visible
 * without scrolling — only the contact/delivery details form scrolls inside
 * its own panel, like the Findings list on the Artwork page, if everything
 * beside the Proof cannot fit at the floor. Approve moves into the pinned
 * action bar from ticket 02, with the reason it is disabled beside it, and
 * Back sits on the other side.
 */
export default function ApproveAndConfirmStep({
  catalogue,
  selection,
  quote,
  commerceEnabled = false,
  clock,
  frontId,
  backId,
  sameAsFront,
  sizeCode,
  sizeChoice,
  rotate,
  swap,
  ticks,
  onSetTick,
  onClockExpire,
  browsingLanguage,
  locale,
  idempotencyKey,
  onBack,
  onEdit,
  onSubmitted,
}) {
  const t = useTranslations("ApproveAndConfirmStep");
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(false);
  const [attempt, setAttempt] = useState(0); // bumped by Retry
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitRetryable, setSubmitRetryable] = useState(false); // the failure was the connection or the server, not the Order

  useEffect(() => {
    let cancelled = false;
    fetchPreview({ frontId, backId, sameAsFront, sizeCode, sizeChoice, rotate, swap }).then((data) => {
      if (cancelled) return;
      if (!data) setPreviewError(true);
      else {
        setPreview(data);
        setPreviewError(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontId, backId, sameAsFront, sizeCode, sizeChoice?.mode, sizeChoice?.choice, sizeChoice?.applies_to?.join(","), rotate?.front, rotate?.back, swap, attempt]);

  if (previewError) {
    return (
      <LoadFailure
        className="p-[24px]"
        message={t("loadError")}
        retryLabel={t("retry")}
        onRetry={() => {
          setPreviewError(false);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (!preview || (commerceEnabled && !quote) || !clock) {
    return <div className="p-[24px] text-[#575c64] text-[14px]">{t("loading")}</div>;
  }

  const groups = combineFindings({
    front: { findings: preview.front?.findings ?? [] },
    back: preview.back?.same_as_front ? null : { findings: preview.back?.findings ?? [] },
    sameAsFront: Boolean(preview.back?.same_as_front),
  });
  const hasError = !canGoNext(groups);
  const warningGroups = groups.filter(needsWarningsTick);
  const warningCodes = warningCodesOf(groups);

  const configLines = catalogue.options.map((option) => ({
    name: option.name,
    label: option.values.find((v) => v.code === selection[option.code])?.label,
  }));

  const detailsValid =
    details.name.trim() &&
    details.mobile.replace(/\s+/g, "").startsWith("+971") &&
    details.mobile.replace(/\D/g, "").length >= 9 &&
    (!commerceEnabled || (details.area.trim() && details.address_line.trim()));

  const ticksComplete = ticks.approval && (warningGroups.length === 0 || ticks.warnings);
  const canSubmit = !hasError && !submitting && detailsValid && ticksComplete && Boolean(idempotencyKey);
  // The reason Approve is disabled, shown beside it in the action bar (Single-screen,
  // ticket 05); null once submitting, since the button's own label says so instead.
  const approveReason = submitting ? null : hasError ? "hasErrors" : !detailsValid ? "approveNeedsDetails" : !ticksComplete ? "approveNeedsTicks" : null;

  function updateDetails(field, value) {
    setDetails((d) => ({ ...d, [field]: value }));
  }

  // The Cut-off passing changes the promised date (and may drop a Same-day
  // pick): the caller refreshes and clears the ticks, and we say why.
  function handleExpire() {
    setNotice(t("expiredNotice"));
    onClockExpire();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    setSubmitRetryable(false);
    setNotice(null);
    try {
      const body = {
        configuration: selection,
        front_artwork: frontId,
        back_artwork: sameAsFront ? null : backId,
        same_as_front: sameAsFront,
        // The Fit/Fill choice with Rotate and Swap recorded beside it (null when none).
        size_choice: sizeChoiceWithInstructions(sizeChoice, rotate, swap),
        // With the Commerce switch off there is no total to send or check.
        ...(commerceEnabled && quote ? { expected_total_fils: Math.round(Number(quote.total_aed) * 100) } : {}),
        expected_turnaround: selection.turnaround,
        expected_promised_date: clock.promised_date,
        accepted_warning_codes: warningCodes,
        approval_tick: ticks.approval,
        warnings_tick: ticks.warnings,
        // detailsValid checked the mobile with whitespace stripped (spaces
        // are a normal way to type it, e.g. "+971 50 123 4567"); send that
        // same cleaned form, not the raw field value, so the server's
        // "+971…" check sees exactly what was validated.
        ...(commerceEnabled
          ? { delivery: { ...details, mobile: details.mobile.replace(/\s+/g, "") } }
          : { contact: { name: details.name, mobile: details.mobile.replace(/\s+/g, ""), email: details.email, company: details.company, note: details.note } }),
        browsing_language: browsingLanguage,
        idempotency_key: idempotencyKey,
      };
      let res;
      try {
        res = await fetchWithTimeout(
          `${API_BASE_URL}/api/products/${FLYERS_SLUG}/orders/`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
          SUBMIT_TIMEOUT_MS
        );
      } catch {
        // Offline or too slow: the Order may or may not have been placed. The same
        // idempotency key goes out again on Retry, so it is placed once either way.
        setSubmitError(t("networkError"));
        setSubmitRetryable(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 201 || res.status === 200) {
        onSubmitted(data);
        return;
      }
      if (res.status === 409) {
        onClockExpire(); // refresh + clear ticks: the proof on screen is stale
        setSubmitError(null);
        setNotice(t("staleNotice"));
      } else if (res.status >= 500 || res.status === 429) {
        setSubmitError(t("networkError"));
        setSubmitRetryable(true);
      } else if (data.code === "invalid_delivery" || data.code === "invalid_contact") {
        setSubmitError(t(commerceEnabled ? "invalidDelivery" : "invalidContact"));
      } else if (data.code === "artwork_has_errors") {
        setSubmitError(t("hasErrors"));
      } else if (data.code && t.has(`error_${data.code}`)) {
        setSubmitError(t(`error_${data.code}`));
      } else {
        // A code we don't know yet: the server's English sentence beats nothing.
        setSubmitError(data.detail || t("genericError"));
      }
    } catch {
      setSubmitError(t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  const hasBack = !preview.back?.same_as_front && preview.back;

  return (
    <div className="flex flex-col gap-[16px] w-full lg:flex-1 lg:min-h-0">
      <FirstVisitHint step="approval" />

      {/* Two Single-screen zones (ticket 05): the Proof fills the height on
         one side; the Configuration/delivery card, the countdown and the
         acknowledgements stay visible beside it on the other, with only the
         contact/delivery details form scrolling inside its own panel if
         everything cannot fit at the floor. */}
      <div className="grid grid-cols-12 gap-[20px] w-full lg:flex-1 lg:min-h-0 lg:items-stretch">
        <div className="col-span-12 lg:col-span-6 min-w-0 flex flex-col gap-[10px] lg:min-h-0">
          <ProofThumbnail
            label={t("front")}
            image={preview.front}
            orderedTrimMm={preview.ordered_trim_mm}
            changeText={t("changeFile")}
            changeLabel={t("changeFileFront")}
            onChange={() => onEdit?.("front")}
            fill
          />
          {hasBack && (
            <ProofThumbnail
              label={t("back")}
              image={preview.back}
              orderedTrimMm={preview.ordered_trim_mm}
              changeText={t("changeFile")}
              changeLabel={t("changeFileBack")}
              onChange={() => onEdit?.("back")}
              fill
            />
          )}
        </div>

        <div className="col-span-12 lg:col-span-6 min-w-0 flex flex-col gap-[16px] lg:min-h-0">
          <div className="shrink-0 flex flex-col gap-[16px]">
            <div className="bg-white rounded-[16px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] overflow-clip">
              <div className="bg-[#2a313d] px-[16px] py-[12px] flex items-center justify-between gap-[12px]">
                <span className="text-[#ebf1ff] text-[16px] font-semibold">{t("summary")}</span>
                <button
                  type="button"
                  onClick={() => onEdit?.("options")}
                  className="tap inline-flex items-center justify-center text-[#ebf1ff] text-[12px] font-semibold underline"
                >
                  {t("editOptions")}
                </button>
              </div>
              <div className="flex flex-col gap-[6px] p-[16px]">
                {configLines.map((line) => (
                  <Line key={line.name} label={line.name} value={line.label} />
                ))}
                {commerceEnabled && quote && (
                  <>
                    <div className="h-px bg-[#f0f3ff] my-[4px]" />
                    <Line label={t("subtotalExVat")} value={t("aed", { amount: quote.subtotal_aed })} />
                    <Line label={t("vat")} value={t("aed", { amount: quote.vat_aed })} />
                    <Line label={t("delivery")} value={t("free")} />
                    <div className="flex items-center justify-between pt-[8px]">
                      <span className="text-[#151c27] text-[16px] font-bold">{t("totalInclVat")}</span>
                      <span className="text-[#bb0027] text-[24px] font-extrabold">{t("aed", { amount: quote.total_aed })}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {commerceEnabled && (
              <div className="bg-[#f0f3ff] rounded-[12px] p-[12px] text-[#151c27] text-[13px] font-semibold">
                {t("payOnDelivery")}
              </div>
            )}

            {/* Keyed on clock.now, like FlyersConfigurator's step 1 Countdown: a
                fresh clock (a resubmit-triggered refresh, or this countdown's
                own expiry below) remounts it with a clean countdown instead of
                syncing a ticking value in from a changing prop. */}
            <p>
              <Countdown
                key={clock.now}
                clock={clock}
                locale={locale}
                onExpire={handleExpire}
                commerceEnabled={commerceEnabled}
                className="text-[#575c64] text-[13px]"
              />
            </p>

            {notice && (
              <p role="status" className="bg-[#fff4e5] text-[#8a4b00] rounded-[8px] px-[12px] py-[8px] text-[13px] font-semibold">
                {notice}
              </p>
            )}
          </div>

          {/* Contact/delivery details: the one part of this column that scrolls
             inside its own panel (heading kept in view) when the rest doesn't
             leave it room, the same rule as the Findings panel on the Artwork page. */}
          <DetailsForm t={t} details={details} onChange={updateDetails} commerceEnabled={commerceEnabled} />

          <div className="shrink-0 flex flex-col gap-[8px]">
            <div className="flex flex-col gap-[8px] bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] p-[12px]">
              <Tick
                checked={ticks.approval}
                onChange={(v) => onSetTick("approval", v)}
                label={t("approvalTick")}
              />
              {warningGroups.length > 0 && (
                <Tick
                  checked={ticks.warnings}
                  onChange={(v) => onSetTick("warnings", v)}
                  label={t("warningsTick", { list: warningGroups.map((g) => warningShortName(g.code, locale)).join(", ") })}
                />
              )}
            </div>

            {submitError && submitRetryable ? (
              <LoadFailure message={submitError} retryLabel={t("retry")} onRetry={handleSubmit} />
            ) : (
              submitError && <p className="text-[#bb0027] text-[13px] font-semibold">{submitError}</p>
            )}
          </div>
        </div>
      </div>

      <JourneyActionBar
        secondary={
          <button
            type="button"
            onClick={onBack}
            className="tap h-[44px] px-[24px] rounded-[8px] text-[14px] font-semibold bg-white text-[#151c27] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
          >
            {t("backButton")}
          </button>
        }
        primary={
          <>
            {approveReason && (
              <span id="submit-disabled-reason" className="text-[#b0001d] text-[13px] font-semibold">
                {t(approveReason)}
              </span>
            )}
            <button
              type="button"
              disabled={!canSubmit}
              aria-describedby={approveReason ? "submit-disabled-reason" : undefined}
              onClick={handleSubmit}
              className="tap h-[44px] px-[24px] rounded-[8px] text-[14px] font-semibold bg-[#e51937] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? t("submitting") : t("submit")}
            </button>
          </>
        }
      />
    </div>
  );
}

// The Proof (ticket 05: the largest area on the Approve page, filling the
// height of its column with `fill` — see ArtworkPreview) draws the same SVG
// step 2 uses, at full size rather than the small thumbnail this card showed
// before Single-screen, no guides, no Finding pins — only the Fit/Fill
// transform (white border / crop) stays visible.
function ProofThumbnail({ label, image, orderedTrimMm, changeText, changeLabel, onChange, fill }) {
  const proofImage = { ...image, image_url: image.image_url ?? image.thumbnail_url };
  return (
    <div className={`bg-[#f0f3ff] rounded-[12px] p-[10px] flex flex-col gap-[6px] ${fill ? "flex-1 min-h-0" : ""}`}>
      <div className={fill ? "flex-1 min-h-0 flex items-center justify-center" : ""}>
        <ArtworkPreview
          slot="proof"
          image={proofImage}
          orderedTrimMm={orderedTrimMm}
          productBleedMm={0}
          productSafeMm={0}
          groups={[]}
          withGuides={false}
          fill={fill}
        />
      </div>
      <span className="text-[#575c64] text-[11px] text-center">{label}</span>
      <button type="button" aria-label={changeLabel} onClick={onChange} className="tap inline-flex items-center justify-center self-center text-[#bb0027] text-[12px] font-bold underline">
        {changeText}
      </button>
    </div>
  );
}

// The contact/delivery details card: the heading stays outside the scroll (`shrink-0`,
// like the Findings panel's heading on the Artwork page), only the fields below it
// scroll inside the card if there isn't room to show them all beside the Proof.
function DetailsForm({ t, details, onChange, commerceEnabled }) {
  return (
    <div className="bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] p-[16px] flex flex-col gap-[10px] lg:flex-1 lg:min-h-0">
      <span className="shrink-0 text-[#151c27] text-[14px] font-semibold">{t(commerceEnabled ? "deliveryDetails" : "contactDetails")}</span>
      <div className="flex flex-col gap-[10px] lg:min-h-0 lg:overflow-y-auto">
      <Field label={t("fieldName")} value={details.name} onChange={(v) => onChange("name", v)} required />
      <Field label={t("fieldMobile")} value={details.mobile} onChange={(v) => onChange("mobile", v)} required ltr />
      {commerceEnabled && (
        <>
          <Field label={t("fieldArea")} value={details.area} onChange={(v) => onChange("area", v)} required />
          <Field label={t("fieldAddress")} value={details.address_line} onChange={(v) => onChange("address_line", v)} required />
        </>
      )}
      <Field label={t("fieldEmail")} value={details.email} onChange={(v) => onChange("email", v)} ltr />
      <Field label={t("fieldCompany")} value={details.company} onChange={(v) => onChange("company", v)} />
      <Field label={t("fieldNote")} value={details.note} onChange={(v) => onChange("note", v)} />
      </div>
    </div>
  );
}

function Field({ label, value, onChange, required, ltr }) {
  return (
    <label className="flex flex-col gap-[4px]">
      <span className="text-[#5d3f3e] text-[11px] font-semibold">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type="text"
        dir={ltr ? "ltr" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tap h-[38px] px-[10px] rounded-[8px] border border-[#e2e8f8] text-[13px] text-[#151c27]"
      />
    </label>
  );
}

function Tick({ checked, onChange, label }) {
  return (
    <label className="tap flex items-start gap-[8px] cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-[1px] size-[20px] shrink-0" />
      <span className="text-[#151c27] text-[13px]">{label}</span>
    </label>
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
