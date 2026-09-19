"use client";

import { useTranslations } from "next-intl";
import { deliveryParts } from "@/lib/clock";

/** "Approve in 1h 24m for delivery Tue 22 Sep, 15:00–20:00 (Dubai)" in the
 * viewer's language. The countdown and window stay left-to-right inside an
 * Arabic sentence (spec: countdown isolated LTR). */
export default function DeliveryLine({ clock, secondsLeft, locale, className }) {
  const t = useTranslations("Clock");
  const parts = deliveryParts(clock, secondsLeft, locale, t("by"));
  return (
    <span className={className}>
      {t.rich("deliveryLine", { ...parts, ltr: (chunks) => <bdi dir="ltr">{chunks}</bdi> })}
    </span>
  );
}
