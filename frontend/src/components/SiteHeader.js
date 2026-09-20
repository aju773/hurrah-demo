import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LocaleControls from "@/components/LocaleControls";

// Site chrome: the logo home and the language toggle, nothing that goes nowhere.
export default function SiteHeader() {
  const t = useTranslations("SiteHeader");

  return (
    <header className="flex items-center justify-between gap-[12px] bg-white px-[16px] sm:px-[32px] py-[12px]">
      <Link href="/flyers" className="tap inline-flex items-center text-[#e51937] text-[26px] font-extrabold tracking-[-0.5px]">
        {t("brand")}
      </Link>
      <LocaleControls />
    </header>
  );
}
