"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { API_BASE_URL, FLYERS_SLUG } from "@/lib/api";
import { fetchWithTimeout } from "@/lib/network";
import LoadFailure from "./LoadFailure";
import useDialogA11y from "@/lib/useDialogA11y";

/**
 * "Artwork templates and guide", opened from a button on the Artwork page
 * (Single-screen, ticket 04: it no longer sits on the page as a block): a
 * download link for the Artwork template of every Size the server offers (the
 * server owns that list, so it always equals the Product's active Sizes), and a
 * short "How to prepare your file" guide. The guide's numbers are the server's
 * own thresholds, put into message texts, so the guide cannot drift from what
 * Preflight checks.
 */
export default function ArtworkTemplatesPanel({ open, onClose, productSlug = FLYERS_SLUG }) {
  const t = useTranslations("ArtworkTemplates");
  const locale = useLocale();
  const headingId = useId();
  const panelRef = useRef(null);
  const [state, setState] = useState({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0); // bumped by Retry

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchWithTimeout(`${API_BASE_URL}/api/products/${productSlug}/templates/?locale=${locale}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("templates"))))
      .then((data) => !cancelled && setState({ status: "ok", data }))
      .catch(() => !cancelled && setState({ status: "error", data: null }));
    return () => {
      cancelled = true;
    };
  }, [open, productSlug, locale, attempt]);

  useDialogA11y(panelRef, { active: open, onClose });

  if (!open) return null;

  const body = (() => {
    if (state.status === "loading") return null;

    if (state.status === "error") {
      return (
        <LoadFailure
          message={t("unavailable")}
          retryLabel={t("retry")}
          onRetry={() => {
            setState({ status: "loading", data: null });
            setAttempt((n) => n + 1);
          }}
        />
      );
    }

    const { templates, guide } = state.data;
    // Whole numbers read without a decimal point ("3 mm", "6.5 mm"); strings keep Western digits in Arabic.
    const value = { bleed: String(guide.bleed_mm), safe: String(guide.safe_mm), ppiWarn: String(guide.ppi_warn_below), ppiError: String(guide.ppi_error_below) };

    return (
      <>
        <p className="text-[#5d3f3e] text-[13px]">{t("intro")}</p>

        <ul aria-label={t("listLabel")} className="flex flex-col gap-[8px]">
          {templates.map((template) => (
            <li key={template.size_code}>
              <a
                href={template.url}
                download
                className="flex items-center justify-between gap-[8px] rounded-[8px] border border-[#e2bebc] px-[12px] py-[8px] text-[13px] text-[#151c27] hover:bg-[#f0f3ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#bb0027]"
              >
                <span className="font-bold">{template.label}</span>
                <span dir="ltr" className="text-[#5d3f3e]">
                  {t("dimensions", { width: String(template.width_mm), height: String(template.height_mm) })}
                </span>
                <span className="text-[#bb0027] font-bold">{t("download")}</span>
              </a>
            </li>
          ))}
        </ul>

        <h3 className="text-[#151c27] text-[13px] font-bold">{t("guideTitle")}</h3>
        <ul aria-label={t("guideTitle")} className="list-disc ps-[20px] flex flex-col gap-[4px] text-[#5d3f3e] text-[13px]">
          <li>{t("guideBleed", value)}</li>
          <li>{t("guideSafe", value)}</li>
          <li>{t("guideColour")}</li>
          <li>{t("guideFonts")}</li>
          <li>{t("guideResolution", value)}</li>
        </ul>
      </>
    );
  })();

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative bg-white h-full flex flex-col overflow-hidden outline-none"
        style={{ width: "440px", maxWidth: "100%" }}
      >
        <div className="bg-[#2a313d] flex items-center justify-between px-[20px] py-[16px] shrink-0">
          <h2 id={headingId} className="text-white text-[16px] font-semibold">
            {t("title")}
          </h2>
          <button type="button" onClick={onClose} className="tap text-white text-[20px] leading-none" aria-label={t("close")}>
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto p-[20px] flex flex-col gap-[12px]">{body}</div>
      </div>
    </div>
  );
}
