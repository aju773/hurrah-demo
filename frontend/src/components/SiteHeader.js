import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LocaleControls from "@/components/LocaleControls";

// Site chrome: the logo home and the language toggle, nothing that goes nowhere.
// `end` adds one more control at the end of the row (the journey's "Show hints",
// part of the Single-screen shared frame in CONTEXT.md); other pages leave it out.
export default function SiteHeader({ end }) {
  const t = useTranslations("SiteHeader");

  return (
    <header className="shrink-0 flex items-center justify-between gap-[12px] bg-white px-[16px] sm:px-[32px] py-[12px]">
      <Link href="/flyers" className="tap inline-flex items-center text-[#e51937] text-[26px] font-extrabold tracking-[-0.5px]">
        {t("brand")}
      </Link>
      <div className="flex items-center gap-[16px]">
        <LocaleControls />
        {end}
      </div>
    </header>
  );
}
