import { useTranslations } from "next-intl";

export default function SiteFooter() {
  const t = useTranslations("SiteFooter");

  return (
    <footer className="bg-white flex flex-col gap-[6px] px-[16px] sm:px-[32px] py-[24px] w-full">
      <p className="text-[#5d3f3e] text-[14px] leading-[20px]">{t("tagline")}</p>
      <p className="text-[#151c27] text-[12px] leading-[16px]">
        {t("licensed")} • {t("location")}
      </p>
    </footer>
  );
}
