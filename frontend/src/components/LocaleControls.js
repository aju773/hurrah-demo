"use client";

import { Suspense } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";

const OPTIONS = [
  { code: "en", label: "EN", nameKey: "switchToEnglish" },
  { code: "ar", label: "عربي", nameKey: "switchToArabic" },
];

// The URL prefix is the language (localePrefix: "always"), so switching is a
// plain link to the same page under the other prefix. The query string is kept
// so a draft carried in `?draft=…` survives the switch even where sessionStorage
// is unavailable; the draft itself (Artwork ids, picks, ticks) never leaves the
// browser, so nothing is re-uploaded or re-checked.
function Toggle() {
  const locale = useLocale();
  const t = useTranslations("LanguageToggle");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = Object.fromEntries(searchParams.entries());

  return (
    <div role="group" aria-label={t("label")} className="inline-flex rounded-[8px] bg-[#f0f3ff] p-[2px] text-[12px] font-bold">
      {OPTIONS.map((option) =>
        option.code === locale ? (
          <span key={option.code} aria-current="true" className="tap inline-flex items-center justify-center rounded-[6px] bg-[#151c27] px-[10px] py-[4px] text-white">
            {option.label}
          </span>
        ) : (
          <Link
            key={option.code}
            href={{ pathname, query }}
            locale={option.code}
            lang={option.code}
            aria-label={t(option.nameKey)}
            className="tap inline-flex items-center justify-center rounded-[6px] px-[10px] py-[4px] text-[#151c27]"
          >
            {option.label}
          </Link>
        )
      )}
    </div>
  );
}

/** "مسودة ترجمة / Draft translation" — Arabic only: the Arabic copy is machine
 * translated until a native speaker reviews it (spec: Arabic stories 113-119). */
export function DraftTranslationPill() {
  const locale = useLocale();
  const t = useTranslations("LanguageToggle");
  if (locale !== "ar") return null;
  return (
    <span className="rounded-full bg-[#fff4d6] px-[10px] py-[3px] text-[11px] font-semibold text-[#7a4f00]">
      {t("draftTranslation")}
    </span>
  );
}

/** The EN / عربي toggle and, in Arabic, the draft-translation pill. */
export default function LocaleControls() {
  return (
    <div className="flex items-center gap-[8px]">
      <Suspense fallback={null}>
        <Toggle />
      </Suspense>
      <DraftTranslationPill />
    </div>
  );
}
