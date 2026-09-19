import { getLocale, getTranslations } from "next-intl/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import FlyersConfigurator from "@/components/FlyersConfigurator";
import LocaleControls from "@/components/LocaleControls";
import { API_BASE_URL, FLYERS_SLUG } from "@/lib/api";

async function getCatalogue(locale) {
  const res = await fetch(`${API_BASE_URL}/api/products/${FLYERS_SLUG}/catalogue/?locale=${locale}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

async function getConfiguration(locale) {
  const res = await fetch(`${API_BASE_URL}/api/products/${FLYERS_SLUG}/configuration/?locale=${locale}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function FlyersPage() {
  const locale = await getLocale();
  const t = await getTranslations("FlyersPage");
  const [catalogue, configuration] = await Promise.all([getCatalogue(locale), getConfiguration(locale)]);
  // getCatalogue/getConfiguration return null only on a non-OK fetch response
  // (see above); a distinct error message keeps that indistinguishable from
  // FlyersConfigurator's own initial-loading state.
  const hasError = !catalogue || !configuration;
  // The Commerce switch rides in the catalogue payload; without it, stay money-free.
  const commerceEnabled = catalogue?.commerce_enabled === true;

  return (
    <div className="relative mx-auto bg-[#f9f9ff]" style={{ maxWidth: "1512px" }}>
      <SiteHeader commerceEnabled={commerceEnabled} />
      <main id="main" tabIndex={-1} className="outline-none flex flex-col gap-[20px] px-[16px] sm:px-[32px] py-[26px] w-full">
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <h1 className="text-[#151c27] text-[28px] font-extrabold tracking-[-0.7px]">{t("title")}</h1>
          <LocaleControls />
        </div>
        {hasError ? (
          <p className="text-[#bb0027] text-[14px]">{t("loadError")}</p>
        ) : (
          <FlyersConfigurator initialCatalogue={catalogue} initialConfiguration={configuration} />
        )}
      </main>
      <SiteFooter commerceEnabled={commerceEnabled} />
    </div>
  );
}
