"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { API_BASE_URL, DESIGN_REQUEST_MAX_FILES } from "@/lib/api";
import { isolateLtr } from "@/lib/bidi";
import LocaleControls from "./LocaleControls";

const FLYER_LANGUAGE_OPTIONS = [
  { code: "en", labelKey: "langEn" },
  { code: "ar", labelKey: "langAr" },
  { code: "both", labelKey: "langBoth" },
];

function whatsappUrl(number, text) {
  const digits = (number || "").replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// The WhatsApp message, in the browsing language with that language's option names
// (the configuration line comes from the catalogue fetched for the same locale).
function buildPrefill(t, configurationLine, drNumber) {
  const parts = [t("prefillStart")];
  if (configurationLine) parts.push(t("prefillConfiguration", { configuration: configurationLine }));
  if (drNumber) parts.push(t("prefillRequest", { number: drNumber }));
  return parts.join(" ");
}

const EMPTY_FORM = { name: "", phone: "", email: "", business_name: "", brief: "", flyer_language: "en" };

/**
 * The "Need a design?" drawer. Opened from the Flyers page, the upload slots
 * and the hotline card — all pass the same shape of props. Closing it (via
 * `onClose`) never touches the caller's own options/uploads state.
 */
export default function DesignHelpDrawer({ open, onClose, product, configurationLine, configurationSnapshot }) {
  const browsingLanguage = useLocale();
  const t = useTranslations("DesignHelp");
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState([]);
  const [fileError, setFileError] = useState("");
  const [status, setStatus] = useState("form"); // form | submitting | success | error
  const [errors, setErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState(null);
  const [whatsappNumber, setWhatsappNumber] = useState("");

  useEffect(() => {
    if (!open || whatsappNumber) return;
    fetch(`${API_BASE_URL}/api/design-requests/settings/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setWhatsappNumber(data.whatsapp_number))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setForm(EMPTY_FORM);
    setFiles([]);
    setFileError("");
    setStatus("form");
    setErrors({});
    setErrorMessage("");
    setResult(null);
    onClose();
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleFilesSelected(fileList) {
    const chosen = Array.from(fileList || []);
    if (chosen.length > DESIGN_REQUEST_MAX_FILES) {
      setFileError(t("maxFiles", { max: DESIGN_REQUEST_MAX_FILES }));
      return;
    }
    setFileError("");
    setFiles(chosen);
  }

  async function submit(e) {
    e.preventDefault();
    setStatus("submitting");
    setErrors({});
    setErrorMessage("");

    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => body.append(key, value));
    body.append("browsing_language", browsingLanguage);
    if (product?.id) body.append("product", product.id);
    if (configurationSnapshot && Object.keys(configurationSnapshot).length > 0) {
      body.append("configuration", JSON.stringify(configurationSnapshot));
    }
    files.forEach((file) => body.append("files", file));

    try {
      const res = await fetch(`${API_BASE_URL}/api/design-requests/`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setStatus("form");
        // Each field error is translated from its code; a code we don't know
        // keeps the server's English sentence.
        const translated = {};
        for (const [field, message] of Object.entries(data.errors || {})) {
          const code = data.error_codes?.[field];
          translated[field] = code && t.has(code) ? t(code) : message;
        }
        setErrors(translated);
        setErrorMessage(t("checkForm"));
        return;
      }
      setResult(data);
      setStatus("success");
    } catch {
      setStatus("form");
      setErrorMessage(t("serverUnreachable"));
    }
  }

  if (!open) return null;

  const prefillBeforeSubmit = buildPrefill(t, configurationLine);
  const prefillAfterSubmit = result ? buildPrefill(t, configurationLine, result.number) : "";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="relative bg-white h-full flex flex-col overflow-hidden" style={{ width: "440px", maxWidth: "100%" }}>
        <div className="bg-[#2a313d] flex items-center justify-between px-[20px] py-[16px] shrink-0">
          <span className="text-white text-[16px] font-semibold">{t("title")}</span>
          <div className="flex items-center gap-[12px]">
            <LocaleControls />
            <button type="button" onClick={close} className="text-white text-[20px] leading-none" aria-label={t("close")}>
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-[20px]">
          {status === "success" && result ? (
            <div className="flex flex-col gap-[16px]">
              <div className="bg-[rgba(26,127,55,0.08)] border border-[#1a7f37] rounded-[12px] p-[16px]">
                <p className="text-[#1a7f37] text-[14px] font-semibold">
                  {t("successTitle", { number: isolateLtr(result.number) })}
                </p>
              </div>
              <a
                href={whatsappUrl(whatsappNumber, prefillAfterSubmit)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center h-[48px] rounded-[12px] w-full text-[14px] font-bold bg-[#25d366] text-white"
              >
                {t("continueWhatsapp")}
              </a>
              <button
                type="button"
                onClick={close}
                className="flex items-center justify-center h-[48px] rounded-[12px] w-full text-[14px] font-bold bg-[#f0f3ff] text-[#151c27]"
              >
                {t("backToFlyers")}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-[16px]">
              <p className="text-[#151c27] text-[16px] font-semibold">{t("intro")}</p>

              <div className="bg-[#f0f3ff] rounded-[8px] p-[10px]">
                <span className="text-[#5d3f3e] text-[10px] font-bold tracking-[0.5px] uppercase">{t("currentConfiguration")}</span>
                <p className="text-[#151c27] text-[13px] font-semibold mt-[2px]">{configurationLine || t("notDecided")}</p>
              </div>

              {errorMessage && <p className="text-[#bb0027] text-[12px]">{errorMessage}</p>}

              <Field label={t("fieldName")} error={errors.name}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className="h-[40px] px-[12px] rounded-[8px] border border-[#e2e8f8] text-[13px] w-full"
                  required
                />
              </Field>

              <Field label={t("fieldPhone")} error={errors.phone}>
                <input
                  type="tel"
                  dir="ltr"
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  className="h-[40px] px-[12px] rounded-[8px] border border-[#e2e8f8] text-[13px] w-full"
                  required
                />
              </Field>

              <Field label={t("fieldEmail")}>
                <input
                  type="email"
                  dir="ltr"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  className="h-[40px] px-[12px] rounded-[8px] border border-[#e2e8f8] text-[13px] w-full"
                />
              </Field>

              <Field label={t("fieldBusiness")}>
                <input
                  type="text"
                  value={form.business_name}
                  onChange={(e) => updateField("business_name", e.target.value)}
                  className="h-[40px] px-[12px] rounded-[8px] border border-[#e2e8f8] text-[13px] w-full"
                />
              </Field>

              <Field label={t("fieldBrief")} error={errors.brief}>
                <textarea
                  value={form.brief}
                  onChange={(e) => updateField("brief", e.target.value)}
                  className="px-[12px] py-[8px] rounded-[8px] border border-[#e2e8f8] text-[13px] w-full"
                  rows={4}
                  required
                />
              </Field>

              <Field label={t("fieldFlyerLanguage")} error={errors.flyer_language}>
                <div className="flex gap-[8px]">
                  {FLYER_LANGUAGE_OPTIONS.map((option) => (
                    <button
                      key={option.code}
                      type="button"
                      onClick={() => updateField("flyer_language", option.code)}
                      className={`h-[36px] px-[14px] rounded-[8px] text-[12px] font-semibold ${
                        form.flyer_language === option.code ? "bg-[#e51937] text-white" : "bg-[#f0f3ff] text-[#151c27]"
                      }`}
                    >
                      {t(option.labelKey)}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label={t("fieldFiles", { max: DESIGN_REQUEST_MAX_FILES })} error={errors.files || fileError}>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  multiple
                  onChange={(e) => handleFilesSelected(e.target.files)}
                  className="text-[12px] w-full"
                />
                {files.length > 0 && (
                  <ul className="text-[#575c64] text-[12px] mt-[4px]">
                    {files.map((f) => (
                      <li key={f.name}>
                        <bdi dir="ltr">{f.name}</bdi>
                      </li>
                    ))}
                  </ul>
                )}
              </Field>

              <button
                type="submit"
                disabled={status === "submitting"}
                className="flex items-center justify-center h-[48px] rounded-[12px] w-full text-[14px] font-bold bg-[#e51937] text-white disabled:opacity-60"
              >
                {status === "submitting" ? t("sending") : t("send")}
              </button>

              <a
                href={whatsappUrl(whatsappNumber, prefillBeforeSubmit)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center h-[44px] rounded-[12px] w-full text-[13px] font-bold bg-[#f0f3ff] text-[#151c27]"
              >
                {t("orWhatsapp")}
              </a>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="flex flex-col gap-[4px]">
      <span className="text-[#5d3f3e] text-[11px] font-semibold">{label}</span>
      {children}
      {error && <span className="text-[#bb0027] text-[11px]">{error}</span>}
    </label>
  );
}
