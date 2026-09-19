import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CopyButton from "@/components/CopyButton";
import LocaleControls from "@/components/LocaleControls";
import OrderStatusBanner from "@/components/OrderStatusBanner";
import { isolateLtr } from "@/lib/bidi";
import { API_BASE_URL } from "@/lib/api";
import { fetchCommerceEnabled } from "@/lib/commerce";

async function getOrder(token, locale) {
  const res = await fetch(`${API_BASE_URL}/api/orders/${token}/?locale=${locale}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

async function getWhatsappNumber() {
  const res = await fetch(`${API_BASE_URL}/api/design-requests/settings/`, { cache: "no-store" });
  if (!res.ok) return "";
  const data = await res.json();
  return data.whatsapp_number ?? "";
}

function whatsappUrl(number, text) {
  const digits = (number || "").replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export default async function OrderConfirmationPage({ params }) {
  const { token } = await params;
  const locale = await getLocale();
  const t = await getTranslations("OrderConfirmation");
  const [order, whatsappNumber, commerceEnabled] = await Promise.all([
    getOrder(token, locale),
    getWhatsappNumber(),
    fetchCommerceEnabled(),
  ]);

  if (!order) {
    return (
      <div className="relative mx-auto bg-[#f9f9ff]" style={{ maxWidth: "1512px" }}>
        <SiteHeader commerceEnabled={commerceEnabled} />
        <div className="flex flex-col items-center justify-center gap-[16px] px-[32px] py-[64px]">
          <h1 className="text-[#151c27] text-[20px] font-bold">{t("notFound")}</h1>
          <Link href="/flyers" className="bg-[#e51937] px-[24px] py-[12px] rounded-[12px] text-white text-[14px] font-semibold">
            {t("orderMore")}
          </Link>
        </div>
        <SiteFooter commerceEnabled={commerceEnabled} />
      </div>
    );
  }

  const line = order.line;

  return (
    <div className="relative mx-auto bg-[#f9f9ff]" style={{ maxWidth: "1512px" }} dir={locale === "ar" ? "rtl" : "ltr"}>
      <SiteHeader commerceEnabled={commerceEnabled} />
      <div className="flex flex-col gap-[20px] px-[32px] py-[26px] w-full max-w-[720px] mx-auto">
        <div className="flex justify-end">
          <LocaleControls />
        </div>

        <div className="flex items-center justify-between gap-[12px]">
          <h1 className="text-[#151c27] text-[22px] font-bold">{t("received", { number: isolateLtr(order.number) })}</h1>
          <div className="flex items-center gap-[8px]">
            <CopyButton text={order.number} label={t("copy")} copiedLabel={t("copied")} />
            <CopyButton copyPageLink label={t("copyLink")} copiedLabel={t("copied")} />
          </div>
        </div>

        <OrderStatusBanner token={token} locale={locale} initialMessage={order.status_message} />

        {line && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px]">
            {line.front_thumbnail_url && (
              <img src={line.front_thumbnail_url} alt={t("front")} className="rounded-[12px] bg-[#f0f3ff] w-full" />
            )}
            {line.back_thumbnail_url && (
              <img src={line.back_thumbnail_url} alt={t("back")} className="rounded-[12px] bg-[#f0f3ff] w-full" />
            )}
          </div>
        )}

        {line && (
          <div className="bg-white rounded-[16px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] overflow-clip">
            <div className="bg-[#2a313d] px-[16px] py-[12px]">
              <span className="text-[#ebf1ff] text-[16px] font-semibold">{t("configuration")}</span>
            </div>
            <div className="flex flex-col gap-[6px] p-[16px]">
              {line.configuration?.map((c) => (
                <div key={c.name} className="flex items-center justify-between">
                  <span className="text-[#5d3f3e] text-[12px]">{c.name}</span>
                  <span className="text-[#151c27] text-[12px] font-semibold">{c.label}</span>
                </div>
              ))}
              {commerceEnabled && (
                <>
                  <div className="h-px bg-[#f0f3ff] my-[4px]" />
                  <div className="flex items-center justify-between">
                    <span className="text-[#5d3f3e] text-[12px]">{t("delivery")}</span>
                    <span className="text-[#151c27] text-[12px] font-semibold">{t("free")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#5d3f3e] text-[12px]">{t("payment")}</span>
                    <span className="text-[#151c27] text-[12px] font-semibold">{t("payOnDelivery")}</span>
                  </div>
                  <div className="flex items-center justify-between pt-[8px]">
                    <span className="text-[#151c27] text-[16px] font-bold">{t("total")}</span>
                    <span className="text-[#bb0027] text-[24px] font-extrabold">{t("aed", { amount: line.total_aed })}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] p-[16px] flex flex-col gap-[4px]">
          <span className="text-[#151c27] text-[14px] font-semibold">{t(commerceEnabled ? "deliverTo" : "contact")}</span>
          <span className="text-[#575c64] text-[13px]">{order.name}</span>
          <span className="text-[#575c64] text-[13px]">
            <bdi dir="ltr">{order.mobile}</bdi>
          </span>
          {commerceEnabled && (
            <span className="text-[#575c64] text-[13px]">{order.area} — {order.address_line}</span>
          )}
        </div>

        <div className="flex items-center gap-[12px] bg-[#f0f3ff] rounded-[12px] p-[12px]">
          <span className="text-[#5d3f3e] text-[12px] font-semibold">{t("needChanges")}</span>
          {whatsappNumber && (
            <a
              href={whatsappUrl(whatsappNumber, t("whatsappPrefill", { number: order.number }))}
              className="text-[#bb0027] text-[12px] font-bold underline"
            >
              {t("whatsapp")}
            </a>
          )}
        </div>

        <div className="flex items-center justify-end">
          <Link href="/flyers" className="h-[44px] px-[24px] rounded-[8px] text-[14px] font-semibold bg-[#e51937] text-white flex items-center">
            {t("orderMore")}
          </Link>
        </div>
      </div>
      <SiteFooter commerceEnabled={commerceEnabled} />
    </div>
  );
}
