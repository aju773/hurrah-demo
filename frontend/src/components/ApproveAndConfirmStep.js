"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { API_BASE_URL, FLYERS_SLUG } from "@/lib/api";
import DeliveryLine from "./DeliveryLine";
import { combineFindings, warningShortName } from "@/lib/findings";
import { fetchPreview } from "@/lib/preview";
import ArtworkPreview from "./ArtworkPreview";

const EXPIRED_RETRY_MS = 5000;

const EMPTY_DELIVERY = { name: "", mobile: "+971", area: "", address_line: "", email: "", company: "", note: "" };

function warningCodesOf(groups) {
  return [...new Set(groups.filter((g) => g.severity === "warning").map((g) => g.code))].sort();
}

/**
 * Step 3, "Approve & confirm" (ticket 10): a read-only summary of the
 * Configuration, Quote and Proof thumbnail, the guest delivery form, pay on
 * delivery, the Cut-off countdown, the approval ticks and a server-checked
 * Submit. Configuration/Artwork changes and the countdown reaching zero clear
 * the ticks (spec stories 81-82) — the caller (FlyersConfigurator) owns that
 * shared draft state; this component just renders it and calls back.
 */
export default function ApproveAndConfirmStep({
  catalogue,
  selection,
  quote,
  clock,
  frontId,
  backId,
  sameAsFront,
  sizeCode,
  sizeChoice,
  ticks,
  onSetTick,
  onClockExpire,
  browsingLanguage,
  locale,
  idempotencyKey,
  onBack,
  onSubmitted,
}) {
  const t = useTranslations("ApproveAndConfirmStep");
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(false);
  const [delivery, setDelivery] = useState(EMPTY_DELIVERY);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchPreview({ frontId, backId, sameAsFront, sizeCode, sizeChoice }).then((data) => {
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
  }, [frontId, backId, sameAsFront, sizeCode, sizeChoice?.mode, sizeChoice?.choice, sizeChoice?.applies_to?.join(",")]);

  if (previewError) {
    return <div className="p-[24px] text-[#bb0027] text-[14px]">{t("loadError")}</div>;
  }
  if (!preview || !quote || !clock) {
    return <div className="p-[24px] text-[#575c64] text-[14px]">{t("loading")}</div>;
  }

  const groups = combineFindings({
    front: { findings: preview.front?.findings ?? [] },
    back: preview.back?.same_as_front ? null : { findings: preview.back?.findings ?? [] },
    sameAsFront: Boolean(preview.back?.same_as_front),
  });
  const hasError = groups.some((g) => g.severity === "error");
  const warningGroups = groups.filter((g) => g.severity === "warning");
  const warningCodes = warningCodesOf(groups);

  const configLines = catalogue.options.map((option) => ({
    name: option.name,
    label: option.values.find((v) => v.code === selection[option.code])?.label,
  }));

  const deliveryValid =
    delivery.name.trim() &&
    delivery.mobile.replace(/\s+/g, "").startsWith("+971") &&
    delivery.mobile.replace(/\D/g, "").length >= 9 &&
    delivery.area.trim() &&
    delivery.address_line.trim();

  const canSubmit =
    !hasError && !submitting && deliveryValid && ticks.approval && (warningGroups.length === 0 || ticks.warnings) && Boolean(idempotencyKey);

  function updateDelivery(field, value) {
    setDelivery((d) => ({ ...d, [field]: value }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = {
        configuration: selection,
        front_artwork: frontId,
        back_artwork: sameAsFront ? null : backId,
        same_as_front: sameAsFront,
        size_choice: sizeChoice?.choice === "keep_size_scale" ? sizeChoice : null,
        expected_total_fils: Math.round(Number(quote.total_aed) * 100),
        expected_turnaround: selection.turnaround,
        expected_promised_date: clock.promised_date,
        accepted_warning_codes: warningCodes,
        approval_tick: ticks.approval,
        warnings_tick: ticks.warnings,
        // deliveryValid checked the mobile with whitespace stripped (spaces
        // are a normal way to type it, e.g. "+971 50 123 4567"); send that
        // same cleaned form, not the raw field value, so the server's
        // "+971…" check sees exactly what was validated.
        delivery: { ...delivery, mobile: delivery.mobile.replace(/\s+/g, "") },
        browsing_language: browsingLanguage,
        idempotency_key: idempotencyKey,
      };
      const res = await fetch(`${API_BASE_URL}/api/products/${FLYERS_SLUG}/orders/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 201 || res.status === 200) {
        onSubmitted(data);
        return;
      }
      if (res.status === 409) {
        onClockExpire(); // refresh + clear ticks: the proof on screen is stale
        setSubmitError(t("staleNotice"));
      } else if (data.code === "invalid_delivery") {
        setSubmitError(t("invalidDelivery"));
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

  return (
    <div className="flex flex-col gap-[16px] w-full">
      <div className="grid grid-cols-12 gap-[20px] w-full items-start">
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-[10px]">
          <ProofThumbnail label={t("front")} image={preview.front} orderedTrimMm={preview.ordered_trim_mm} />
          {!preview.back?.same_as_front && preview.back && (
            <ProofThumbnail label={t("back")} image={preview.back} orderedTrimMm={preview.ordered_trim_mm} />
          )}
        </div>

        <div className="col-span-12 lg:col-span-7 flex flex-col gap-[16px]">
          <div className="bg-white rounded-[16px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] overflow-clip">
            <div className="bg-[#2a313d] px-[16px] py-[12px]">
              <span className="text-[#ebf1ff] text-[16px] font-semibold">{t("summary")}</span>
            </div>
            <div className="flex flex-col gap-[6px] p-[16px]">
              {configLines.map((line) => (
                <Line key={line.name} label={line.name} value={line.label} />
              ))}
              <div className="h-px bg-[#f0f3ff] my-[4px]" />
              <Line label={t("subtotalExVat")} value={t("aed", { amount: quote.subtotal_aed })} />
              <Line label={t("vat")} value={t("aed", { amount: quote.vat_aed })} />
              <Line label={t("delivery")} value={t("free")} />
              <div className="flex items-center justify-between pt-[8px]">
                <span className="text-[#151c27] text-[16px] font-bold">{t("totalInclVat")}</span>
                <span className="text-[#bb0027] text-[24px] font-extrabold">{t("aed", { amount: quote.total_aed })}</span>
              </div>
            </div>
          </div>

          <div className="bg-[#f0f3ff] rounded-[12px] p-[12px] text-[#151c27] text-[13px] font-semibold">
            {t("payOnDelivery")}
          </div>

          {/* Keyed on clock.now, like FlyersConfigurator's step 1 Countdown: a
              fresh clock (a resubmit-triggered refresh, or this countdown's
              own expiry below) remounts it with a clean countdown instead of
              syncing a ticking value in from a changing prop. */}
          <Countdown key={clock.now} clock={clock} locale={locale} onExpire={onClockExpire} />

          <DeliveryForm t={t} delivery={delivery} onChange={updateDelivery} />

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

          {hasError && <p className="text-[#bb0027] text-[13px] font-semibold">{t("hasErrors")}</p>}
          {submitError && <p className="text-[#bb0027] text-[13px] font-semibold">{submitError}</p>}

          <div className="flex items-center justify-end gap-[12px]">
            <button
              type="button"
              onClick={onBack}
              className="h-[44px] px-[24px] rounded-[8px] text-[14px] font-semibold bg-white text-[#151c27] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
            >
              {t("backButton")}
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="h-[44px] px-[24px] rounded-[8px] text-[14px] font-semibold bg-[#e51937] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? t("submitting") : t("submit")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// The Proof thumbnail (spec: "uses the 400px PNG + shared preview
// component"): the same ArtworkPreview SVG step 2 uses, drawing the 400px
// thumbnail instead of the full-size render, no guides, no Finding pins —
// only the Fit/Fill transform (white border / crop) stays visible.
function ProofThumbnail({ label, image, orderedTrimMm }) {
  const thumbImage = { ...image, image_url: image.thumbnail_url ?? image.image_url };
  return (
    <div className="bg-[#f0f3ff] rounded-[12px] p-[10px] flex flex-col gap-[6px]">
      <ArtworkPreview
        slot="proof"
        image={thumbImage}
        orderedTrimMm={orderedTrimMm}
        productBleedMm={0}
        productSafeMm={0}
        groups={[]}
        withGuides={false}
      />
      <span className="text-[#575c64] text-[11px] text-center">{label}</span>
    </div>
  );
}

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

  return (
    <p className="text-[#575c64] text-[13px]">
      <DeliveryLine clock={clock} secondsLeft={secondsLeft} locale={locale} />
    </p>
  );
}

function DeliveryForm({ t, delivery, onChange }) {
  return (
    <div className="bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] p-[16px] flex flex-col gap-[10px]">
      <span className="text-[#151c27] text-[14px] font-semibold">{t("deliveryDetails")}</span>
      <Field label={t("fieldName")} value={delivery.name} onChange={(v) => onChange("name", v)} required />
      <Field label={t("fieldMobile")} value={delivery.mobile} onChange={(v) => onChange("mobile", v)} required ltr />
      <Field label={t("fieldArea")} value={delivery.area} onChange={(v) => onChange("area", v)} required />
      <Field label={t("fieldAddress")} value={delivery.address_line} onChange={(v) => onChange("address_line", v)} required />
      <Field label={t("fieldEmail")} value={delivery.email} onChange={(v) => onChange("email", v)} ltr />
      <Field label={t("fieldCompany")} value={delivery.company} onChange={(v) => onChange("company", v)} />
      <Field label={t("fieldNote")} value={delivery.note} onChange={(v) => onChange("note", v)} />
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
        className="h-[38px] px-[10px] rounded-[8px] border border-[#e2e8f8] text-[13px] text-[#151c27]"
      />
    </label>
  );
}

function Tick({ checked, onChange, label }) {
  return (
    <label className="flex items-start gap-[8px] cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-[3px]" />
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
