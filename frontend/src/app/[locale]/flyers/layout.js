import { getLocale, getTranslations } from "next-intl/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import FlyersConfigurator from "@/components/FlyersConfigurator";
import PageLoadFailure from "@/components/PageLoadFailure";
import { ShowHintsLink } from "@/components/FirstVisitHint";
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

// Every page of the journey (Options, Artwork, Check, Approve) is served by this layout:
// FlyersConfigurator stays mounted across them and shows the page the draft is on. The
// route files below it exist only to give each page its own address.
export default async function FlyersLayout() {
  const locale = await getLocale();
  const t = await getTranslations("FlyersPage");
  const [catalogue, configuration] = await Promise.all([getCatalogue(locale), getConfiguration(locale)]);
  // getCatalogue/getConfiguration return null when the server can't be reached or
  // answers with an error (see above); a distinct error message keeps that
  // distinguishable from FlyersConfigurator's own initial-loading state.
  const hasError = !catalogue || !configuration;

  // Single-screen (CONTEXT.md): this frame fills the viewport at a desktop/laptop
  // floor of 1024x700 and does not itself scroll (`single-screen`/`single-screen-scroll`
  // in globals.css) — the page's own heading (PageHeading, in FlyersConfigurator) is
  // the one-line title, so there is no separate title here, and the footer (Site
  // chrome, holding nothing that works) is dropped to give the page the room. Below
  // the floor these classes do nothing and the page is exactly as it was.
  return (
    <div className="single-screen relative mx-auto flex flex-col bg-[#f9f9ff]" style={{ maxWidth: "1512px" }}>
      <SiteHeader end={<ShowHintsLink />} />
      <main id="main" tabIndex={-1} className="single-screen-scroll outline-none flex-1 min-h-0 flex flex-col gap-[20px] px-[16px] sm:px-[32px] py-[26px] w-full">
        {hasError ? (
          <PageLoadFailure message={t("loadError")} retryLabel={t("retry")} />
        ) : (
          <FlyersConfigurator initialCatalogue={catalogue} initialConfiguration={configuration} />
        )}
      </main>
      <div className="single-screen-hide shrink-0">
        <SiteFooter />
      </div>
    </div>
  );
}
