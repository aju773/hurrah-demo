"use client";

import { useTranslations } from "next-intl";
import useCutoffCountdown from "@/lib/useCutoffCountdown";

/** The Artwork page's quiet reminder that time matters: "Same-day: order by 11:00".
 * It still runs the Cut-off clock underneath, so passing the Cut-off re-checks the
 * Turnaround (onExpire) without a countdown on screen. */
export default function CutoffLine({ clock, turnaroundLabel, onExpire, className }) {
  const t = useTranslations("Clock");
  useCutoffCountdown(clock, onExpire);
  if (!clock.cutoff_time) return null;

  return (
    <span className={className ?? "text-[#575c64] text-[12px]"}>
      {t.rich("cutoffLine", {
        turnaround: turnaroundLabel,
        time: clock.cutoff_time,
        ltr: (chunks) => <bdi dir="ltr">{chunks}</bdi>,
      })}
    </span>
  );
}
