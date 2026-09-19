import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// The cart is money-shaped, so it only shows with the Commerce switch on.
export default function SiteHeader({ commerceEnabled = false }) {
  const t = useTranslations("SiteHeader");

  return (
    <div className="relative w-full" style={{ height: "151px" }}>
      <div
        className="absolute bg-white"
        style={{ left: "4px", top: "91px", width: "1505px", height: "60px" }}
      ></div>

      <div
        className="absolute flex items-center"
        style={{ left: "107px", top: "12px", width: "1297px", height: "65px", gap: "167px" }}
      >
        <div className="shrink-0" style={{ width: "217px", height: "65px" }}>
          <img src="/assets/10b7e.png" className="w-full h-full object-cover" alt="Hurrah logo" />
        </div>
        <div className="flex flex-col items-start" style={{ maxWidth: "768px", width: "679px" }}>
          <div className="relative flex items-center h-[48px] w-full p-[2px] rounded-[8px] bg-[#f0f3ff]">
            <div className="flex-1 flex items-center px-[12px] min-w-0">
              <p className="text-[#575c64] text-[14px] leading-normal truncate">
                {t("searchPlaceholder")}
              </p>
            </div>
            <div className="bg-[#ffc72c] flex h-[40px] items-center justify-center px-[20px] rounded-[8px] shrink-0">
              <img src="/assets/9031c.svg" className="w-[15px] h-[15px]" alt="search" />
            </div>
            <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_2px_4px_0px_rgba(0,0,0,0.05)]"></div>
          </div>
        </div>
        {commerceEnabled && (
          <a href="#" className="relative shrink-0 block" style={{ width: "67px", height: "48px" }}>
            <div className="absolute inset-0 rounded-[7px] bg-[#f0f3ff] shadow-[inset_2px_3px_4px_0px_rgba(97,93,93,0.25)]"></div>
            <div className="absolute flex items-center justify-center inset-[8px]">
              <img src="/assets/e897f.svg" className="w-[26px] h-[24px] -scale-x-100" alt={t("cartAlt")} />
            </div>
          </a>
        )}
      </div>

      <div className="absolute" style={{ left: "100px", top: "107px" }}>
        <div className="relative" style={{ width: "125px" }}>
          <button className="relative h-[36px] w-full flex items-center gap-[4px] bg-[#ffc72c] px-[12px] rounded-[8px]">
            <img src="/assets/6c8c9.svg" className="w-[13.5px] h-[9px]" alt="" />
            <span className="text-[#6f5400] text-[12px] font-bold">{t("allCategories")}</span>
          </button>
          <div className="hidden absolute bg-[#f9f9ff] flex-col p-[6px] rounded-[4px] top-[45px] w-[196px] shadow-[8px_6px_4.5px_rgba(0,0,0,0.25)] z-20">
            <div className="border-[#f8e9e9] border-b-[0.5px] px-[10px] py-[5px] w-full text-[#171717] text-[12px] font-semibold">{t("categoryBusinessCards")}</div>
            <div className="border-[#f8e9e9] border-b-[0.5px] px-[10px] py-[5px] w-full text-[#171717] text-[12px] font-semibold">{t("categoryPremiumBusinessCards")}</div>
            <div className="border-[#f8e9e9] border-b-[0.5px] px-[10px] py-[5px] w-full text-[#171717] text-[12px] font-semibold">{t("categoryOfficialPapers")}</div>
            <div className="border-[#f8e9e9] border-b-[0.5px] px-[10px] py-[5px] w-full text-[#171717] text-[12px] font-semibold">{t("categoryBrochures")}</div>
            <div className="border-[#f8e9e9] border-b-[0.5px] px-[10px] py-[5px] w-full text-[#171717] text-[12px] font-semibold">{t("categoryFlyers")}</div>
            <div className="px-[10px] py-[5px] w-full text-[#171717] text-[12px] font-semibold">{t("categoryEnvelopes")}</div>
          </div>
        </div>
      </div>
      <nav className="absolute flex items-center gap-[12px]" style={{ left: "198px", top: "38px" }}>
        <Link href="/" className="px-[8px] py-[4px] rounded-[8px] text-[#5d3f3e] text-[14px]">{t("navHome")}</Link>
        <a href="#" className="px-[8px] py-[4px] rounded-[8px] text-[#5d3f3e] text-[12px]">{t("navDigitalMarketing")}</a>
        <span className="px-[8px] py-[4px] rounded-[8px] bg-[#e51937] text-white text-[12px] font-bold">{t("navOfflineMarketing")}</span>
        <a href="#" className="px-[8px] py-[4px] rounded-[8px] text-[#5d3f3e] text-[12px]">{t("navBranding")}</a>
        <span className="px-[8px] py-[4px] rounded-[8px] text-[#5d3f3e] text-[12px]">{t("navCorporateGifts")}</span>
        <span className="px-[8px] py-[4px] rounded-[8px] text-[#5d3f3e] text-[12px] whitespace-nowrap">{t("navPackaging")}</span>
        <span className="px-[8px] py-[4px] rounded-[8px] text-[#5d3f3e] text-[12px]">{t("navApparel")}</span>
        <span className="px-[8px] py-[4px] rounded-[8px] text-[#5d3f3e] text-[12px]">{t("navPrintEssentials")}</span>
      </nav>

      <div
        className="absolute flex items-center gap-[4px] bg-[#f0f3ff] px-[12px] py-[4px] rounded-[8px]"
        style={{ left: "1209px", top: "109px" }}
      >
        <img src="/assets/2dd47.svg" className="w-[16.5px] h-[16.5px]" alt="" />
        <span className="text-[#bb0027] text-[12px] font-bold whitespace-nowrap">{t("freeArtCheck")}</span>
      </div>
    </div>
  );
}
