import { getLocale, getTranslations } from "next-intl/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import FlyersConfigurator from "@/components/FlyersConfigurator";
import PageLoadFailure from "@/components/PageLoadFailure";
import { API_BASE_URL, FLYERS_SLUG } from "@/lib/api";
import { fetchWithTimeout } from "@/lib/network";

// Null when the server can't be reached or answers with an error: the page then says
// so with a Retry instead of failing to render.
async function getJson(path) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const getCatalogue = (locale) => getJson(`/api/products/${FLYERS_SLUG}/catalogue/?locale=${locale}`);
const getConfiguration = (locale) => getJson(`/api/products/${FLYERS_SLUG}/configuration/?locale=${locale}`);

export default async function FlyersPage() {
  const locale = await getLocale();
  const t = await getTranslations("FlyersPage");
  const [catalogue, configuration] = await Promise.all([getCatalogue(locale), getConfiguration(locale)]);
  // getCatalogue/getConfiguration return null when the server can't be reached or
  // answers with an error (see above); a distinct error message keeps that
  // distinguishable from FlyersConfigurator's own initial-loading state.
  const hasError = !catalogue || !configuration;

  return (
    <div className="relative mx-auto bg-[#f9f9ff]" style={{ maxWidth: "1512px" }}>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="outline-none flex flex-col gap-[20px] px-[16px] sm:px-[32px] py-[26px] w-full">
        <h1 className="text-[#151c27] text-[28px] font-extrabold tracking-[-0.7px]">{t("title")}</h1>
        {hasError ? (
          <PageLoadFailure message={t("loadError")} retryLabel={t("retry")} />
        ) : (
          <FlyersConfigurator initialCatalogue={catalogue} initialConfiguration={configuration} />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
