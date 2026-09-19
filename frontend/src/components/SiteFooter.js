import { useTranslations } from "next-intl";

export default function SiteFooter({ commerceEnabled = false }) {
  const t = useTranslations("SiteFooter");

  return (
    <footer className="bg-white flex gap-[32px] items-start justify-center px-[25px] py-[40px] w-full flex-wrap">
      <div className="flex flex-col gap-[12px]" style={{ width: "217px" }}>
        <img src="/assets/10b7e.png" className="h-[65px] w-[217px] object-cover" alt="Hurrah logo" />
        <p className="text-[#5d3f3e] text-[14px] leading-[20px]">
          {t("tagline")}
        </p>
        <div className="flex gap-[4px] items-center pt-[4px]">
          <img src="/assets/3f25d.svg" className="w-[12px] h-[15px]" alt="" />
          <p className="text-[#151c27] text-[12px] leading-[16px]">
            {t("licensed")} •<br />{t("location")}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-[16px]" style={{ width: "217px" }}>
        <h4 className="text-[#151c27] text-[16px] font-semibold tracking-[-0.16px]">{t("aboutHeading")}</h4>
        <div className="flex flex-col gap-[8px] text-[#5d3f3e] text-[14px]">
          <a href="#">{t("aboutOurStory")}</a>
          <a href="#">{t("aboutProductionQuality")}</a>
          <a href="#">{t("aboutSustainability")}</a>
          <a href="#">{t("aboutCareers")}</a>
          <a href="#">{t("aboutPress")}</a>
        </div>
      </div>
      <div className="flex flex-col gap-[16px]" style={{ width: "217px" }}>
        <h4 className="text-[#151c27] text-[16px] font-semibold tracking-[-0.16px]">{t("shopHeading")}</h4>
        <div className="flex flex-col gap-[8px] text-[#5d3f3e] text-[14px]">
          <a href="#">{t("shopCorporateGifts")}</a>
          <a href="#">{t("shopRigidPackaging")}</a>
          <a href="#">{t("shopApparel")}</a>
          <a href="#">{t("shopExhibition")}</a>
          <a href="#">{t("shopCatalog")}</a>
        </div>
      </div>
      <div className="flex flex-col gap-[16px]" style={{ width: "217px" }}>
        <h4 className="text-[#151c27] text-[16px] font-semibold tracking-[-0.16px]">{t("businessHeading")}</h4>
        <div className="flex flex-col gap-[8px] text-[#5d3f3e] text-[14px]">
          <a href="#">{t("businessEnterprise")}</a>
          <a href="#">{t("businessProcurement")}</a>
          <a href="#">{t("businessWholesale")}</a>
          <a href="#">{t("businessArtworkGuidelines")}</a>
          <a href="#">{t("businessSampleKit")}</a>
        </div>
      </div>
      <div className="flex flex-col gap-[16px]" style={{ width: "217px" }}>
        <h4 className="text-[#151c27] text-[16px] font-semibold tracking-[-0.16px]">{t("serviceHeading")}</h4>
        <div className="flex flex-col gap-[8px] text-[#5d3f3e] text-[14px]">
          <a href="#">{t("serviceTrackOrder")}</a>
          <a href="#">{t("serviceShipping")}</a>
          <a href="#">{t("serviceReturns")}</a>
          {commerceEnabled && <a href="#">{t("servicePayment")}</a>}
          <a href="#">{t("serviceHelpCenter")}</a>
        </div>
      </div>
    </footer>
  );
}
