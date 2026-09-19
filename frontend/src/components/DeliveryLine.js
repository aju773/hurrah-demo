"use client";

import { useTranslations } from "next-intl";
import { deliveryParts } from "@/lib/clock";

/** "Approve in 1h 24m for delivery Tue 22 Sep, 15:00–20:00 (Dubai)" in the
 * viewer's language. With the Commerce switch off no address is collected, so
 * it reads "for ready …" instead. The countdown and window stay left-to-right inside an
 * Arabic sentence (spec: countdown isolated LTR). */
export default function DeliveryLine({ clock, secondsLeft, locale, className, commerceEnabled = true }) {
  const t = useTranslations("Clock");
  const parts = deliveryParts(clock, secondsLeft, locale, t("by"));
  return (
    <span className={className}>
      {t.rich(commerceEnabled ? "deliveryLine" : "readyLine", { ...parts, ltr: (chunks) => <bdi dir="ltr">{chunks}</bdi> })}
    </span>
  );
}
