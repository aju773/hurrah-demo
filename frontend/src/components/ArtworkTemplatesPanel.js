"use client";

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { API_BASE_URL, FLYERS_SLUG } from "@/lib/api";

/**
 * "Artwork templates and guide", beside the upload slots: a download link for the
 * Artwork template of every Size the server offers (the server owns that list, so
 * it always equals the Product's active Sizes), and a short "How to prepare your
 * file" guide. The guide's numbers are the server's own thresholds, put into
 * message texts, so the guide cannot drift from what Preflight checks.
 */
export default function ArtworkTemplatesPanel({ productSlug = FLYERS_SLUG }) {
  const t = useTranslations("ArtworkTemplates");
  const locale = useLocale();
  const headingId = useId();
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/products/${productSlug}/templates/?locale=${locale}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("templates"))))
      .then((data) => !cancelled && setState({ status: "ok", data }))
      .catch(() => !cancelled && setState({ status: "error", data: null }));
    return () => {
      cancelled = true;
    };
  }, [productSlug, locale]);

  const shell = "flex flex-col gap-[12px] bg-white border border-[#e2bebc] rounded-[12px] p-[16px] w-full";
  const heading = (
    <h2 id={headingId} className="text-[#151c27] text-[15px] font-extrabold">
      {t("title")}
    </h2>
  );

  if (state.status === "loading") return null;

  if (state.status === "error") {
    return (
      <section aria-labelledby={headingId} className={shell}>
        {heading}
        <p role="status" className="text-[#5d3f3e] text-[13px]">
          {t("unavailable")}
        </p>
      </section>
    );
  }

  const { templates, guide } = state.data;
  // Whole numbers read without a decimal point ("3 mm", "6.5 mm"); strings keep Western digits in Arabic.
  const value = { bleed: String(guide.bleed_mm), safe: String(guide.safe_mm), ppiWarn: String(guide.ppi_warn_below), ppiError: String(guide.ppi_error_below) };

  return (
    <section aria-labelledby={headingId} className={shell}>
      {heading}
      <p className="text-[#5d3f3e] text-[13px]">{t("intro")}</p>

      <ul aria-label={t("listLabel")} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[8px]">
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
    </section>
  );
}
